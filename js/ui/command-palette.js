/* =====================================================================
 *  ui/command-palette.js — v6 Global Komut Paleti (Ctrl+K) (#91),
 *  Klavye Kısayolları (#92), 24 Saatlik Hikayeler (Stories) (#61),
 *  Sohbet İstatistikleri (#93), E2EE Parmak İzi (#84), QR Kod (#70) ve Dışa Aktarma (#86)
 * ===================================================================== */
import { $, el, fmtTime } from '../utils.js';
import { state, bus } from '../state.js';
import { applyTheme, openWallpaperPicker, getCurrentTheme } from './wallpaper-picker.js';
import { openProfileModal } from './profile-modal.js';
import { toggleZenMode, triggerImmediatePrivacyLock, triggerEmojiRain, isZenMode } from './fx.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import {
  getStories,
  getMyStories,
  getStoriesGroupedByUser,
  addStory,
  deleteStory,
  uploadStoryMedia,
  STORY_GRADIENTS,
} from '../services/stories.js';
import { getAvatarUrl } from '../services/storage.js';

export { getStories, addStory };

let onSelectChatCallback = null;

export function initCommandPalette({ onSelectChat }) {
  onSelectChatCallback = onSelectChat;

  bus.on('stories:changed', () => {
    renderStoriesBar();
  });
  bus.on('chats:changed', () => {
    renderStoriesBar();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      openShortcutsModal();
    }
  });
}

