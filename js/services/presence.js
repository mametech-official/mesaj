/* services/presence.js — çevrim içi durumu (Presence), "yazıyor…" (Broadcast), son görülme */
import { sb } from '../supabase.js';
import { CONFIG } from '../config.js';
import { state, bus, setLastSeen } from '../state.js';
import { touchLastSeen } from './profiles.js';
import { mergeStories, getMyStories } from './stories.js';

let channel = null;
let heartbeat = null;
let lastTypingSent = 0;
let onVisibility = null;
let unbindPresenceUpdate = null;

export function startPresence(me) {
  stopPresence();

  channel = sb.channel('room:presence', {
    config: { presence: { key: me.id }, broadcast: { self: false } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const pState = channel.presenceState();
      state.onlineIds = new Set(Object.keys(pState));

      // Çevrim içi eşlerin paylaştığı 24 saatlik hikayeleri al
      const remoteStories = [];
      Object.values(pState).forEach((presences) => {
        (presences || []).forEach((p) => {
          if (p && Array.isArray(p.stories)) {
            remoteStories.push(...p.stories);
          }
        });
      });
      if (remoteStories.length) {
        mergeStories(remoteStories);
      }

      bus.emit('presence:changed');
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      setLastSeen(key, new Date().toISOString());      // sync olayı ardından arayüzü günceller
    })
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || payload.to !== me.id) return;
      setTyping(payload.from);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          online_at: new Date().toISOString(),
          username: me.username,
          stories: getMyStories(),
        });
      }
    });

  unbindPresenceUpdate = bus.on('presence:update_stories', () => {
    updatePresenceStories();
  });

  touchLastSeen(me.id);
  heartbeat = setInterval(() => touchLastSeen(me.id), CONFIG.HEARTBEAT_MS);
  onVisibility = () => { if (document.visibilityState === 'hidden') touchLastSeen(me.id); };
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopPresence() {
  clearInterval(heartbeat); heartbeat = null;
  if (unbindPresenceUpdate) { unbindPresenceUpdate(); unbindPresenceUpdate = null; }
  if (onVisibility) { document.removeEventListener('visibilitychange', onVisibility); onVisibility = null; }
  if (channel) { sb.removeChannel(channel); channel = null; }
}

export async function updatePresenceStories() {
  if (!channel || !state.me) return;
  try {
    await channel.track({
      online_at: new Date().toISOString(),
      username: state.me.username,
      stories: getMyStories(),
    });
  } catch (err) {
    console.warn('Presence story update err:', err);
  }
}

/** Karşı tarafa "yazıyor" sinyali gönderir (kısıtlı sıklıkta). */
export function sendTyping(toId) {
  if (!channel || !state.me) return;
  const now = Date.now();
  if (now - lastTypingSent < CONFIG.TYPING_THROTTLE_MS) return;
  lastTypingSent = now;
  channel.send({ type: 'broadcast', event: 'typing', payload: { from: state.me.id, to: toId } });
}

function setTyping(fromId) {
  clearTimeout(state.typing.get(fromId));
  state.typing.set(fromId, setTimeout(() => clearTyping(fromId), CONFIG.TYPING_TTL_MS));
  bus.emit('typing:changed');
}

export function clearTyping(fromId) {
  if (!state.typing.has(fromId)) return;
  clearTimeout(state.typing.get(fromId));
  state.typing.delete(fromId);
  bus.emit('typing:changed');
}
