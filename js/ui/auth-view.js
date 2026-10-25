/* ui/auth-view.js — giriş / kayıt formu */
import { $, debounce, trErr } from '../utils.js';
import { CONFIG } from '../config.js';
import { signIn, signUp, isUsernameAvailable } from '../services/auth.js';

let mode = 'login';

function setMsg(text, type = 'error') {
  const b = $('auth-msg');
  b.hidden = !text;
  b.textContent = text || '';
  b.className = 'msg-box ' + type;
}

function setMode(next) {
  mode = next;
  $('auth-tabs').dataset.mode = next;
  $('tab-login').classList.toggle('active', next === 'login');
  $('tab-register').classList.toggle('active', next === 'register');
  $('username-field').hidden = next !== 'register';
  $('auth-submit').textContent = next === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  $('auth-password').autocomplete = next === 'login' ? 'current-password' : 'new-password';
  setMsg('');
}

function setHint(text, cls) {
  const h = $('username-hint');
  h.textContent = text;
  h.className = 'hint' + (cls ? ' ' + cls : '');
}

const checkUsername = debounce(async (u) => {
  try {
    const free = await isUsernameAvailable(u);
    if ($('auth-username').value.trim().toLowerCase() !== u) return;
    free ? setHint('Kullanıcı adı müsait ✓', 'ok') : setHint('Bu kullanıcı adı alınmış', 'bad');
  } catch { setHint(''); }
}, 350);

function onUsernameInput(e) {
  e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const u = e.target.value;
  checkUsername.cancel();
  if (!u) return setHint('3-20 karakter: küçük harf, rakam, alt çizgi');
  if (!CONFIG.USERNAME_RE.test(u)) return setHint('Kullanıcı adı 3-20 karakter olmalı', 'bad');
  setHint('Kontrol ediliyor…');
  checkUsername(u);
}

async function onSubmit(e) {
  e.preventDefault();
  setMsg('');
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  if (!email || !password) return setMsg('E-posta ve şifre gerekli.');

  const btn = $('auth-submit');
  btn.disabled = true;
  try {
    if (mode === 'login') {
      await signIn(email, password);                // devamını onAuthChange yönetir
    } else {
      const username = $('auth-username').value.trim().toLowerCase();
      if (!CONFIG.USERNAME_RE.test(username)) throw new Error('Kullanıcı adı 3-20 karakter olmalı; sadece küçük harf, rakam ve _ kullanılabilir.');
      if (password.length < 6) throw new Error('Password should be at least 6 characters');
      const { needsConfirmation } = await signUp({ email, password, username });
      if (needsConfirmation) {
        setMode('login');
        setMsg('Kayıt başarılı! E-postana gelen doğrulama bağlantısına tıkladıktan sonra giriş yapabilirsin.', 'info');
      }
    }
  } catch (err) {
    setMsg(trErr(err));
  } finally {
    btn.disabled = false;
  }
}

export function initAuthView() {
  $('tab-login').addEventListener('click', () => setMode('login'));
  $('tab-register').addEventListener('click', () => setMode('register'));
  $('auth-username').addEventListener('input', onUsernameInput);
  $('auth-form').addEventListener('submit', onSubmit);
}

export function resetAuthView() {
  $('auth-password').value = '';
  setMsg('');
}
