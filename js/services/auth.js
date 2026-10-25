/* services/auth.js — kimlik doğrulama */
import { sb } from '../supabase.js';

export async function isUsernameAvailable(username) {
  const { data, error } = await sb.rpc('username_available', { p_username: username });
  if (error) throw error;
  return !!data;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** @returns {{needsConfirmation: boolean}} */
export async function signUp({ email, password, username }) {
  if (!(await isUsernameAvailable(username))) throw new Error('Bu kullanıcı adı zaten alınmış.');
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
  if (error) throw error;
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error('Bu e-posta ile zaten bir hesap var.');
  }
  return { needsConfirmation: !data.session };
}

export async function signOut() {
  await sb.auth.signOut();
}

/**
 * Not: onAuthStateChange içinde doğrudan await ile Supabase çağrısı yapmak
 * kilitlenmeye yol açabildiğinden geri çağrı setTimeout ile dışarı alınır.
 */
export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((event, session) => setTimeout(() => cb(event, session), 0));
}
