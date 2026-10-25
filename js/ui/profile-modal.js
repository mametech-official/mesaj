/* ui/profile-modal.js — profil düzenleme, biyografi/hakkında, engellenenler listesi ve bildirimler */
import { $, el, setAvatar, trErr } from '../utils.js';
import { state, bus } from '../state.js';
import { updateProfileAbout, fetchBlockedUsers, unblockUser } from '../services/profiles.js';
import { getAvatarUrl } from '../services/storage.js';
import { requestNotificationPermission } from '../services/notifications.js';
import { toast } from './toast.js';

export function openProfileModal() {
  const modal = $('profile-modal');
  if (!modal || !state.me) return;

  const av = $('profile-modal-avatar');
  if (av) {
    const url = getAvatarUrl(state.me.avatar_path);
    setAvatar(av, state.me.username, url);
  }

  $('profile-modal-username').textContent = '@' + state.me.username;

  const aboutInput = $('profile-modal-about');
  if (aboutInput) aboutInput.value = state.me.about || 'Merhaba! Ben de Mesaj kullanıyorum.';

  loadBlockedList();
  modal.classList.add('open');
}

export function closeProfileModal() {
  const modal = $('profile-modal');
  if (modal) modal.classList.remove('open');
}

async function loadBlockedList() {
  const container = $('profile-blocked-list');
  if (!container) return;
  container.innerHTML = '<small style="color:var(--text-2)">Yükleniyor…</small>';

  try {
    const list = await fetchBlockedUsers();
    if (!list.length) {
      container.innerHTML = '<small style="color:var(--text-2)">Engellenen kullanıcı yok.</small>';
      return;
    }
    container.innerHTML = '';
    list.forEach(u => {
      const item = el('div', 'p-blocked-item');
      item.innerHTML = `<span>@${u.username}</span>`;
      const btn = el('button', '', 'Engeli Kaldır');
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        try {
          await unblockUser(u.user_id);
          toast(`@${u.username} engeli kaldırıldı.`);
          loadBlockedList();
          bus.emit('friends:change');
        } catch (err) {
          toast('İşlem başarısız: ' + trErr(err));
        }
      });
      item.append(btn);
      container.append(item);
    });
  } catch (err) {
    container.innerHTML = '<small style="color:var(--danger)">Liste alınamadı.</small>';
  }
}

export function initProfileModal() {
  const modal = $('profile-modal');
  if (!modal) return;

  $('profile-modal-close').addEventListener('click', closeProfileModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeProfileModal();
  });

  const form = $('profile-about-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = $('profile-modal-about').value.trim();
      try {
        await updateProfileAbout(state.me.id, val);
        state.me.about = val;
        toast('Hakkında bilgisi güncellendi.');
        closeProfileModal();
      } catch (err) {
        toast('Güncellenemedi: ' + trErr(err));
      }
    });
  }

  const notifBtn = $('profile-notif-btn');
  if (notifBtn) {
    notifBtn.addEventListener('click', async () => {
      const res = await requestNotificationPermission();
      if (res === 'granted') toast('Masaüstü bildirimleri aktif!');
      else if (res === 'denied') toast('Bildirimlere tarayıcı ayarlarından izin vermelisiniz.');
      else toast('Bildirim desteği bulunamadı.');
    });
  }
}
