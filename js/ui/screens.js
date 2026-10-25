/* ui/screens.js — boot / auth / app ekranları arasında akıcı geçiş */
import { $ } from '../utils.js';

export function showScreen(name) {
  const bootEl = $('boot');
  if (name !== 'boot' && bootEl && !bootEl.classList.contains('boot-hide')) {
    bootEl.classList.add('boot-hide');
    setTimeout(() => {
      bootEl.hidden = true;
    }, 340);
  } else if (name === 'boot' && bootEl) {
    bootEl.hidden = false;
    bootEl.classList.remove('boot-hide');
  }

  $('auth-screen').hidden = name !== 'auth';
  $('app').hidden = name !== 'app';
}
