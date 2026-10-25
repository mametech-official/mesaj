/* services/realtime.js — postgres_changes ile mesajlar ve arkadaşlık isteklerinin anlık düşmesi */
import { sb } from '../supabase.js';
import { bus } from '../state.js';
import { markDelivered } from './messages.js';

let channel = null;

export function startMessageRealtime(me) {
  stopMessageRealtime();
  let subscribedOnce = false;

  channel = sb.channel(`db-changes:${me.id}`)
    // Mesajlar (bana gelen / benim gönderdiğim)
    .on('postgres_changes', { schema: 'public', table: 'messages', event: 'INSERT', filter: `receiver_id=eq.${me.id}` },
      (p) => {
        bus.emit('message:insert', p.new);
        markDelivered();
      })
    .on('postgres_changes', { schema: 'public', table: 'messages', event: 'INSERT', filter: `sender_id=eq.${me.id}` },
      (p) => bus.emit('message:insert', p.new))
    .on('postgres_changes', { schema: 'public', table: 'messages', event: 'UPDATE' },
      (p) => bus.emit('message:update', p.new))

    // Arkadaşlık istekleri (bana gelen veya gönderdiğim)
    .on('postgres_changes', { schema: 'public', table: 'friend_requests', event: 'INSERT' },
      (p) => {
        if (p.new.receiver_id === me.id || p.new.sender_id === me.id) {
          bus.emit('request:change', p.new);
        }
      })
    .on('postgres_changes', { schema: 'public', table: 'friend_requests', event: 'UPDATE' },
      (p) => {
        if (p.new.receiver_id === me.id || p.new.sender_id === me.id) {
          bus.emit('request:change', p.new);
        }
      })

    // Arkadaşlar listesi değişimi (biri kabul ettiğinde veya çıkarıldığında)
    .on('postgres_changes', { schema: 'public', table: 'friends', event: '*' },
      () => bus.emit('friends:change'))

    // Emoji tepkileri (Reactions - Eklenen / Silinen / Değiştirilen tepkiler)
    .on('postgres_changes', { schema: 'public', table: 'message_reactions', event: '*' },
      (p) => {
        const item = p.new || p.old;
        if (item && item.message_id) {
          bus.emit('reaction:change', item);
        }
      })

    // Yıldızlı mesajlar
    .on('postgres_changes', { schema: 'public', table: 'starred_messages', event: '*' },
      () => bus.emit('star:change'))

    .subscribe((status) => {
      bus.emit('realtime:status', status);
      if (status === 'SUBSCRIBED') {
        markDelivered();
        if (subscribedOnce) bus.emit('realtime:reconnected');
        subscribedOnce = true;
      }
    });
}

export function stopMessageRealtime() {
  if (channel) { sb.removeChannel(channel); channel = null; }
}