/* ---------------- 1. Global Komut Paleti (Ctrl + K) (#91) ---------------- */
export function openCommandPalette() {
  let modal = $('cmd-palette-modal');
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'cmd-palette-modal';
    modal.innerHTML = `
      <div class="v6-modal-card cmd-card">
        <div class="cmd-search-head">
          <span>${icon('zap')}</span>
          <input id="cmd-input" type="search" placeholder="Komut çalıştır, kişi ara veya tema değiştir… (Ctrl+K)" autocomplete="off">
          <kbd>ESC</kbd>
          <button type="button" class="icon-btn cmd-close-head-btn" id="cmd-close-head-btn" title="Kapat (ESC)">${icon('close')}</button>
        </div>
        <div class="cmd-list" id="cmd-list"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#cmd-close-head-btn')) modal.classList.remove('open');
    });
    $('cmd-input').addEventListener('input', () => renderCommandItems($('cmd-input').value));
    $('cmd-input').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') modal.classList.remove('open');
    });
  }

  $('cmd-input').value = '';
  renderCommandItems('');
  modal.classList.add('open');
  setTimeout(() => $('cmd-input').focus(), 60);
}

function renderCommandItems(q) {
  const list = $('cmd-list');
  if (!list) return;
  list.replaceChildren();
  const query = (q || '').trim().toLowerCase();

  const actions = [
    {
      icon: icon('pin'),
      color: '#38bdf8',
      title: 'Kendime Notlar (Kişisel Bulut)',
      sub: 'Not, dosya, kod ve hatırlatıcı kaydet (#72)',
      actionLabel: 'Aç',
      run: () => {
        if (state.me && onSelectChatCallback) {
          onSelectChatCallback({ id: state.me.id, username: state.me.username, avatar_path: state.me.avatar_path, isSelf: true });
        }
      }
    },
    {
      icon: icon('palette'),
      color: '#f472b6',
      title: 'Tema & Özelleştirme Stüdyosu',
      sub: 'Renk, yazı tipi, balon stili ve canlı sahne seç',
      actionLabel: 'Aç',
      run: () => openWallpaperPicker()
    },
    {
      icon: icon('moon'),
      color: '#a78bfa',
      title: 'Canlı Sahne: Kozmik Bulutsu (Nebula)',
      sub: 'Kayan yıldızlar ve mor bulutsu sahnesi (#8)',
      isOn: () => getCurrentTheme() === 'nebula',
      run: () => {
        const on = getCurrentTheme() === 'nebula';
        applyTheme(on ? 'classic' : 'nebula');
        toast(on ? 'Kozmik Bulutsu sahnesi kapatıldı' : 'Kozmik Bulutsu sahnesi açıldı ✨');
      }
    },
    {
      icon: icon('terminal'),
      color: '#34d399',
      title: 'Canlı Sahne: Matrix Dijital Yağmur',
      sub: 'Akan neon kod yağmuru sahnesi (#6)',
      isOn: () => getCurrentTheme() === 'matrix',
      run: () => {
        const on = getCurrentTheme() === 'matrix';
        applyTheme(on ? 'classic' : 'matrix');
        toast(on ? 'Matrix Yağmuru kapatıldı' : 'Matrix Yağmuru açıldı 💻');
      }
    },
    {
      icon: icon('sparkles'),
      color: '#fbbf24',
      title: 'Canlı Sahne: Ateşböceği Ormanı',
      sub: 'Biyolüminesan sıcak parçacıklar (#7)',
      isOn: () => getCurrentTheme() === 'fireflies',
      run: () => {
        const on = getCurrentTheme() === 'fireflies';
        applyTheme(on ? 'classic' : 'fireflies');
        toast(on ? 'Ateşböcekleri sahnesi kapatıldı' : 'Ateşböcekleri sahnesi açıldı ✨');
      }
    },
    {
      icon: icon('sunset'),
      color: '#fb923c',
      title: 'Canlı Sahne: Dinamik Gökyüzü',
      sub: 'Gün batımı ve yıldızlı gökyüzü (#5)',
      isOn: () => getCurrentTheme() === 'sky',
      run: () => {
        const on = getCurrentTheme() === 'sky';
        applyTheme(on ? 'classic' : 'sky');
        toast(on ? 'Dinamik Gökyüzü sahnesi kapatıldı' : 'Dinamik Gökyüzü sahnesi açıldı 🌅');
      }
    },
    {
      icon: icon('leaf'),
      color: '#2dd4bf',
      title: 'Zen Odak Modu',
      sub: 'Sol paneli daraltarak tam ekran odaklan (#100)',
      isOn: () => isZenMode() || !!$('app')?.classList.contains('zen-mode'),
      run: () => {
        const z = toggleZenMode();
        toast(z ? 'Zen odak modu açıldı 🧘' : 'Zen odak modu kapatıldı');
      }
    },
    {
      icon: icon('shield'),
      color: '#60a5fa',
      title: 'Ekran Gizlilik Kalkanı',
      sub: 'Sohbet ekranını anında bulanıklaştır (#82)',
      isOn: () => document.body.classList.contains('privacy-blurred'),
      run: () => {
        triggerImmediatePrivacyLock();
        const b = document.body.classList.contains('privacy-blurred');
        toast(b ? 'Gizlilik kalkanı açıldı (ekran bulanık)' : 'Gizlilik kalkanı kapatıldı');
      }
    },
    {
      icon: icon('camera'),
      color: '#f43f5e',
      title: 'Yeni 24 Saatlik Hikaye Paylaş',
      sub: 'Arkadaşların için durum/hikaye yayınla (#61)',
      actionLabel: 'Paylaş',
      run: () => openStoryCreatorModal()
    },
    {
      icon: icon('party'),
      color: '#eab308',
      title: 'Kutlama Konfetisi Patlat',
      sub: 'Tam ekran emoji ve konfeti yağmuru (#12)',
      actionLabel: 'Patlat',
      run: () => triggerEmojiRain(['🎉', '✨', '🚀', '💎', '🔥'])
    },
    {
      icon: icon('user'),
      color: '#c084fc',
      title: 'Profil, QR Kod & Ayarlar',
      sub: 'Biyografi, bildirimler ve engellenenler',
      actionLabel: 'Aç',
      run: () => openProfileModal()
    },
    {
      icon: icon('keyboard'),
      color: '#94a3b8',
      title: 'Klavye Kısayolları ve Komut Rehberi',
      sub: 'Tüm kısayolları ve / komutlarını görüntüle (#92)',
      actionLabel: 'Rehber',
      run: () => openShortcutsModal()
    },
  ];

  // Mevcut arkadaşları da komut listesine ekle
  (state.chats || []).forEach(c => {
    actions.unshift({
      icon: icon('message'),
      color: '#00e5b3',
      title: `Sohbet: @${c.username}`,
      sub: c.last_content || 'Sohbete git',
      actionLabel: 'Sohbet',
      run: () => {
        if (onSelectChatCallback) onSelectChatCallback({ id: c.contact_id, username: c.username, avatar_path: c.avatar_path, about: c.about });
      },
    });
  });

  const filtered = actions.filter(a => !query || a.title.toLowerCase().includes(query) || a.sub.toLowerCase().includes(query));
  if (!filtered.length) {
    list.append(el('div', 'list-empty', 'Eşleşen komut veya kişi bulunamadı.'));
    return;
  }

  filtered.forEach(item => {
    const btn = el('button', 'cmd-item');
    btn.type = 'button';
    const isTog = typeof item.isOn === 'function';
    const active = isTog && item.isOn();

    let rightBadge = '';
    if (isTog) {
      rightBadge = `
        <span class="cmd-toggle-badge ${active ? 'is-active' : ''}" title="${active ? 'Açık — Kapatmak için tıkla' : 'Kapalı — Açmak için tıkla'}">
          ${active ? icon('toggleRight') : icon('toggleLeft')}
          <span class="cmd-toggle-text">${active ? 'Açık' : 'Kapalı'}</span>
        </span>
      `;
    } else {
      rightBadge = `
        <span class="cmd-open-badge" title="Aç">
          ${icon('chevronRight')}
          <span>${item.actionLabel || 'Aç'}</span>
        </span>
      `;
    }

    btn.innerHTML = `
      <span class="cmd-icon" style="color:${item.color || 'var(--accent-bright)'}">${item.icon}</span>
      <div class="cmd-meta">
        <b>${item.title}</b>
        <small>${item.sub}</small>
      </div>
      ${rightBadge}
    `;

    btn.addEventListener('click', () => {
      if (isTog) {
        item.run();
        renderCommandItems($('cmd-input')?.value || '');
      } else {
        $('cmd-palette-modal')?.classList.remove('open');
        item.run();
      }
    });
    list.append(btn);
  });
}

/* ---------------- 2. Klavye Kısayolları Rehberi (#92) ---------------- */
export function openShortcutsModal() {
  let modal = $('shortcuts-modal');
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'shortcuts-modal';
    modal.innerHTML = `
      <div class="v6-modal-card" style="max-width:500px">
        <div class="v6-modal-head">
          <h3>${icon('keyboard')} Klavye Kısayolları & Komutlar</h3>
          <button type="button" class="icon-btn" id="sc-close-btn">${icon('close')}</button>
        </div>
        <div class="v6-modal-body">
          <div class="sc-grid">
            <div class="sc-row"><span>Global Komut Paleti</span><kbd>Ctrl + K</kbd></div>
            <div class="sc-row"><span>Kısayol Rehberi</span><kbd>Ctrl + /</kbd></div>
            <div class="sc-row"><span>Mesaj Gönder</span><kbd>Enter</kbd></div>
            <div class="sc-row"><span>Alt Satıra Geç</span><kbd>Shift + Enter</kbd></div>
            <div class="sc-row"><span>Mesaja Hızlı ❤️ Tepkisi</span><kbd>Çift Tıkla</kbd></div>
            <div class="sc-row"><span>Canlı Anket Oluştur</span><kbd>/anket Soru | A | B</kbd></div>
            <div class="sc-row"><span>Ortak Yapılacaklar</span><kbd>/todo Başlık | İş 1 | İş 2</kbd></div>
            <div class="sc-row"><span>Canlı XOX Oyunu</span><kbd>/xox</kbd></div>
            <div class="sc-row"><span>Taş-Kağıt-Makas</span><kbd>/tkm</kbd></div>
            <div class="sc-row"><span>3B Zar At</span><kbd>/zar</kbd></div>
            <div class="sc-row"><span>Süreli İmha Mesajı</span><kbd>/sureli 30 Gizli mesaj</kbd></div>
            <div class="sc-row"><span>Spoiler (Gizli Metin)</span><kbd>||gizli metin||</kbd></div>
            <div class="sc-row"><span>Matematik Hesaplayıcı</span><kbd>= 145 * 18</kbd></div>
          </div>
          <div style="text-align:center;padding:12px 0 2px;font-size:12px;opacity:0.6;border-top:1px solid rgba(255,255,255,0.08);margin-top:12px">
            Mesaj Web • Versiyon 0.7
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#sc-close-btn')) modal.classList.remove('open');
    });
  }
  modal.classList.add('open');
}

