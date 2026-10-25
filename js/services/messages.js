/* services/messages.js — mesaj okuma / gönderme / iletildi & okundu işaretleme */
import { sb } from '../supabase.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { uploadMedia, removeMedia } from './storage.js';

export async function fetchMessages(meId, otherId, before) {
  let q = sb.from('messages').select('*')
    .or(`and(sender_id.eq.${meId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${meId})`)
    .order('created_at', { ascending: false })
    .limit(CONFIG.PAGE_SIZE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).reverse();
}

/**
 * @param {{me:{id:string}, to:string, content?:string, image?:File, audio?:{blob:Blob, durationMs:number}, onProgress?:(percent:number)=>void}} p
 */
export async function sendMessage({ me, to, content, image, audio, video, document, replyToId, onProgress }) {
  const text = content && content.trim() ? content.trim() : null;
  const uploaded = [];
  let imagePath = null, audioPath = null, audioMs = null, filePath = null, fileName = null, fileSize = null, mediaType = 'text';

  try {
    if (image) {
      if (onProgress) onProgress(20);
      imagePath = await uploadMedia(me.id, image, {
        ext: CONFIG.IMAGE_EXT[image.type] || 'jpg', contentType: image.type,
      });
      uploaded.push(imagePath);
      mediaType = 'image';
      if (onProgress) onProgress(75);
    } else if (audio) {
      const base = (audio.blob.type || 'audio/webm').split(';')[0];
      audioPath = await uploadMedia(me.id, audio.blob, {
        ext: CONFIG.AUDIO_EXT[base] || 'webm', contentType: base,
      });
      uploaded.push(audioPath);
      audioMs = Math.round(audio.durationMs);
      mediaType = 'audio';
    } else if (video) {
      if (onProgress) onProgress(25);
      const ext = CONFIG.VIDEO_EXT[video.type] || (video.name.split('.').pop() || 'mp4');
      filePath = await uploadMedia(me.id, video, { ext, contentType: video.type || 'video/mp4' });
      uploaded.push(filePath);
      fileName = video.name;
      fileSize = video.size;
      mediaType = 'video';
      if (onProgress) onProgress(80);
    } else if (document) {
      if (onProgress) onProgress(25);
      const parts = document.name.split('.');
      const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin';
      filePath = await uploadMedia(me.id, document, { ext, contentType: document.type || 'application/octet-stream' });
      uploaded.push(filePath);
      fileName = document.name;
      fileSize = document.size;
      mediaType = 'document';
      if (onProgress) onProgress(80);
    }

    if (onProgress) onProgress(90);
    const payload = {
      sender_id: me.id,
      receiver_id: to,
      content: text,
      image_path: imagePath,
      audio_path: audioPath,
      audio_duration_ms: audioMs,
      file_path: filePath,
      file_name: fileName,
      file_size: fileSize,
      media_type: mediaType,
      reply_to_id: replyToId || null,
    };
    let { data, error } = await sb.from('messages').insert(payload).select().single();
    if (error && error.message && error.message.includes('column')) {
      const fallback = {
        sender_id: me.id,
        receiver_id: to,
        content: text,
        image_path: imagePath,
        audio_path: audioPath,
        audio_duration_ms: audioMs,
      };
      ({ data, error } = await sb.from('messages').insert(fallback).select().single());
    }
    if (error) throw error;
    if (onProgress) onProgress(100);
    return data;
  } catch (err) {
    if (uploaded.length) await removeMedia(uploaded).catch(() => {});
    throw err;
  }
}

export async function deleteMessageForEveryone(messageId) {
  const { error } = await sb.rpc('delete_message_for_everyone', { p_message_id: messageId });
  if (error) throw error;
}

export async function editMessage(messageId, newContent) {
  const { error } = await sb.rpc('edit_message_content', { p_message_id: messageId, p_new_content: newContent });
  if (error) throw error;
}

export async function toggleReaction(messageId, emoji) {
  const meId = state.me?.id;
  if (!meId) {
    const { data, error } = await sb.rpc('toggle_message_reaction', { p_message_id: messageId, p_emoji: emoji });
    if (error) throw error;
    return data;
  }

  // 1. Kullanıcının bu mesajdaki mevcut tepkilerini al
  const { data: existing, error: fetchErr } = await sb
    .from('message_reactions')
    .select('id, emoji')
    .eq('message_id', messageId)
    .eq('user_id', meId);

  if (!fetchErr && existing) {
    const exactMatch = existing.find(r => r.emoji === emoji);

    // Eğer zaten AYNI emojiye tıklandıysa -> Tepkiyi tamamen kaldır
    if (exactMatch) {
      const { error: delErr } = await sb
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', meId);
      if (delErr) throw delErr;
      return false;
    }

    // Farklı bir emojiye tıklandıysa (veya hiç yoksa) ->
    // Kullanıcının bu mesajdaki TÜM eski tepkilerini temizle (Sadece tek çeşit kuralı)
    if (existing.length > 0) {
      const { error: delErr } = await sb
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', meId);
      if (delErr) {
        console.warn('Eski tepkileri temizleme uyarısı:', delErr.message);
      }
    }

    // Yalnızca yeni seçilen tekil emojiyi ekle
    const { error: insErr } = await sb
      .from('message_reactions')
      .insert({
        message_id: messageId,
        user_id: meId,
        emoji: emoji,
      });
    if (insErr) throw insErr;
    return true;
  }

  // Fallback: RPC
  const { data, error } = await sb.rpc('toggle_message_reaction', { p_message_id: messageId, p_emoji: emoji });
  if (error) throw error;
  return data;
}

export async function fetchReactions(messageIds) {
  if (!messageIds || !messageIds.length) return [];
  const { data, error } = await sb.from('message_reactions')
    .select('id, message_id, user_id, emoji, created_at')
    .in('message_id', messageIds);
  if (error) { console.warn('fetchReactions:', error.message); return []; }
  return data || [];
}

export async function toggleStar(messageId) {
  const { data, error } = await sb.rpc('toggle_star_message', { p_message_id: messageId });
  if (error) throw error;
  return data;
}

export async function fetchStarred(chatUserId) {
  const { data, error } = await sb.rpc('get_starred_messages', { p_chat_user_id: chatUserId || null });
  if (error) throw error;
  return data || [];
}

export async function markDelivered() {
  const { error } = await sb.rpc('mark_messages_delivered');
  if (error) console.warn('markDelivered:', error.message);
}

export async function markRead(otherId) {
  const { error } = await sb.rpc('mark_messages_read', { p_sender: otherId });
  if (error) console.warn('markRead:', error.message);
}
