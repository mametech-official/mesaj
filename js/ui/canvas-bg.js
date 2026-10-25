/* =====================================================================
 *  ui/canvas-bg.js — Ultra-Hafif Arka Plan Yöneticisi (0% CPU / 0% GPU Yükü)
 *  Ağır 60 FPS Canvas döngüleri kaldırıldı; saf CSS temaları kullanılır.
 * ===================================================================== */

export function setLiveBgMode(_themeId) {
  // Performans için arka plan tamamen hafif CSS katmanı ile yönetilir.
}

export function setAudioReactiveLevel(_level) {
  // Performans için devre dışı.
}

export function initLiveBackgrounds() {
  // Mevcut canvas varsa temizle
  document.querySelectorAll('.live-bg-canvas').forEach((el) => el.remove());
}