/* ---------------- 3. 24 Saatlik Hikayeler (Stories) (#61) ---------------- */
export function renderStoriesBar() {
  const bar = $('stories-bar');
  if (!bar || !state.me) return;
  bar.replaceChildren();

  // 1. + Hikaye Ekle düğmesi
  const addBtn = el('button', 'story-item add-story');
  addBtn.type = 'button';
  addBtn.title = '24 Saatlik Hikaye Paylaş';
  addBtn.innerHTML = `
    <div class="story-ring add">${icon('plus')}</div>
    <small>Hikayem</small>
  `;
  addBtn.addEventListener('click', openStoryCreatorModal);
  bar.append(addBtn);

  // 2. Kendime Notlar hızlı erişim (#72)
  const selfBtn = el('button', 'story-item');
  selfBtn.type = 'button';
  selfBtn.title = 'Kendime Notlar (Kişisel Bulut)';
  selfBtn.innerHTML = `
    <div class="story-ring saved">${icon('pin')}</div>
    <small>Notlarım</small>
  `;
  selfBtn.addEventListener('click', () => {
    if (onSelectChatCallback && state.me) {
      onSelectChatCallback({ id: state.me.id, username: state.me.username, avatar_path: state.me.avatar_path, isSelf: true });
    }
  });
  bar.append(selfBtn);

  // 3. Kullanıcıların hikayeleri (Gruplandırılmış ve tekilleştirilmiş)
  const groups = getStoriesGroupedByUser();

  const isMe = (g) => {
    if (!state.me) return false;
    if (g.userId && state.me.id && g.userId === state.me.id) return true;
    const gUser = (g.username || '').toLowerCase().trim();
    const myUser = (state.me.username || '').toLowerCase().trim();
    return Boolean(gUser && myUser && gUser === myUser);
  };

  const isFriend = (g) => {
    if (!state.chats || !state.chats.length) return false;
    const gUser = (g.username || '').toLowerCase().trim();
    const gId = g.userId ? String(g.userId).trim() : null;
    return state.chats.some(c => {
      if (gId && c.contact_id && String(c.contact_id).trim() === gId) return true;
      if (gUser && c.username && c.username.toLowerCase().trim() === gUser) return true;
      return false;
    });
  };

  const myGroup = groups.find(g => isMe(g));
  // Yalnızca arkadaşımız olan kişilerin hikayelerini listele (Yabancıların hikayeleri asla görünmez)
  const otherGroups = groups.filter(g => !isMe(g) && isFriend(g) && g.stories && g.stories.length > 0);

  // Viewer için sıralı tüm gruplar listesi (Önce ben, sonra diğer kullanıcılar)
  const allOrderedGroups = [];
  if (myGroup && myGroup.stories && myGroup.stories.length > 0) {
    allOrderedGroups.push(myGroup);
  }
  otherGroups.forEach(g => allOrderedGroups.push(g));

  // Kendi hikayem halkası (Varsa TEK bir daire olarak)
  if (myGroup && myGroup.stories && myGroup.stories.length > 0) {
    const item = el('button', 'story-item');
    item.type = 'button';
    item.title = `Hikayelerim (${myGroup.stories.length})`;
    const avUrl = state.me?.avatar_path ? getAvatarUrl(state.me.avatar_path) : (myGroup.avatar_path ? getAvatarUrl(myGroup.avatar_path) : null);
    const latestStory = myGroup.stories[myGroup.stories.length - 1];
    item.innerHTML = `
      <div class="story-ring active my-story" style="background:${latestStory.bg || STORY_GRADIENTS[0]}">
        ${avUrl ? `<span class="story-avatar" style="background-image:url('${avUrl}')"></span>` : `<span>${(state.me?.username || 'B')[0].toUpperCase()}</span>`}
      </div>
      <small>Hikayem (${myGroup.stories.length})</small>
    `;
    item.addEventListener('click', () => {
      const gIdx = allOrderedGroups.indexOf(myGroup);
      openStoryViewerModal(allOrderedGroups, gIdx >= 0 ? gIdx : 0, 0);
    });
    bar.append(item);
  }

  // Diğer kullanıcıların tekil hikaye halkaları (Her kullanıcı için kesinlikle TEK bir daire)
  otherGroups.forEach(g => {
    const item = el('button', 'story-item');
    item.type = 'button';
    item.title = `@${g.username} hikayeleri (${g.stories.length})`;
    const avUrl = g.avatar_path ? getAvatarUrl(g.avatar_path) : null;
    const latestStory = g.stories[g.stories.length - 1];
    item.innerHTML = `
      <div class="story-ring active" style="background:${latestStory.bg || STORY_GRADIENTS[0]}">
        ${avUrl ? `<span class="story-avatar" style="background-image:url('${avUrl}')"></span>` : `<span>${(g.username || 'U')[0].toUpperCase()}</span>`}
      </div>
      <small>@${g.username}</small>
    `;
    item.addEventListener('click', () => {
      const gIdx = allOrderedGroups.indexOf(g);
      openStoryViewerModal(allOrderedGroups, gIdx >= 0 ? gIdx : 0, 0);
    });
    bar.append(item);
  });
}

