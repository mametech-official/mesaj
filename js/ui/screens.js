/* ui/screens.js — boot / auth / app ekranları arasında geçiş */
import { $ } from '../utils.js';

export function showScreen(name) {
  $('boot').hidden = name !== 'boot';
  $('auth-screen').hidden = name !== 'auth';
  $('app').hidden = name !== 'app';
}
