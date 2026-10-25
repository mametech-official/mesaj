/* =====================================================================
 *  supabase.js — tek Supabase istemci örneği
 * ===================================================================== */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const simId = params ? (params.get('sim') || params.get('ios_sim')) : null;
const authOpts = { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true };
if (simId && simId !== '1') {
  authOpts.storageKey = `sb-mesaj-sim-${simId}-auth-token`;
}

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: authOpts,
  realtime: { params: { eventsPerSecond: 20 } },
});
