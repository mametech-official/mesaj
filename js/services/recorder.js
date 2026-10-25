/* services/recorder.js — MediaRecorder ile sesli mesaj kaydı (DOM'dan bağımsız) */
import { CONFIG } from '../config.js';

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export class VoiceRecorder {
  static get supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /** @param {{onTick?:(ms:number)=>void, onLevel?:(level:number)=>void, onLimit?:()=>void}} cb */
  constructor({ onTick, onLevel, onLimit } = {}) {
    this.onTick = onTick; this.onLevel = onLevel; this.onLimit = onLimit;
    this.chunks = []; this.stream = null; this.rec = null; this.ctx = null;
    this.analyser = null; this.timer = null; this.startedAt = 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = CANDIDATES.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };

    try {                                            // canlı ses seviyesi
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
    } catch (_) { this.analyser = null; }

    this.startedAt = Date.now();
    this.rec.start(250);
    const buf = this.analyser ? new Uint8Array(this.analyser.fftSize) : null;
    this.timer = setInterval(() => {
      const elapsed = Date.now() - this.startedAt;
      this.onTick && this.onTick(elapsed);
      if (buf) {
        this.analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        this.onLevel && this.onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3.2));
      }
      if (elapsed >= CONFIG.MAX_AUDIO_SEC * 1000) this.onLimit && this.onLimit();
    }, 100);
  }

  /** @returns {Promise<{blob:Blob, durationMs:number}>} */
  stop() {
    return new Promise((resolve) => {
      const durationMs = Date.now() - this.startedAt;
      const type = (this.rec && this.rec.mimeType) || 'audio/webm';
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type });
        this._cleanup();
        resolve({ blob, durationMs });
      };
      if (this.rec.state !== 'inactive') this.rec.stop();
      else this.rec.onstop();
    });
  }

  cancel() {
    if (this.rec && this.rec.state !== 'inactive') { this.rec.onstop = null; this.rec.stop(); }
    this._cleanup();
  }

  _cleanup() {
    clearInterval(this.timer); this.timer = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    this.stream = null; this.ctx = null; this.analyser = null;
  }
}