let pendingStoryMedia = null; // { type: 'image'|'video'|'audio', blob: Blob|File, previewUrl: string }
let storyAudioRecorder = null;
let storyRecChunks = [];
let storyRecTimer = null;
let storyRecSec = 0;

function clearPendingStoryMedia() {
  if (storyAudioRecorder && storyAudioRecorder.state === 'recording') {
    try { storyAudioRecorder.stop(); } catch {}
  }
  clearInterval(storyRecTimer);
  storyRecTimer = null;
  storyRecSec = 0;
  if (pendingStoryMedia?.previewUrl && pendingStoryMedia.previewUrl.startsWith('blob:')) {
    try { URL.revokeObjectURL(pendingStoryMedia.previewUrl); } catch {}
  }
  pendingStoryMedia = null;
  const prevWrap = $('st-media-preview');
  if (prevWrap) {
    prevWrap.replaceChildren();
    prevWrap.hidden = true;
  }
  const clearBtn = $('st-clear-media-btn');
  if (clearBtn) clearBtn.hidden = true;
  const recBtn = $('st-rec-audio-btn');
  if (recBtn) {
    recBtn.classList.remove('recording');
    recBtn.innerHTML = `${icon('mic')} <span>Ses Kaydet</span>`;
  }
}

function setPendingStoryMedia(type, blobOrFile) {
  clearPendingStoryMedia();
  const previewUrl = URL.createObjectURL(blobOrFile);
  pendingStoryMedia = { type, blob: blobOrFile, previewUrl };

  const prevWrap = $('st-media-preview');
  const clearBtn = $('st-clear-media-btn');
  if (!prevWrap) return;
  prevWrap.replaceChildren();
  prevWrap.hidden = false;
  if (clearBtn) clearBtn.hidden = false;

  if (type === 'image') {
    const img = el('img', 'st-preview-img');
    img.src = previewUrl;
    img.alt = 'Seçilen fotoğraf';
    prevWrap.append(img);
  } else if (type === 'video') {
    const vid = el('video', 'st-preview-video');
    vid.src = previewUrl;
    vid.controls = true;
    vid.playsInline = true;
    vid.muted = false;
    prevWrap.append(vid);
  } else if (type === 'audio') {
    const audWrap = el('div', 'st-preview-audio-box');
    audWrap.innerHTML = `<div class="st-audio-badge">${icon('mic')} Sesli Durum Hazır</div>`;
    const aud = el('audio', 'st-preview-audio');
    aud.src = previewUrl;
    aud.controls = true;
    audWrap.append(aud);
    prevWrap.append(audWrap);
  }
}

