/* =====================================================================
 *  ui/composer.js — v6 Yazma Alanı:
 *  Metin, Emoji, Fotoğraf, Video, Belge, Ses Kaydı (Ses Duyarlı Aurora #9),
 *  Yanıtlama, Düzenleme, Eğik Çizgi (/) Komut Menüsü (#74),
 *  Otomatik Taslak (#80), Kamera (#45), Sesli Dikte (#48), Anket (#33),
 *  Yapılacaklar (#77), Oyun (#59), Konum (#40) ve Ortak Çizim Tahtası (#55)
 * ===================================================================== */
import { $, el, fmtDuration, trErr } from '../utils.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { VoiceRecorder } from '../services/recorder.js';
import { initEmojiPicker } from './emoji-picker.js';
import { createAudioPlayer } from './audio-player.js';
import { SLASH_COMMANDS, transformOutgoingCommand, openLocationPickerModal } from './rich-content.js';
import { openCameraModal, startVoiceDictation } from './media-studio.js';
import { openWhiteboardModal, sendNudgeBroadcast } from './live-collab.js';
import { setAudioReactiveLevel } from './canvas-bg.js';
import { triggerParticleBurst, checkAndTriggerCelebration, playFxSound } from './fx.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

export function initComposer({ send, onTyping, onImage, onVideo, onDocument, onEdit }) {
  const input = $('msg-input');
  const actionWrap = $('action-wrap');
  const composerForm = $('composer');
  const recBar = $('recorder-bar');
  const bannerContainer = $('composer-banner-container');
  const blockedBanner = $('blocked-banner');
  let busy = false;

  let replyTarget = null;
  let editTarget = null;

  /* ---------------- 1. Otomatik Taslak Kaydedici (#80) ---------------- */
  function saveDraft() {
    if (!state.activeChat) return;
    try {
      const k = `wa_draft_${state.activeChat.id}`;
      if (input.value) localStorage.setItem(k, input.value);
      else localStorage.removeItem(k);
    } catch {}
  }

  function loadDraft(chatId) {
    if (!chatId) return;
    try {
      const saved = localStorage.getItem(`wa_draft_${chatId}`) || '';
      input.value = saved;
      autoGrow();
      updateAction();
    } catch {}
  }

  /* ---------------- 2. Metin & Eğik Çizgi (/) Komut Menüsü (#74) ---------------- */
  function autoGrow() {
    input.style.height = 'auto';
    const nextH = Math.max(48, Math.min(input.scrollHeight, 140));
    input.style.height = nextH + 'px';
    if (nextH > 56) {
      composerForm.style.alignItems = 'flex-end';
    } else {
      composerForm.style.alignItems = 'center';
    }
  }
  function updateAction() {
    actionWrap.classList.toggle('has-text', input.value.trim().length > 0);
  }
  function insertAtCursor(text) {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? input.value.length;
    if (input.value.length + text.length > input.maxLength) return;
    input.value = input.value.slice(0, s) + text + input.value.slice(e);
    input.selectionStart = input.selectionEnd = s + text.length;
    input.focus();
    autoGrow(); updateAction(); saveDraft(); onTyping();
  }

  const picker = initEmojiPicker({ onPick: insertAtCursor });

  // Slash Komut Açılır Menüsü
  let slashMenu = $('slash-cmd-menu');
  if (!slashMenu && composerForm) {
    slashMenu = el('div', 'slash-cmd-menu');
    slashMenu.id = 'slash-cmd-menu';
    slashMenu.hidden = true;
    composerForm.parentElement?.insertBefore(slashMenu, composerForm);
  }

  function checkSlashMenu() {
    if (!slashMenu) return;
    const val = input.value;
    if (!val.startsWith('/') || val.includes(' ')) {
      slashMenu.hidden = true;
      return;
    }
    const q = val.toLowerCase();
    const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(q));
    if (!matches.length) {
      slashMenu.hidden = true;
      return;
    }
    slashMenu.replaceChildren();
    matches.forEach(m => {
      const btn = el('button', 'slash-cmd-item');
      btn.type = 'button';
      btn.innerHTML = `<b>${m.cmd}</b><span>${m.desc}</span>`;
      btn.addEventListener('click', () => {
        if (m.cmd === '/tahta') {
          input.value = '';
          slashMenu.hidden = true;
          if (state.activeChat) openWhiteboardModal(state.activeChat.id, onImage);
          return;
        }
        if (m.cmd === '/konum') {
          input.value = '';
          slashMenu.hidden = true;
          autoGrow(); updateAction();
          openLocationPickerModal(async (locPayload) => {
            const replyId = replyTarget ? replyTarget.id : null;
            playFxSound('out');
            await send({ content: locPayload, replyToId: replyId });
            cancelReply();
          });
          return;
        }
        input.value = m.sample;
        slashMenu.hidden = true;
        input.focus();
        autoGrow();
        updateAction();
      });
      slashMenu.appendChild(btn);
    });
    slashMenu.hidden = false;
  }

  /* ---------------- 3. Yanıt & Düzenleme Banner ---------------- */
  function renderBanner() {
    if (!bannerContainer) return;
    bannerContainer.innerHTML = '';
    if (editTarget) {
      const b = el('div', 'composer-banner edit-mode');
      const info = el('div', 'cb-info');
      info.append(el('div', 'cb-title', 'Mesajı Düzenle'), el('div', 'cb-desc', editTarget.content || ''));
      const btn = el('button', 'icon-btn cb-close');
      btn.type = 'button';
      btn.innerHTML = icon('close');
      btn.addEventListener('click', cancelEdit);
      b.append(info, btn);
      bannerContainer.append(b);
      bannerContainer.hidden = false;
    } else if (replyTarget) {
      const b = el('div', 'composer-banner');
      const info = el('div', 'cb-info');
      const desc = replyTarget.content || (replyTarget.image_path ? 'Fotoğraf' : replyTarget.audio_path ? 'Sesli mesaj' : 'Belge');
      info.append(el('div', 'cb-title', `Yanıtlanan: @${replyTarget.authorName || 'kullanıcı'}`), el('div', 'cb-desc', desc));
      const btn = el('button', 'icon-btn cb-close');
      btn.type = 'button';
      btn.innerHTML = icon('close');
      btn.addEventListener('click', cancelReply);
      b.append(info, btn);
      bannerContainer.append(b);
      bannerContainer.hidden = false;
    } else {
      bannerContainer.hidden = true;
    }
  }

  function startReply(m, authorName) {
    cancelEdit();
    replyTarget = { ...m, authorName };
    renderBanner();
    input.focus();
  }

  function cancelReply() {
    replyTarget = null;
    renderBanner();
  }

  function startEdit(m) {
    cancelReply();
    editTarget = m;
    renderBanner();
    input.value = m.content || '';
    autoGrow();
    updateAction();
    input.focus();
  }

  function cancelEdit() {
    editTarget = null;
    renderBanner();
    input.value = '';
    autoGrow();
    updateAction();
  }

  async function submitText() {
    const rawText = input.value.trim();
    if (!rawText || busy) return;
    if (slashMenu) slashMenu.hidden = true;

    if (rawText === '/tahta') {
      input.value = '';
      autoGrow(); updateAction();
      if (state.activeChat) openWhiteboardModal(state.activeChat.id, onImage);
      return;
    }

    if (rawText.toLowerCase() === '/konum') {
      input.value = '';
      saveDraft();
      autoGrow(); updateAction();
      openLocationPickerModal(async (locPayload) => {
        const replyId = replyTarget ? replyTarget.id : null;
        playFxSound('out');
        await send({ content: locPayload, replyToId: replyId });
        cancelReply();
      });
      return;
    }

    busy = true;
    try {
      if (editTarget) {
        await onEdit(editTarget, rawText);
        cancelEdit();
      } else {
        if (rawText === '/titret' && state.activeChat) {
          sendNudgeBroadcast(state.activeChat.id);
        }
        const transformed = await transformOutgoingCommand(rawText, state.me?.username || 'ben');
        const replyId = replyTarget ? replyTarget.id : null;

        // Parçacık patlaması (#3) ve kutlama yağmuru (#12)
        const sendRect = $('send-btn')?.getBoundingClientRect();
        if (sendRect) triggerParticleBurst(sendRect.left + 20, sendRect.top + 20);
        checkAndTriggerCelebration(transformed);
        playFxSound('out');

        await send({ content: transformed, replyToId: replyId });
        input.value = '';
        saveDraft();
        cancelReply();
        autoGrow(); updateAction();
      }
    } catch (err) {
      toast('İşlem başarısız: ' + trErr(err));
    } finally {
      busy = false;
      input.focus();
    }
  }

  composerForm.addEventListener('submit', (e) => { e.preventDefault(); submitText(); });
  input.addEventListener('input', () => {
    autoGrow();
    updateAction();
    saveDraft();
    checkSlashMenu();
    if (input.value.trim()) onTyping();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitText(); }
    if (e.key === 'Escape') {
      if (slashMenu && !slashMenu.hidden) slashMenu.hidden = true;
      else if (editTarget) cancelEdit();
      else if (replyTarget) cancelReply();
    }
  });

  input.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); onImage(f); }
  });

  $('emoji-btn').addEventListener('click', () => picker.toggle());

  /* ---------------- 4. Zenginleştirilmiş Ek Menüsü (Attach Popover) ---------------- */
  const attachMenu = $('attach-menu');
  if (attachMenu && !attachMenu.dataset.v6Ready) {
    attachMenu.dataset.v6Ready = '1';
    const extras = [
      { id: 'btn-attach-cam',   ico: 'camera',     label: 'Kamera ile Çek', action: () => openCameraModal(onImage) },
      { id: 'btn-attach-poll',  ico: 'chart',      label: 'Canlı Anket Oluştur', action: () => { input.value = '/anket Akşam ne yapalım? | Sinema | Kahve | Oyun'; autoGrow(); updateAction(); input.focus(); } },
      { id: 'btn-attach-todo',  ico: 'listChecks', label: 'Ortak Yapılacaklar', action: () => { input.value = '/todo Görev Listesi | İlk madde | İkinci madde'; autoGrow(); updateAction(); input.focus(); } },
      { id: 'btn-attach-game',  ico: 'gamepad',    label: 'Canlı XOX Oyunu', action: () => { input.value = '/xox'; submitText(); } },
      { id: 'btn-attach-loc',   ico: 'mapPin',     label: 'Konum Paylaş', action: () => {
        openLocationPickerModal(async (locPayload) => {
          const replyId = replyTarget ? replyTarget.id : null;
          playFxSound('out');
          await send({ content: locPayload, replyToId: replyId });
          cancelReply();
        });
      } },
      { id: 'btn-attach-wb',    ico: 'palette',    label: 'Ortak Çizim Tahtası', action: () => { if (state.activeChat) openWhiteboardModal(state.activeChat.id, onImage); } },
      { id: 'btn-attach-dict',  ico: 'mic',        label: 'Sesli Dikte (Yazıya Çevir)', action: () => startVoiceDictation((txt) => insertAtCursor(txt + ' ')) },
    ];
    extras.forEach(ex => {
      const b = el('button', '');
      b.innerHTML = `${icon(ex.ico)} ${ex.label}`;
      b.type = 'button';
      b.id = ex.id;
      b.addEventListener('click', () => {
        attachMenu.hidden = true;
        ex.action();
      });
      attachMenu.appendChild(b);
    });
  }

  $('attach-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (attachMenu) attachMenu.hidden = !attachMenu.hidden;
  });

  document.addEventListener('click', (e) => {
    if (attachMenu && !attachMenu.hidden && !e.target.closest('#attach-menu') && !e.target.closest('#attach-btn')) {
      attachMenu.hidden = true;
    }
  });

  $('btn-attach-image').addEventListener('click', () => {
    if (attachMenu) attachMenu.hidden = true;
    $('file-input').click();
  });
  $('btn-attach-video').addEventListener('click', () => {
    if (attachMenu) attachMenu.hidden = true;
    $('video-input').click();
  });
  $('btn-attach-doc').addEventListener('click', () => {
    if (attachMenu) attachMenu.hidden = true;
    $('doc-input').click();
  });

  $('file-input').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) onImage(f);
  });
  $('video-input').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) onVideo(f);
  });
  $('doc-input').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) onDocument(f);
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picker.isOpen()) picker.close(); });
  document.addEventListener('click', (e) => {
    if (picker.isOpen() && !e.target.closest('#emoji-panel') && !e.target.closest('#emoji-btn')) {
      picker.close();
    }
  });

  /* ---------------- 5. Ses Kaydı + Ses Frekansına Duyarlı Aurora (#9) ---------------- */
  const canvas = $('rec-canvas');
  const levels = [];
  let recorder = null;
  let recorded = null;
  let previewUrl = null;

  if (!VoiceRecorder.supported) $('mic-btn').hidden = true;

  function drawLevels() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#00e5b3';
    const gap = 3, bw = 3, max = Math.floor(w / (bw + gap));
    const visible = levels.slice(-max);
    visible.forEach((lv, i) => {
      const bh = Math.max(3, lv * h);
      const x = w - (visible.length - i) * (bw + gap);
      ctx.fillRect(x, (h - bh) / 2, bw, bh);
    });
  }

  function setRecUI(mode) {
    if (mode === 'live') {
      composerForm.hidden = true;
      recBar.hidden = false;
      $('rec-live').hidden = false;
      $('rec-preview').hidden = true;
      $('rec-send').hidden = true;
      $('rec-stop').hidden = false;
    } else if (mode === 'preview') {
      composerForm.hidden = true;
      recBar.hidden = false;
      $('rec-live').hidden = true;
      $('rec-preview').hidden = false;
      $('rec-send').hidden = false;
      $('rec-stop').hidden = true;
    } else {
      recBar.hidden = true;
      composerForm.hidden = false;
      $('rec-live').hidden = true;
      $('rec-preview').hidden = true;
    }
  }

  function discardRecorded() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    recorded = null;
    const p = $('rec-player-mount');
    if (p) p.replaceChildren();
  }

  async function startRecording() {
    picker.close();
    levels.length = 0;
    try {
      recorder = new VoiceRecorder({
        onData: (d) => {
          levels.push(d.level);
          setAudioReactiveLevel(d.level);
          $('rec-timer').textContent = fmtDuration(d.durationMs);
          drawLevels();
        },
        onError: (err) => {
          toast(err?.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi.' : 'Kayıt başlatılamadı.');
          cancelRecording(false);
        },
      });
      await recorder.start();
      setRecUI('live');
    } catch (_) {
      cancelRecording(false);
    }
  }

  async function finishRecording() {
    if (!recorder) return;
    try {
      const res = await recorder.stop();
      recorder = null;
      if (res.durationMs < CONFIG.MIN_AUDIO_MS) {
        toast('Kayıt çok kısa.');
        cancelRecording(true);
        return;
      }
      recorded = res;
      previewUrl = URL.createObjectURL(res.blob);
      const player = createAudioPlayer({
        getSrc: async () => previewUrl,
        durationMs: res.durationMs,
        seed: 'preview',
      });
      const mount = $('rec-player-mount') || $('rec-preview');
      if (mount) mount.replaceChildren(player);
      setRecUI('preview');
    } catch (_) {
      cancelRecording(true);
    }
  }

  function cancelRecording(focus = true) {
    if (recorder) { recorder.cancel(); recorder = null; }
    discardRecorded();
    setRecUI('off');
    if (focus) input.focus();
  }

  async function sendRecording() {
    if (!recorded || busy) return;
    busy = true;
    const btn = $('rec-send');
    btn.disabled = true;
    try {
      playFxSound('out');
      await send({ audio: recorded, replyToId: replyTarget ? replyTarget.id : null });
      cancelReply();
      discardRecorded();
      setRecUI('off');
    } catch (err) {
      toast('Gönderilemedi: ' + trErr(err));
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  $('mic-btn').addEventListener('click', startRecording);
  $('rec-stop').addEventListener('click', finishRecording);
  $('rec-cancel').addEventListener('click', () => cancelRecording());
  $('rec-send').addEventListener('click', sendRecording);

  autoGrow();
  updateAction();

  return {
    startReply,
    cancelReply,
    startEdit,
    cancelEdit,
    insertText: insertAtCursor,
    loadDraft,
    setBlocked(isBlocked, isBlockedByThem, onUnblock) {
      if (isBlocked || isBlockedByThem) {
        composerForm.hidden = true;
        recBar.hidden = true;
        if (blockedBanner) {
          blockedBanner.hidden = false;
          if (isBlocked) {
            blockedBanner.innerHTML = 'Bu kullanıcıyı engellediniz. <button type="button" id="unblock-inline-btn">Engeli Kaldır</button>';
            const b = $('unblock-inline-btn');
            if (b && onUnblock) b.addEventListener('click', onUnblock);
          } else {
            blockedBanner.innerHTML = 'Bu kullanıcıya mesaj gönderemezsiniz.';
          }
        }
      } else {
        if (blockedBanner) blockedBanner.hidden = true;
        composerForm.hidden = false;
      }
    },
    reset() {
      cancelRecording(false);
      cancelReply();
      cancelEdit();
      picker.close();
      input.value = '';
      if (attachMenu) attachMenu.hidden = true;
      if (slashMenu) slashMenu.hidden = true;
      autoGrow(); updateAction();
    },
    focus() { input.focus(); },
  };
}
