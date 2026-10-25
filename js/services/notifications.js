/* services/notifications.js — masaüstü web bildirimleri */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export function notifyMessage({ title, body, icon, onClick }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // Kullanıcı sekmeye bakmıyorsa bildirim gönder
  if (!document.hidden && document.hasFocus()) return;

  try {
    const n = new Notification(title || 'Yeni Mesaj', {
      body: body || 'Bir mesaj aldınız.',
      icon: icon || 'assets/doodle.svg',
      badge: 'assets/doodle.svg',
      tag: 'mesaj-notification',
      renotify: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
      if (onClick) onClick();
    };
  } catch (err) {
    console.warn('Bildirim gösterilemedi:', err);
  }
}