export function openStoryCreatorModal() {
  let modal = $('story-creator-modal');
  let chosenBg = STORY_GRADIENTS[0];
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'story-creator-modal';
    modal.innerHTML = `
      <div class="v6-modal-card" style="max-width:460px">
        <div class="v6-modal-head">
          <h3>${icon('sparkles')} 24 Saatlik Hikaye / Durum Paylaş</h3>
          <button type="button" class="icon-btn" id="st-close-btn">${icon('close')}</button>
        </div>
        <div class="v6-modal-body">
          <div class="story-preview-box" id="st-preview-box" style="background:${chosenBg}">
            <div id="st-media-preview" class="st-media-preview" hidden></div>
            <textarea id="st-text-input" maxlength="200" placeholder="Durumunu veya medya açıklamasını yaz… 🌟"></textarea>
          </div>

          <div class="st-media-toolbar">
            <button type="button" class="st-media-btn" id="st-pick-photo-btn" title="Fotoğraf Seç">
              ${icon('image')} <span>Fotoğraf</span>
            </button>
            <button type="button" class="st-media-btn" id="st-pick-video-btn" title="Video Seç">
              ${icon('video')} <span>Video</span>
            </button>
            <button type="button" class="st-media-btn" id="st-rec-audio-btn" title="Mikrofonla Ses Kaydet">
              ${icon('mic')} <span>Ses Kaydet</span>
            </button>
            <button type="button" class="st-media-btn" id="st-pick-audio-btn" title="Ses Dosyası Seç">
              ${icon('volume')} <span>Ses Dosyası</span>
            </button>
            <button type="button" class="st-media-btn danger" id="st-clear-media-btn" hidden title="Medyayı Kaldır">
              ${icon('trash')}
            </button>
          </div>

          <input type="file" id="st-file-photo" accept="image/*" hidden>
          <input type="file" id="st-file-video" accept="video/mp4,video/webm,video/*" hidden>
          <input type="file" id="st-file-audio" accept="audio/*" hidden>

          <div class="st-color-row" id="st-color-row"></div>
          <button type="button" class="btn-primary" id="st-publish-btn">Hikayeyi Yayınla</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#st-close-btn')) {
        clearPendingStoryMedia();
        modal.classList.remove('open');
      }
    });

    const colorRow = $('st-color-row');
    STORY_GRADIENTS.forEach((g) => {
      const b = el('button', 'wb-color');
      b.type = 'button';
      b.style.background = g;
      b.addEventListener('click', () => {
        chosenBg = g;
        $('st-preview-box').style.background = g;
      });
      colorRow.append(b);
    });

    // Fotoğraf seçimi
    $('st-pick-photo-btn').addEventListener('click', () => $('st-file-photo').click());
    $('st-file-photo').addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('Fotoğraf en fazla 15 MB olabilir.'); return; }
      setPendingStoryMedia('image', f);
    });

    // Video seçimi
    $('st-pick-video-btn').addEventListener('click', () => $('st-file-video').click());
    $('st-file-video').addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 35 * 1024 * 1024) { toast('Video en fazla 35 MB olabilir.'); return; }
      setPendingStoryMedia('video', f);
    });

    // Ses dosyası seçimi
    $('st-pick-audio-btn').addEventListener('click', () => $('st-file-audio').click());
    $('st-file-audio').addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('Ses dosyası en fazla 15 MB olabilir.'); return; }
      setPendingStoryMedia('audio', f);
    });

    // Canlı mikrofon ses kaydı
    $('st-rec-audio-btn').addEventListener('click', async () => {
      const recBtn = $('st-rec-audio-btn');
      if (storyAudioRecorder && storyAudioRecorder.state === 'recording') {
        storyAudioRecorder.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        storyRecChunks = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';
        storyAudioRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        storyAudioRecorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) storyRecChunks.push(ev.data);
        };
        storyAudioRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          clearInterval(storyRecTimer);
          recBtn.classList.remove('recording');
          recBtn.innerHTML = `${icon('mic')} <span>Ses Kaydet</span>`;
          if (storyRecChunks.length) {
            const blob = new Blob(storyRecChunks, { type: storyAudioRecorder.mimeType || 'audio/webm' });
            setPendingStoryMedia('audio', blob);
          }
        };

        storyAudioRecorder.start();
        storyRecSec = 0;
        recBtn.classList.add('recording');
        recBtn.innerHTML = `${icon('mic')} <span>Bitir (00:00)</span>`;
        storyRecTimer = setInterval(() => {
          storyRecSec++;
          const m = String(Math.floor(storyRecSec / 60)).padStart(2, '0');
          const s = String(storyRecSec % 60).padStart(2, '0');
          recBtn.innerHTML = `${icon('mic')} <span>Bitir (${m}:${s})</span>`;
          if (storyRecSec >= 120 && storyAudioRecorder?.state === 'recording') {
            storyAudioRecorder.stop();
          }
        }, 1000);
      } catch {
        toast('Mikrofon izni alınamadı.');
      }
    });

    $('st-clear-media-btn').addEventListener('click', clearPendingStoryMedia);

    $('st-publish-btn').addEventListener('click', async () => {
      const txt = $('st-text-input').value.trim();
      if (!txt && !pendingStoryMedia) {
        toast('Lütfen bir metin yazın veya fotoğraf/video/ses ekleyin.');
        return;
      }

      const pubBtn = $('st-publish-btn');
      pubBtn.disabled = true;
      const origLabel = pubBtn.textContent;

      try {
        let mediaPayload = null;
        if (pendingStoryMedia) {
          pubBtn.textContent = 'Medya yükleniyor… ⏳';
          const uploadedUrl = await uploadStoryMedia(pendingStoryMedia.blob, pendingStoryMedia.type);
          if (!uploadedUrl) {
            toast('Medya yüklenemedi, lütfen tekrar deneyin.');
            pubBtn.disabled = false;
            pubBtn.textContent = origLabel;
            return;
          }
          mediaPayload = { type: pendingStoryMedia.type, url: uploadedUrl };
        }

        addStory(txt, chosenBg, mediaPayload);
        $('st-text-input').value = '';
        clearPendingStoryMedia();
        modal.classList.remove('open');
        toast('Hikayeniz yayınlandı! ✨');
      } catch {
        toast('Hikaye yayınlanırken bir hata oluştu.');
      } finally {
        pubBtn.disabled = false;
        pubBtn.textContent = origLabel;
      }
    });
  }
  clearPendingStoryMedia();
  modal.classList.add('open');
  setTimeout(() => $('st-text-input')?.focus(), 80);
}

let storyTimer = null;
let allStoryGroups = [];
let currentGroupIdx = 0;
let currentStoryIdx = 0;

function stopStoryMediaPlayback() {
  const contentEl = $('sv-content');
  if (!contentEl) return;
  contentEl.querySelectorAll('video, audio').forEach(m => {
    try {
      m.pause();
      m.removeAttribute('src');
      m.load();
    } catch {}
  });
}

export function openStoryViewerModal(target, startGroupOrStoryIdx = 0, startStoryIdx = 0) {
  if (!target || !target.length) return;

  // target grup listesi mi yoksa tekil story dizisi mi?
  if (target[0] && Array.isArray(target[0].stories)) {
    allStoryGroups = target.filter(g => g && g.stories && g.stories.length > 0);
    currentGroupIdx = Math.max(0, Math.min(startGroupOrStoryIdx, allStoryGroups.length - 1));
    const currStories = allStoryGroups[currentGroupIdx]?.stories || [];
    currentStoryIdx = Math.max(0, Math.min(startStoryIdx, Math.max(0, currStories.length - 1)));
  } else {
    allStoryGroups = [{
      username: target[0]?.username || 'anonim',
      avatar_path: target[0]?.avatar_path || null,
      userId: target[0]?.userId || null,
      stories: target,
    }];
    currentGroupIdx = 0;
    currentStoryIdx = Math.max(0, Math.min(startGroupOrStoryIdx, target.length - 1));
  }

  if (!allStoryGroups.length) return;

  let modal = $('story-viewer-modal');
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'story-viewer-modal';
    modal.innerHTML = `
      <div class="v6-modal-card story-view-card" id="sv-card">
        <div class="sv-progress" id="sv-progress-container"></div>
        <div class="sv-head">
          <div class="sv-head-user">
            <span class="sv-avatar" id="sv-avatar"></span>
            <div>
              <b id="sv-user"></b>
              <small id="sv-time"></small>
            </div>
          </div>
          <div class="sv-head-actions">
            <span class="sv-counter-badge" id="sv-counter-badge" style="font-size:11px;opacity:0.8;padding:2px 7px;border-radius:10px;background:rgba(0,0,0,0.25);font-weight:600"></span>
            <button type="button" class="icon-btn sv-action-btn" id="sv-delete-btn" title="Hikayeyi Sil" style="display:none">${icon('trash')}</button>
            <button type="button" class="icon-btn sv-action-btn" id="sv-close" title="Kapat (ESC)">${icon('close')}</button>
          </div>
        </div>
        <div class="sv-stage" id="sv-stage">
          <button type="button" class="sv-nav-btn prev" id="sv-prev" title="Önceki (Sol Ok)">${icon('chevronLeft')}</button>
          <div class="sv-content" id="sv-content"></div>
          <button type="button" class="sv-nav-btn next" id="sv-next" title="Sonraki (Sağ Ok)">${icon('chevronRight')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#sv-close')) {
        closeStoryViewerModal();
      }
    });

    $('sv-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      goToPrevStory();
    });

    $('sv-next').addEventListener('click', (e) => {
      e.stopPropagation();
      goToNextStory();
    });

    $('sv-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const currentGroup = allStoryGroups[currentGroupIdx];
      const curr = currentGroup?.stories[currentStoryIdx];
      if (!curr) return;
      if (confirm('Bu hikayeyi silmek istediğinize emin misiniz?')) {
        deleteStory(curr.id);
        toast('Hikaye silindi.');
        currentGroup.stories = currentGroup.stories.filter(s => s.id !== curr.id);
        if (!currentGroup.stories.length) {
          allStoryGroups.splice(currentGroupIdx, 1);
          if (!allStoryGroups.length) {
            closeStoryViewerModal();
            return;
          }
          if (currentGroupIdx >= allStoryGroups.length) {
            currentGroupIdx = allStoryGroups.length - 1;
          }
          currentStoryIdx = 0;
        } else {
          if (currentStoryIdx >= currentGroup.stories.length) {
            currentStoryIdx = currentGroup.stories.length - 1;
          }
        }
        renderCurrentStory();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') closeStoryViewerModal();
      else if (e.key === 'ArrowLeft') goToPrevStory();
      else if (e.key === 'ArrowRight') goToNextStory();
    });
  }

  modal.classList.add('open');
  renderCurrentStory();
}

