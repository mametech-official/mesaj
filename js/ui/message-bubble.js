/* =====================================================================
 *  ui/message-bubble.js — v6 Zengin Mesaj Balonu:
 *  Markdown, Spoiler, Anket, Yapılacaklar, Mini Oyunlar, Konum, Çeviri,
 *  Çift Tıklama Kalp (#18), Sürükleyerek Yanıtlama (#14), Sabitleme (#35),
 *  İletme (#34), Hatırlatıcı (#76), Tepki, Yıldız, Silme ve Düzenleme
 * ===================================================================== */
import { el, fmtTime, isEmojiOnly, fmtSize } from '../utils.js';
import { CONFIG } from '../config.js';
import { icon } from './icons.js';
import { getSignedUrl } from '../services/storage.js';
import { createAudioPlayer } from './audio-player.js';
import { openLightbox } from './lightbox.js';
import { renderRichMessageBody, translateMessageText } from './rich-content.js';
import { triggerBigHeart } from './fx.js';
import { toast } from './toast.js';

let activeMenu = null;

function closeActiveMenu() {
  if (!activeMenu) return;
  const r = activeMenu.closest('.msg-row');
  if (r) {
    r.classList.remove('has-menu');
    r.style.zIndex = '';
  }
  activeMenu.remove();
  activeMenu = null;
}

document.addEventListener('click', (e) => {
  if (activeMenu && !e.target.closest('.msg-menu') && !e.target.closest('.bubble-more-btn')) {
    closeActiveMenu();
  }
});

export function renderTick(m) {
  const t = el('span', 'tick');
  if (m.read_at) {
    t.classList.add('read');
    t.title = 'Okundu';
    t.innerHTML = icon('doubleCheck');
  } else if (m.delivered_at) {
    t.classList.add('delivered');
    t.title = 'İletildi';
    t.innerHTML = icon('doubleCheck');
  } else {
    t.classList.add('sent');
    t.title = 'İletiliyor';
    t.innerHTML = icon('check');
  }
  return t;
}

function buildImage(path, onLoad) {
  const wrap = el('div', 'img-wrap skeleton');
  const img = el('img');
  img.alt = 'Fotoğraf';
  img.decoding = 'async';
  const fail = () => {
    wrap.className = 'img-wrap img-error';
    wrap.replaceChildren(document.createTextNode('Fotoğraf yüklenemedi'));
  };
  img.addEventListener('load', () => {
    wrap.classList.remove('skeleton');
    img.classList.add('ready');
    if (onLoad) onLoad();
  });
  img.addEventListener('error', fail);
  wrap.addEventListener('click', () => { if (img.classList.contains('ready')) openLightbox(img.src); });
  getSignedUrl(path).then((url) => { img.src = url; }).catch(fail);
  wrap.append(img);
  return wrap;
}

function buildVideo(m, onLoad) {
  const wrap = el('div', 'video-wrap');
  const video = el('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  getSignedUrl(m.file_path).then((url) => {
    video.src = url;
    if (onLoad) onLoad();
  }).catch(() => {
    wrap.className = 'video-wrap img-error';
    wrap.textContent = 'Video yüklenemedi';
  });
  wrap.append(video);
  return wrap;
}

function buildDocument(m) {
  const card = el('div', 'doc-card');
  const iconWrap = el('div', 'doc-icon');
  iconWrap.innerHTML = icon('document');
  const info = el('div', 'doc-info');
  const name = el('div', 'doc-name', m.file_name || 'Belge');
  const sz = m.file_size ? fmtSize(m.file_size) : '';
  const sizeEl = el('div', 'doc-size', sz);
  info.append(name, sizeEl);

  const dlBtn = el('button', 'doc-dl-btn');
  dlBtn.type = 'button';
  dlBtn.title = 'İndir';
  dlBtn.innerHTML = icon('download');
  dlBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      dlBtn.classList.add('loading');
      const url = await getSignedUrl(m.file_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = m.file_name || 'belge';
      a.target = '_blank';
      document.body.append(a);
      a.click();
      a.remove();
    } catch {
      toast('Belge indirilemedi.');
    } finally {
      dlBtn.classList.remove('loading');
    }
  });

  card.append(iconWrap, info, dlBtn);
  return card;
}

