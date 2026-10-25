/* services/chats.js — arkadaşlar, arkadaşlık istekleri, kullanıcı arama */
import { sb } from '../supabase.js';

export async function fetchChats() {
  const { data, error } = await sb.rpc('get_chats');
  if (error) throw error;
  return data || [];
}

/** Kullanıcı adına göre arar. Döndürür: { id, username, avatar_path, relation, request_id } */
export async function searchUsers(query) {
  const { data, error } = await sb.rpc('search_users', { p_query: query });
  if (error) throw error;
  return data || [];
}

/** Arkadaşlık isteği gönderir. Dönüş: 'outgoing' | 'friend' */
export async function sendFriendRequest(receiverId) {
  const { data, error } = await sb.rpc('send_friend_request', { p_receiver: receiverId });
  if (error) throw error;
  return data;
}

/** Arkadaşlık isteğini kabul eder veya reddeder */
export async function respondFriendRequest(requestId, accept) {
  const { error } = await sb.rpc('respond_friend_request', { p_request: requestId, p_accept: accept });
  if (error) throw error;
}

/** Gönderilen arkadaşlık isteğini iptal eder */
export async function cancelFriendRequest(requestId) {
  const { error } = await sb.rpc('cancel_friend_request', { p_request: requestId });
  if (error) throw error;
}

/** Bekleyen arkadaşlık isteklerini (gelen + giden) getirir */
export async function fetchRequests() {
  const { data, error } = await sb.rpc('get_requests');
  if (error) throw error;
  return data || [];
}