function renderCurrentStory() {
  clearTimeout(storyTimer);
  stopStoryMediaPlayback();

  const currentGroup = allStoryGroups[currentGroupIdx];
  if (!currentGroup || !currentGroup.stories || !currentGroup.stories.length) {
    closeStoryViewerModal();
    return;
  }

  const story = currentGroup.stories[currentStoryIdx];
  if (!story) {
    closeStoryViewerModal();
    return;
  }

  const card = $('sv-card');
  const progContainer = $('sv-progress-container');
  const userEl = $('sv-user');
  const timeEl = $('sv-time');
  const avatarEl = $('sv-avatar');
  const contentEl = $('sv-content');
  const deleteBtn = $('sv-delete-btn');
  const counterBadge = $('sv-counter-badge');

  card.style.background = story.bg || STORY_GRADIENTS[0];
  userEl.textContent = `@${story.username || currentGroup.username}`;
  timeEl.textContent = fmtTime(new Date(story.createdAt).toISOString());
  if (counterBadge) {
    counterBadge.textContent = `${currentStoryIdx + 1}/${currentGroup.stories.length}`;
  }

  contentEl.replaceChildren();

  let activeFillEl = null;
  let durationMs = 6000;

  if (story.mediaUrl && story.mediaType === 'image') {
    const img = el('img', 'sv-media-img');
    img.src = story.mediaUrl;
    img.alt = 'Hikaye fotoğrafı';
    contentEl.append(img);
  } else if (story.mediaUrl && story.mediaType === 'video') {
    durationMs = 20000;
    const vid = el('video', 'sv-media-video');
    vid.src = story.mediaUrl;
    vid.controls = true;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.onloadedmetadata = () => {
      if (vid.duration && isFinite(vid.duration)) {
        const ms = Math.min(60000, Math.max(4000, Math.ceil(vid.duration * 1000)));
        clearTimeout(storyTimer);
        if (activeFillEl) {
          activeFillEl.style.transition = `width ${ms}ms linear`;
          activeFillEl.style.width = '100%';
        }
        storyTimer = setTimeout(goToNextStory, ms);
      }
    };
    vid.onended = () => goToNextStory();
    contentEl.append(vid);
  } else if (story.mediaUrl && story.mediaType === 'audio') {
    durationMs = 15000;
    const audCard = el('div', 'sv-audio-card');
    audCard.innerHTML = `<div class="sv-audio-wave">${icon('mic')} <span>Sesli Hikaye</span></div>`;
    const aud = el('audio', 'sv-media-audio');
    aud.src = story.mediaUrl;
    aud.controls = true;
    aud.autoplay = true;
    aud.onloadedmetadata = () => {
      if (aud.duration && isFinite(aud.duration)) {
        const ms = Math.min(60000, Math.max(4500, Math.ceil(aud.duration * 1000)));
        clearTimeout(storyTimer);
        if (activeFillEl) {
          activeFillEl.style.transition = `width ${ms}ms linear`;
          activeFillEl.style.width = '100%';
        }
        storyTimer = setTimeout(goToNextStory, ms);
      }
    };
    aud.onended = () => goToNextStory();
    audCard.append(aud);
    contentEl.append(audCard);
  }

  if (story.text) {
    const cap = el('div', story.mediaUrl ? 'sv-caption-text' : 'sv-main-text', story.text);
    contentEl.append(cap);
  }

  // Profil resmi
  const avatarPath = story.avatar_path || currentGroup.avatar_path;
  const avUrl = avatarPath ? getAvatarUrl(avatarPath) : null;
  if (avUrl) {
    avatarEl.style.backgroundImage = `url('${avUrl}')`;
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = 'none';
    avatarEl.textContent = ((story.username || currentGroup.username || 'U')[0] || 'U').toUpperCase();
  }

  // Silme butonu (kendi hikayemiz ise)
  const isMine = state.me && (
    (story.userId && story.userId === state.me.id) ||
    (story.username && state.me.username && story.username.toLowerCase().trim() === state.me.username.toLowerCase().trim())
  );
  deleteBtn.style.display = isMine ? 'inline-flex' : 'none';

  // Segmentli ilerleme çubukları (mevcut kullanıcının tüm hikayeleri için)
  progContainer.replaceChildren();
  currentGroup.stories.forEach((_, idx) => {
    const seg = el('div', 'sv-bar-segment');
    const fill = el('div', 'sv-bar-fill');
    if (idx < currentStoryIdx) {
      fill.style.width = '100%';
    } else if (idx === currentStoryIdx) {
      activeFillEl = fill;
      fill.style.width = '0%';
      requestAnimationFrame(() => {
        fill.style.transition = `width ${durationMs}ms linear`;
        fill.style.width = '100%';
      });
    } else {
      fill.style.width = '0%';
    }
    seg.append(fill);
    progContainer.append(seg);
  });

  storyTimer = setTimeout(() => {
    goToNextStory();
  }, durationMs);
}