function buildQuotePreview(quoted, onJump) {
  const card = el('div', 'quote-card');
  const body = el('div', 'quote-body');
  const author = el('div', 'quote-author', quoted ? quoted.authorName : 'Mesaj');
  const snippet = el('div', 'quote-snippet', quoted ? quoted.snippet : 'Alıntılanan mesaj');
  body.append(author, snippet);
  card.append(body);
  if (onJump) card.addEventListener('click', (e) => { e.stopPropagation(); onJump(); });
  return card;
}

function renderReactions(reactions, meId, onToggle) {
  if (!reactions || !reactions.length) return null;

  // Her kullanıcının en fazla TEK bir aktif reaksiyonu olabilir (Mükerrerleri tekilleştir)
  const userLatestMap = new Map();
  reactions.forEach(r => {
    if (!r || !r.emoji) return;
    const uKey = r.user_id || 'anonim';
    const prev = userLatestMap.get(uKey);
    if (!prev || (r.created_at && (!prev.created_at || new Date(r.created_at) >= new Date(prev.created_at)))) {
      userLatestMap.set(uKey, r);
    }
  });

  const cleanReactions = Array.from(userLatestMap.values());
  if (!cleanReactions.length) return null;

  const groups = new Map();
  cleanReactions.forEach(r => {
    const arr = groups.get(r.emoji) || [];
    arr.push(r);
    groups.set(r.emoji, arr);
  });

  const row = el('div', 'reaction-row');
  groups.forEach((list, emoji) => {
    const mine = list.some(r => r.user_id === meId);
    const pill = el('button', `reaction-pill${mine ? ' mine' : ''}`);
    pill.type = 'button';
    pill.innerHTML = `<span>${emoji}</span>${list.length > 1 ? `<span class="r-count">${list.length}</span>` : ''}`;
    pill.title = `${list.length} tepki${mine ? ' (Kaldırmak için tıkla)' : ''}`;
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onToggle) onToggle(emoji);
    });
    row.append(pill);
  });
  return row;
}

