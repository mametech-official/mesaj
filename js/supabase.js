/* =====================================================================
 *  supabase.js — tek Supabase istemci örneği
 * ===================================================================== */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';

const simId = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ios_sim') : null;
const authOpts = { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true };
if (simId === '2') {
  authOpts.storageKey = 'sb-mesaj-sim2-auth-token';
}

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: authOpts,
  realtime: { params: { eventsPerSecond: 20 } },
});