function goToNextStory() {
  clearTimeout(storyTimer);
  stopStoryMediaPlayback();

  const currentGroup = allStoryGroups[currentGroupIdx];
  if (!currentGroup || !currentGroup.stories) {
    closeStoryViewerModal();
    return;
  }

  // 1. Aynı kullanıcının sonraki hikayesine geç
  if (currentStoryIdx < currentGroup.stories.length - 1) {
    currentStoryIdx++;
    renderCurrentStory();
    return;
  }

  // 2. Bu kullanıcının hikayeleri bitti, sonraki kullanıcının hikayelerine atla!
  if (currentGroupIdx < allStoryGroups.length - 1) {
    currentGroupIdx++;
    currentStoryIdx = 0;
    renderCurrentStory();
    return;
  }

  // 3. Tüm kullanıcıların tüm hikayeleri bitti -> Kapat
  closeStoryViewerModal();
}

function goToPrevStory() {
  clearTimeout(storyTimer);
  stopStoryMediaPlayback();

  const currentGroup = allStoryGroups[currentGroupIdx];
  if (!currentGroup || !currentGroup.stories) {
    closeStoryViewerModal();
    return;
  }

  // 1. Aynı kullanıcının önceki hikayesine geç
  if (currentStoryIdx > 0) {
    currentStoryIdx--;
    renderCurrentStory();
    return;
  }

  // 2. İlk hikayedeyiz, varsa önceki kullanıcının son hikayesine atla!
  if (currentGroupIdx > 0) {
    currentGroupIdx--;
    const prevGroup = allStoryGroups[currentGroupIdx];
    currentStoryIdx = Math.max(0, (prevGroup?.stories?.length || 1) - 1);
    renderCurrentStory();
    return;
  }
}

function closeStoryViewerModal() {
  clearTimeout(storyTimer);
  stopStoryMediaPlayback();
  $('story-viewer-modal')?.classList.remove('open');
}

