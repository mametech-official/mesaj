/* services/profiles.js — profil okuma, güncelleme ve son görülme */
import { sb } from '../supabase.js';

export async function fetchProfile(id) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function updateProfileAvatar(id, avatarPath) {
  const { data, error } = await sb.from('profiles').update({ avatar_path: avatarPath }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function updateProfileAbout(id, about) {
  const { data, error } = await sb.from('profiles').update({ about }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function blockUser(targetId) {
  const { error } = await sb.rpc('block_user', { p_target: targetId });
  if (error) throw error;
}

export async function unblockUser(targetId) {
  const { error } = await sb.rpc('unblock_user', { p_target: targetId });
  if (error) throw error;
}

export async function fetchBlockedUsers() {
  const { data, error } = await sb.rpc('get_blocked_users');
  if (error) {
    console.warn('get_blocked_users:', error.message);
    return [];
  }
  return data || [];
}

export async function fetchLastSeen(id) {
  const { data } = await sb.from('profiles').select('last_seen').eq('id', id).maybeSingle();
  return data?.last_seen || null;
}

export async function touchLastSeen(id) {
  const { error } = await sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', id);
  if (error) console.warn('last_seen güncellenemedi:', error.message);
}