export function createMessageEl(m, {
  meId, meUsername, first, animate, onMediaLoad, onReply, onEdit, onDelete, onDeleteLocal,
  onReact, onStar, onForward, onPin, onUpdateRichWidget, isStarred, reactions, quotedMsg, onJumpToQuote
}) {
  const mine = m.sender_id === meId;
  const row = el('div', `msg-row ${mine ? 'out' : 'in'}${first ? ' first' : ''}${animate ? ' anim' : ''}`);
  row.dataset.id = m.id;

  const bubble = el('div', 'bubble');

  // Silinmiş mesaj durumu
  if (m.is_deleted) {
    bubble.classList.add('is-deleted');
    bubble.innerHTML = `<span class="ico-inline">${icon('ban')} Bu mesaj silindi</span>`;
    const meta = el('div', 'meta');
    meta.append(el('span', 'time', fmtTime(m.created_at)));
    bubble.append(meta);
    row.append(bubble);
    return row;
  }

  // Çift Tıklama ile Dev 3B Kalp + ❤️ Tepkisi (#18)
  bubble.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, a, input')) return;
    triggerBigHeart(bubble);
    if (onReact) onReact(m, '❤️');
  });

  // Sürükleyerek Yanıtlama (Swipe-to-Reply) (#14)
  let startX = null;
  bubble.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    startX = e.clientX;
  }, { passive: true });
  bubble.addEventListener('pointerup', (e) => {
    if (startX !== null && e.clientX - startX > 75) {
      if (onReply) onReply(m);
    }
    startX = null;
  }, { passive: true });

  // 1. Yanıt (Alıntı) Önizleme Kartı
  if (m.reply_to_id) {
    bubble.append(buildQuotePreview(quotedMsg, () => {
      if (onJumpToQuote) onJumpToQuote(m.reply_to_id);
    }));
  }

  // 2. Medya İçeriği
  if (m.image_path) bubble.append(buildImage(m.image_path, onMediaLoad));
  if (m.audio_path) {
    bubble.append(createAudioPlayer({
      getSrc: () => getSignedUrl(m.audio_path),
      durationMs: m.audio_duration_ms || 0,
      seed: m.id,
    }));
  }
  if (m.media_type === 'video' && m.file_path) bubble.append(buildVideo(m, onMediaLoad));
  if (m.media_type === 'document' && m.file_path) bubble.append(buildDocument(m));

  // 3. Zengin Metin ve İnteraktif Widget'lar (#31-#40, #59, #77)
  if (m.content) {
    const isEmo = !m.image_path && !m.audio_path && !m.file_path && !m.content.startsWith('[') && isEmojiOnly(m.content);
    if (isEmo) {
      bubble.append(el('div', 'text emoji-only', m.content));
    } else {
      const richFrag = renderRichMessageBody(m, {
        meId,
        meUsername: meUsername || 'ben',
        onUpdateMessage: (msgObj, newContent) => {
          if (onUpdateRichWidget) onUpdateRichWidget(msgObj, newContent);
        },
      });
      bubble.append(richFrag);
    }
  }
  if ((m.image_path || m.file_path) && !m.content) bubble.classList.add('media-only');

  // 4. Meta Bilgileri (Saat, Düzenlendi, Yıldız, Tik)
  const meta = el('div', 'meta');
  if (m.edited_at) meta.append(el('span', 'edited-badge', '(düzenlendi)'));
  if (isStarred) {
    const starEl = el('span', 'star-icon');
    starEl.innerHTML = icon('star');
    meta.append(starEl);
  }
  meta.append(el('span', 'time', fmtTime(m.created_at)));
  if (mine) {
    const tickWrap = el('span', 'tick-wrap');
    tickWrap.append(renderTick(m));
    meta.append(tickWrap);
  }
  bubble.append(meta);

  // 5. Tepkiler (Reactions)
  const reactEl = renderReactions(reactions, meId, (emoji) => {
    if (onReact) onReact(m, emoji);
  });
  if (reactEl) bubble.append(reactEl);

  // 6. Eylem Butonu (Seçenekler Menüsü)
  const moreBtn = el('button', 'bubble-more-btn');
  moreBtn.type = 'button';
  moreBtn.title = 'Seçenekler';
  moreBtn.innerHTML = icon('down');
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeMenu) { closeActiveMenu(); return; }

    const menu = el('div', 'msg-menu');
    row.classList.add('has-menu');
    row.style.zIndex = '100';

    const bRect = bubble.getBoundingClientRect();
    if (window.innerHeight - bRect.bottom < 260 && bRect.top > 260) {
      menu.classList.add('open-up');
    }

    // Hızlı tepki ikonları satırı (Kullanıcının aktif tepkisini seçili gösterir)
    const reactBar = el('div', 'quick-react-bar');
    const myCurrentEmoji = reactions?.find(r => r.user_id === meId)?.emoji;
    CONFIG.REACTIONS.forEach(em => {
      const isSelected = myCurrentEmoji === em;
      const b = el('button', `btn-react${isSelected ? ' selected' : ''}`, em);
      b.type = 'button';
      b.title = isSelected ? `${em} (Tepkiyi kaldır)` : `${em} ile tepki ver`;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (onReact) onReact(m, em);
        closeActiveMenu();
      });
      reactBar.append(b);
    });
    menu.append(reactBar);

    // Yanıtla
    const replyBtn = el('button', '');
    replyBtn.innerHTML = `${icon('reply')} <span>Yanıtla</span>`;
    replyBtn.addEventListener('click', () => {
      if (onReply) onReply(m);
      closeActiveMenu();
    });
    menu.append(replyBtn);

    // İlet (#34)
    if (m.content) {
      const fwdBtn = el('button', '');
      fwdBtn.innerHTML = `${icon('forward')} <span>Başkasına İlet</span>`;
      fwdBtn.addEventListener('click', () => {
        if (onForward) onForward(m);
        closeActiveMenu();
      });
      menu.append(fwdBtn);
    }

    // Sohbet Üstüne Sabitle (#35)
    const pinBtn = el('button', '');
    pinBtn.innerHTML = `${icon('pin')} <span>Sohbete Sabitle</span>`;
    pinBtn.addEventListener('click', () => {
      if (onPin) onPin(m);
      closeActiveMenu();
    });
    menu.append(pinBtn);

    // Yıldızla
    const starBtn = el('button', '');
    starBtn.innerHTML = `${icon(isStarred ? 'star' : 'starBorder')} <span>${isStarred ? 'Yıldızı Kaldır' : 'Yıldızla'}</span>`;
    starBtn.addEventListener('click', () => {
      if (onStar) onStar(m);
      closeActiveMenu();
    });
    menu.append(starBtn);

    // Anlık Çeviri (#73)
    if (m.content && !m.content.startsWith('[')) {
      const trBtn = el('button', '');
      trBtn.innerHTML = `${icon('globe')} <span>Türkçeye Çevir</span>`;
      trBtn.addEventListener('click', async () => {
        closeActiveMenu();
        toast('Çevriliyor…');
        const translated = await translateMessageText(m.content);
        const trBox = el('div', 'rc-translated-box');
        trBox.innerHTML = `<span class="ico-inline">${icon('globe')} ${translated}</span>`;
        bubble.append(trBox);
      });
      menu.append(trBtn);
    }

    // Hatırlatıcı Kur (#76)
    const remBtn = el('button', '');
    remBtn.innerHTML = `${icon('alarm')} <span>Bana Hatırlat (1 dk)</span>`;
    remBtn.addEventListener('click', () => {
      closeActiveMenu();
      toast('Hatırlatıcı kuruldu (1 dakika sonra bildirim alacaksınız).');
      setTimeout(() => {
        toast(`Hatırlatma: "${(m.content || 'Medya mesajı').slice(0, 50)}"`);
      }, 60000);
    });
    menu.append(remBtn);

    // Düzenle (Yalnızca kendi metin mesajı ise)
    if (mine && m.content && !m.image_path && !m.audio_path) {
      const editBtn = el('button', '');
      editBtn.innerHTML = `${icon('edit')} <span>Düzenle</span>`;
      editBtn.addEventListener('click', () => {
        if (onEdit) onEdit(m);
        closeActiveMenu();
      });
      menu.append(editBtn);
    }

    // Herkesten Sil (Yalnızca kendi mesajı ise)
    if (mine) {
      const delAllBtn = el('button', 'danger');
      delAllBtn.innerHTML = `${icon('trash')} <span>Herkesten Sil</span>`;
      delAllBtn.addEventListener('click', () => {
        if (confirm('Bu mesaj herkesten silinsin mi?')) {
          if (onDelete) onDelete(m);
        }
        closeActiveMenu();
      });
      menu.append(delAllBtn);
    }

    // Benden Sil
    const delMeBtn = el('button', '');
    delMeBtn.innerHTML = `${icon('close')} <span>Benden Sil</span>`;
    delMeBtn.addEventListener('click', () => {
      row.classList.add('fx-dissolve');
      setTimeout(() => { if (onDeleteLocal) onDeleteLocal(m); }, 320);
      closeActiveMenu();
    });
    menu.append(delMeBtn);

    bubble.append(menu);
    activeMenu = menu;
  });
  bubble.append(moreBtn);

  row.append(bubble);
  return row;
}

export function updateRowTick(row, m) {
  const wrap = row && row.querySelector('.tick-wrap');
  if (!wrap) return;
  wrap.replaceChildren(renderTick(m));
}