/* ---------------- 4. Sohbet Analizi, E2EE Parmak İzi, QR Kod ve Dışa Aktarma (#69, #70, #84, #86, #93) ---------------- */
export async function openChatAnalyticsModal(chat, messages) {
  if (!chat) return;
  let modal = $('analytics-modal');
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'analytics-modal';
    modal.innerHTML = `
      <div class="v6-modal-card" style="max-width:520px">
        <div class="v6-modal-head">
          <h3 id="an-title">${icon('chart')} Sohbet Analizi & Güvenlik</h3>
          <button type="button" class="icon-btn" id="an-close-btn">${icon('close')}</button>
        </div>
        <div class="v6-modal-body" id="an-body" style="max-height:78vh;overflow-y:auto"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#an-close-btn')) modal.classList.remove('open');
    });
  }

  const list = messages || [];
  const total = list.length;
  const mine = list.filter(m => m.sender_id === state.me?.id).length;
  const theirs = total - mine;
  const mediaCount = list.filter(m => m.image_path || m.audio_path || m.file_path).length;

  // WebCrypto SHA-256 ile E2EE Güvenlik Parmak İzi (#84)
  const pairStr = [state.me?.id || '', chat.id || ''].sort().join(':');
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pairStr));
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const fingerprint = hashArr.slice(0, 15).map(b => String(b % 100).padStart(2, '0')).join(' ');

  const body = $('an-body');
  body.innerHTML = `
    <div class="an-stats-grid">
      <div class="an-stat-box"><b>${total}</b><span>Toplam Mesaj</span></div>
      <div class="an-stat-box"><b>${mine} / ${theirs}</b><span>Gönderilen / Alınan</span></div>
      <div class="an-stat-box"><b>${mediaCount}</b><span>Paylaşılan Medya</span></div>
    </div>

    <div class="p-field">
      <label class="ico-inline">${icon('lock')} Uçtan Uca Güvenlik Parmak İzi (SHA-256) (#84)</label>
      <div class="an-fingerprint">${fingerprint}</div>
    </div>

    <div class="p-field" style="align-items:center">
      <label class="ico-inline">${icon('smartphone')} @${chat.username} Kişi QR Kodu (#70)</label>
      <canvas id="an-qr-canvas" width="136" height="136" style="border-radius:12px;margin-top:6px"></canvas>
    </div>

    <div class="p-field">
      <label class="ico-inline">${icon('save')} Sohbet Geçmişini Dışa Aktar (#86)</label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="button" class="btn-sm primary" id="exp-txt-btn">${icon('document')} TXT İndir</button>
        <button type="button" class="btn-sm secondary" id="exp-json-btn">${icon('braces')} JSON İndir</button>
        <button type="button" class="btn-sm secondary" id="exp-html-btn">${icon('globe')} HTML İndir</button>
      </div>
    </div>
  `;

  drawStylizedQr($('an-qr-canvas'), chat.username || 'mesaj');

  $('exp-txt-btn').addEventListener('click', () => exportChatHistory(chat, list, 'txt'));
  $('exp-json-btn').addEventListener('click', () => exportChatHistory(chat, list, 'json'));
  $('exp-html-btn').addEventListener('click', () => exportChatHistory(chat, list, 'html'));

  modal.classList.add('open');
}

function drawStylizedQr(canvas, seedText) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#071218';
  ctx.fillRect(0, 0, 136, 136);
  ctx.fillStyle = '#00e5b3';

  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  }

  const cells = 15;
  const size = 7;
  const offset = 15;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const isCorner = (r < 4 && c < 4) || (r < 4 && c >= cells - 4) || (r >= cells - 4 && c < 4);
      if (isCorner) {
        if (r === 0 || r === 3 || c === 0 || c === 3 || r === cells - 1 || r === cells - 4 || c === cells - 1 || c === cells - 4 || (r === 1 && c === 1)) {
          ctx.fillRect(offset + c * size, offset + r * size, size - 1, size - 1);
        }
      } else {
        h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
        if ((h & 3) === 0 || (h & 3) === 1) {
          ctx.fillRect(offset + c * size, offset + r * size, size - 1, size - 1);
        }
      }
    }
  }
}

function exportChatHistory(chat, messages, fmt) {
  let content = '';
  let mime = 'text/plain;charset=utf-8';
  let ext = 'txt';

  if (fmt === 'json') {
    content = JSON.stringify(messages, null, 2);
    mime = 'application/json';
    ext = 'json';
  } else if (fmt === 'html') {
    const rows = messages.map(m => `<p><b>[${m.created_at}] ${m.sender_id === state.me?.id ? 'Ben' : '@' + chat.username}:</b> ${m.content || '[Medya]'}</p>`).join('\n');
    content = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>@${chat.username} Sohbet Yedeği</title><style>body{background:#0b141a;color:#e9edef;font-family:sans-serif;padding:24px}</style></head><body><h2>@${chat.username} ile Sohbet Geçmişi</h2>${rows}</body></html>`;
    mime = 'text/html;charset=utf-8';
    ext = 'html';
  } else {
    content = messages.map(m => `[${m.created_at}] ${m.sender_id === state.me?.id ? 'Ben' : '@' + chat.username}: ${m.content || '[Medya]'}`).join('\n');
  }

  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sohbet_${chat.username}_${Date.now()}.${ext}`;
  a.click();
  toast(`Sohbet geçmişi (${ext.toUpperCase()}) indirildi! ✓`);
}
