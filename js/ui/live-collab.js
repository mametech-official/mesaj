/* =====================================================================
 *  ui/live-collab.js — v6 Gerçek Zamanlı Sesli/Görüntülü Arama (WebRTC),
 *  Ekran Paylaşımı (#51-#54), Ortak Canlı Çizim Tahtası (#55) ve Canlı Titreşim (#57)
 * ===================================================================== */
import { sb } from '../supabase.js';
import { $, el } from '../utils.js';
import { state, bus } from '../state.js';
import { playFxSound, triggerScreenShake } from './fx.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { mergeStories, deleteStoryLocally, getStories } from '../services/stories.js';

let collabChannel = null;
let pc = null;
let localStream = null;
let callPartner = null;
let callTimerInt = null;
let callSeconds = 0;
let pendingIceCandidates = [];
let virtualCamInterval = null;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function initLiveCollab() {
  if (collabChannel) return;
  collabChannel = sb.channel('mesaj-collab-v6', {
    config: { broadcast: { self: false } },
  });

  collabChannel
    .on('broadcast', { event: 'nudge' }, ({ payload }) => {
      if (!state.me || payload?.to !== state.me.id) return;
      triggerScreenShake();
      toast(`@${payload.fromName || 'Arkadaşın'} ekranını titretti!`);
    })
    .on('broadcast', { event: 'wb-draw' }, ({ payload }) => {
      if (!state.me || payload?.to !== state.me.id) return;
      drawRemoteStroke(payload.stroke);
    })
    .on('broadcast', { event: 'wb-clear' }, ({ payload }) => {
      if (!state.me || payload?.to !== state.me.id) return;
      clearWhiteboardCanvas(false);
    })
    .on('broadcast', { event: 'call-offer' }, async ({ payload }) => {
      if (!state.me || payload?.to !== state.me.id) return;
      await onIncomingCallOffer(payload);
    })
    .on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
      if (!state.me || payload?.to !== state.me.id || !pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await flushPendingIce();
        setCallStatus('Bağlandı • Canlı Görüşme');
      } catch {}
    })
    .on('broadcast', { event: 'call-ice' }, async ({ payload }) => {
      if (!state.me || payload?.to !== state.me.id || !payload.candidate) return;
      if (!pc || !pc.remoteDescription) {
        pendingIceCandidates.push(payload.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {}
    })
    .on('broadcast', { event: 'call-end' }, ({ payload }) => {
      if (!state.me || payload?.to !== state.me.id) return;
      endCall(false);
      toast('Görüşme sonlandırıldı.');
    })
    .on('broadcast', { event: 'story-new' }, ({ payload }) => {
      if (payload?.story) {
        mergeStories([payload.story]);
      }
    })
    .on('broadcast', { event: 'story-delete' }, ({ payload }) => {
      if (payload?.storyId) {
        deleteStoryLocally(payload.storyId);
      }
    })
    .on('broadcast', { event: 'story-request' }, () => {
      const stories = getStories();
      if (stories.length && collabChannel) {
        collabChannel.send({
          type: 'broadcast',
          event: 'story-sync',
          payload: { stories },
        });
      }
    })
    .on('broadcast', { event: 'story-sync' }, ({ payload }) => {
      if (payload?.stories && Array.isArray(payload.stories)) {
        mergeStories(payload.stories);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Çevrim içi diğer kullanıcılardan mevcut hikayeleri iste
        collabChannel.send({
          type: 'broadcast',
          event: 'story-request',
          payload: {},
        });
      }
    });

  // Yeni hikaye veya silinme durumunda yayın gönder
  bus.on('story:broadcast', (story) => {
    if (!collabChannel || !story) return;
    collabChannel.send({
      type: 'broadcast',
      event: 'story-new',
      payload: { story },
    });
  });

  bus.on('story:broadcast_delete', (storyId) => {
    if (!collabChannel || !storyId) return;
    collabChannel.send({
      type: 'broadcast',
      event: 'story-delete',
      payload: { storyId },
    });
  });
}

export function sendNudgeBroadcast(targetUserId) {
  if (!collabChannel || !state.me) return;
  triggerScreenShake();
  collabChannel.send({
    type: 'broadcast',
    event: 'nudge',
    payload: { to: targetUserId, from: state.me.id, fromName: state.me.username },
  });
}

/* ---------------- 1. WebRTC Sesli / Görüntülü Arama & Ekran Paylaşımı (#51-#54) ---------------- */
function ensureCallModal() {
  let modal = $('call-modal');
  if (modal) return modal;
  modal = el('div', 'v6-modal');
  modal.id = 'call-modal';
  modal.innerHTML = `
    <div class="v6-modal-card call-card">
      <div class="call-top">
        <div class="call-partner" id="call-partner-name">@kullanici</div>
        <div class="call-status" id="call-status-text">Aranıyor…</div>
        <div class="call-timer" id="call-timer-text">00:00</div>
      </div>
      <div class="call-video-stage">
        <video id="call-remote-video" autoplay playsinline></video>
        <video id="call-local-video" autoplay playsinline muted></video>
      </div>
      <div class="call-controls">
        <button type="button" class="call-btn" id="call-mute-btn" title="Mikrofonu Kapat/Aç">${icon('mic')}</button>
        <button type="button" class="call-btn" id="call-cam-btn" title="Kamerayı Kapat/Aç">${icon('video')}</button>
        <button type="button" class="call-btn" id="call-screen-btn" title="Ekran Paylaş (#53)">${icon('monitor')}</button>
        <button type="button" class="call-btn accept" id="call-accept-btn" hidden title="Kabul Et">${icon('phone')} Kabul Et</button>
        <button type="button" class="call-btn danger" id="call-hangup-btn" title="Kapat">${icon('phoneHangup')} Bitir</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  $('call-mute-btn').addEventListener('click', () => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      $('call-mute-btn').classList.toggle('off', !track.enabled);
      $('call-mute-btn').innerHTML = icon(track.enabled ? 'mic' : 'micOff');
      toast(track.enabled ? 'Mikrofon açık' : 'Mikrofon sessize alındı');
    }
  });

  $('call-cam-btn').addEventListener('click', () => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      $('call-cam-btn').classList.toggle('off', !track.enabled);
      $('call-cam-btn').innerHTML = icon(track.enabled ? 'video' : 'videoOff');
    }
  });

  $('call-screen-btn').addEventListener('click', async () => {
    if (!pc) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
      $('call-local-video').srcObject = screenStream;
      screenTrack.onended = async () => {
        const camTrack = localStream?.getVideoTracks()?.[0];
        if (sender && camTrack) await sender.replaceTrack(camTrack);
        $('call-local-video').srcObject = localStream;
      };
    } catch {
      toast('Ekran paylaşımı başlatılamadı.');
    }
  });

  $('call-hangup-btn').addEventListener('click', () => endCall(true));
  return modal;
}

function setCallStatus(text) {
  const elStatus = $('call-status-text');
  if (elStatus) elStatus.textContent = text;
}

function startCallTimer() {
  clearInterval(callTimerInt);
  callSeconds = 0;
  callTimerInt = setInterval(() => {
    callSeconds++;
    const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const s = String(callSeconds % 60).padStart(2, '0');
    const t = $('call-timer-text');
    if (t) t.textContent = `${m}:${s}`;
  }, 1000);
}

async function flushPendingIce() {
  if (!pc || !pc.remoteDescription || !pendingIceCandidates.length) return;
  const list = pendingIceCandidates.splice(0, pendingIceCandidates.length);
  for (const cand of list) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(cand));
    } catch {}
  }
}

/**
 * Fiziksel kamera başka bir tarayıcı/uygulama tarafından kilitlendiğinde veya bulunamadığında
 * görüntülü aramanın kesintisiz çalışması için canlı animasyonlu sanal kamera akışı üretir.
 */
function createVirtualVideoTrack(username = 'kullanici') {
  clearInterval(virtualCamInterval);
  const cv = document.createElement('canvas');
  cv.width = 480;
  cv.height = 360;
  const ctx = cv.getContext('2d');
  let tick = 0;

  const draw = () => {
    tick += 0.08;
    const grad = ctx.createLinearGradient(0, 0, cv.width, cv.height);
    grad.addColorStop(0, '#07161e');
    grad.addColorStop(1, '#102836');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);

    // Dalgalı halka
    const cx = cv.width / 2;
    const cy = cv.height / 2 - 14;
    for (let i = 1; i <= 3; i++) {
      const r = 46 + i * 18 + Math.sin(tick - i) * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 229, 179, ${0.28 / i})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Avatar dairesi
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fillStyle = '#00a884';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((username || 'U')[0].toUpperCase(), cx, cy);

    ctx.fillStyle = '#eef2f5';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`@${username}`, cx, cy + 72);
    ctx.fillStyle = '#8fa1ad';
    ctx.font = '12px sans-serif';
    ctx.fillText('Canlı Görüşme Aktif', cx, cy + 94);
  };

  draw();
  virtualCamInterval = setInterval(draw, 80);
  const stream = cv.captureStream(15);
  return stream.getVideoTracks()[0];
}

async function acquireCallStream(withVideo) {
  if (!withVideo) {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }

  // 1. Önce hem mikrofon hem fiziksel kamerayı dene
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
    });
  } catch {}

  // 2. Kamera başka tarayıcıda meşgulse veya yoksa: mikrofonu al + sanal video ekle
  try {
    const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const vTrack = createVirtualVideoTrack(state.me?.username || 'ben');
    if (vTrack) audioOnlyStream.addTrack(vTrack);
    toast('Kamera başka uygulamada meşgul veya bulunamadı; ses + canlı profil görüntüsü ile bağlanıldı.');
    return audioOnlyStream;
  } catch {}

  // 3. Yalnızca kamera erişilebiliyorsa
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  } catch (err) {
    throw err;
  }
}

export async function startCall(partner, withVideo = false) {
  if (!partner || !state.me) return;
  initLiveCollab();
  callPartner = partner;
  pendingIceCandidates = [];
  const modal = ensureCallModal();
  $('call-partner-name').textContent = `@${partner.username}`;
  $('call-accept-btn').hidden = true;
  setCallStatus(withVideo ? 'Görüntülü aranıyor…' : 'Sesli aranıyor…');
  modal.classList.add('open');
  playFxSound('ring');

  try {
    localStream = await acquireCallStream(withVideo);
    const localVid = $('call-local-video');
    localVid.srcObject = localStream;
    localVid.play?.().catch(() => {});

    pc = new RTCPeerConnection(ICE_SERVERS);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = (e) => {
      const remVid = $('call-remote-video');
      remVid.srcObject = e.streams[0];
      remVid.play?.().catch(() => {});
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && collabChannel) {
        collabChannel.send({
          type: 'broadcast',
          event: 'call-ice',
          payload: { to: partner.id, from: state.me.id, candidate: e.candidate },
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    collabChannel.send({
      type: 'broadcast',
      event: 'call-offer',
      payload: {
        to: partner.id,
        from: state.me.id,
        fromName: state.me.username,
        withVideo,
        sdp: pc.localDescription,
      },
    });
    startCallTimer();
  } catch (err) {
    toast('Mikrofon veya kamera izni alınamadı.');
    endCall(false);
  }
}

async function onIncomingCallOffer(payload) {
  callPartner = { id: payload.from, username: payload.fromName || 'arkadas' };
  pendingIceCandidates = [];
  const modal = ensureCallModal();
  $('call-partner-name').textContent = `@${callPartner.username}`;
  setCallStatus(payload.withVideo ? 'Gelen Görüntülü Arama…' : 'Gelen Sesli Arama…');
  const accBtn = $('call-accept-btn');
  accBtn.hidden = false;
  modal.classList.add('open');
  playFxSound('ring');

  accBtn.onclick = async () => {
    accBtn.hidden = true;
    try {
      localStream = await acquireCallStream(!!payload.withVideo);
      const localVid = $('call-local-video');
      localVid.srcObject = localStream;
      localVid.play?.().catch(() => {});

      pc = new RTCPeerConnection(ICE_SERVERS);
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
      pc.ontrack = (e) => {
        const remVid = $('call-remote-video');
        remVid.srcObject = e.streams[0];
        remVid.play?.().catch(() => {});
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && collabChannel) {
          collabChannel.send({
            type: 'broadcast',
            event: 'call-ice',
            payload: { to: callPartner.id, from: state.me.id, candidate: e.candidate },
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      collabChannel.send({
        type: 'broadcast',
        event: 'call-answer',
        payload: { to: callPartner.id, from: state.me.id, sdp: pc.localDescription },
      });
      setCallStatus('Bağlandı • Canlı Görüşme');
      startCallTimer();
    } catch {
      toast('Arama yanıtlanamadı (Mikrofon/Kamera izni gerekli).');
      endCall(true);
    }
  };
}

export function endCall(notifyRemote = true) {
  clearInterval(callTimerInt);
  clearInterval(virtualCamInterval);
  virtualCamInterval = null;
  pendingIceCandidates = [];
  if (notifyRemote && callPartner && collabChannel && state.me) {
    collabChannel.send({
      type: 'broadcast',
      event: 'call-end',
      payload: { to: callPartner.id, from: state.me.id },
    });
  }
  if (pc) { try { pc.close(); } catch {} pc = null; }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  const modal = $('call-modal');
  if (modal) modal.classList.remove('open');
  callPartner = null;
}

/* ---------------- 2. Ortak Canlı Çizim Tahtası (Whiteboard) (#55) ---------------- */
let wbCtx = null;
let wbColor = '#00e5b3';
let wbPartnerId = null;
let wbSendAsImageCallback = null;

export function openWhiteboardModal(partnerId, onSendImage) {
  initLiveCollab();
  wbPartnerId = partnerId;
  wbSendAsImageCallback = onSendImage;

  let modal = $('whiteboard-modal');
  if (!modal) {
    modal = el('div', 'v6-modal');
    modal.id = 'whiteboard-modal';
    modal.innerHTML = `
      <div class="v6-modal-card" style="max-width:640px">
        <div class="v6-modal-head">
          <h3>${icon('palette')} Canlı Ortak Çizim Tahtası</h3>
          <button type="button" class="icon-btn" id="wb-close-btn">${icon('close')}</button>
        </div>
        <div class="v6-modal-body" style="align-items:center">
          <div class="wb-toolbar">
            <button type="button" class="wb-color active" data-color="#00e5b3" style="background:#00e5b3"></button>
            <button type="button" class="wb-color" data-color="#38bdf8" style="background:#38bdf8"></button>
            <button type="button" class="wb-color" data-color="#f43f5e" style="background:#f43f5e"></button>
            <button type="button" class="wb-color" data-color="#fbbf24" style="background:#fbbf24"></button>
            <button type="button" class="wb-color" data-color="#ffffff" style="background:#ffffff"></button>
            <button type="button" class="btn-sm secondary" id="wb-clear-btn">${icon('trash')} Temizle</button>
            <button type="button" class="btn-sm primary" id="wb-send-btn">${icon('send')} Sohbete Gönder</button>
          </div>
          <canvas id="wb-canvas" width="580" height="360"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('#wb-close-btn')) modal.classList.remove('open');
    });

    modal.querySelectorAll('.wb-color').forEach(b => {
      b.addEventListener('click', () => {
        modal.querySelectorAll('.wb-color').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        wbColor = b.dataset.color;
      });
    });

    $('wb-clear-btn').addEventListener('click', () => clearWhiteboardCanvas(true));
    $('wb-send-btn').addEventListener('click', () => {
      const c = $('wb-canvas');
      c.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `cizim_${Date.now()}.png`, { type: 'image/png' });
        modal.classList.remove('open');
        if (wbSendAsImageCallback) wbSendAsImageCallback(file);
      }, 'image/png');
    });

    const canvas = $('wb-canvas');
    wbCtx = canvas.getContext('2d');
    clearWhiteboardCanvas(false);

    let drawing = false;
    let lastPos = { x: 0, y: 0 };

    const getPos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height,
      };
    };

    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      lastPos = getPos(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const pos = getPos(e);
      const stroke = { x1: lastPos.x, y1: lastPos.y, x2: pos.x, y2: pos.y, color: wbColor };
      drawRemoteStroke(stroke);
      if (collabChannel && wbPartnerId && state.me) {
        collabChannel.send({
          type: 'broadcast',
          event: 'wb-draw',
          payload: { to: wbPartnerId, from: state.me.id, stroke },
        });
      }
      lastPos = pos;
    });
    window.addEventListener('pointerup', () => { drawing = false; });
  }

  modal.classList.add('open');
}

function drawRemoteStroke(s) {
  if (!wbCtx || !s) return;
  wbCtx.strokeStyle = s.color || '#00e5b3';
  wbCtx.lineWidth = 3.5;
  wbCtx.lineCap = 'round';
  wbCtx.beginPath();
  wbCtx.moveTo(s.x1, s.y1);
  wbCtx.lineTo(s.x2, s.y2);
  wbCtx.stroke();
}

function clearWhiteboardCanvas(broadcast = false) {
  const canvas = $('wb-canvas');
  if (!canvas || !wbCtx) return;
  wbCtx.fillStyle = '#0a131a';
  wbCtx.fillRect(0, 0, canvas.width, canvas.height);
  if (broadcast && collabChannel && wbPartnerId && state.me) {
    collabChannel.send({
      type: 'broadcast',
      event: 'wb-clear',
      payload: { to: wbPartnerId, from: state.me.id },
    });
  }
}
