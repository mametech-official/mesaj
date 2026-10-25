/* =====================================================================
 *  ui/rich-content.js — v6 Zengin Mesajlaşma Motoru:
 *  Markdown, Kod Blokları, Spoiler, Canlı Anket (Poll), Yapılacaklar (Checklist),
 *  Mini Oyunlar (XOX, Taş-Kağıt-Makas, Zar), Konum Kartı, Bağlantı Önizlemesi,
 *  Süreli/Tek Gösterimlik Mesajlar, Akıllı Yanıtlar, Anlık Çeviri, Eğik Çizgi Komutları
 * ===================================================================== */
import { el } from '../utils.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

/* ---------------- 1. Eğik Çizgi (/) Komut Tanımları (#74) ---------------- */
export const SLASH_COMMANDS = [
  { cmd: '/anket',   desc: 'Canlı oylama anketi oluştur',       sample: '/anket Akşam ne yapalım? | Sinema | Kahve | Oyun' },
  { cmd: '/todo',    desc: 'Ortak yapılacaklar listesi gönder', sample: '/todo Alışveriş Listesi | Süt | Ekmek | Kahve' },
  { cmd: '/xox',     desc: 'Canlı XOX (Tic-Tac-Toe) oyunu başlat', sample: '/xox' },
  { cmd: '/tkm',     desc: 'Taş-Kağıt-Makas düellosu başlat',   sample: '/tkm' },
  { cmd: '/zar',     desc: 'Rastgele 3B zar at (1-6)',          sample: '/zar' },
  { cmd: '/konum',   desc: 'Mevcut GPS konumunu kart olarak paylaş', sample: '/konum' },
  { cmd: '/sureli',  desc: '30 saniye sonra silinen gizli mesaj', sample: '/sureli 30 Bu mesaj 30 saniye içinde yok olacak!' },
  { cmd: '/spoiler', desc: 'Tıklayınca açılan gizli metin',     sample: '||Sürpriz içerik burada||' },
  { cmd: '/kod',     desc: 'Renkli kod bloğu ekle',             sample: '```js\nconsole.log("Merhaba Mesaj v6!");\n```' },
  { cmd: '/titret',  desc: 'Karşı tarafın ekranını titret (Nudge)', sample: '/titret' },
  { cmd: '/tahta',   desc: 'Ortak canlı çizim tahtasını aç',    sample: '/tahta' },
];

/**
 * Kullanıcının yazdığı metin bir slash komutuysa yapılandırılmış mesaja dönüştürür.
 */
export async function transformOutgoingCommand(rawText, meUsername) {
  const text = (rawText || '').trim();
  if (!text.startsWith('/')) {
    // Matematik hesaplayıcı (#78): "= 24 * 15"
    if (text.startsWith('=')) {
      const expr = text.slice(1).trim();
      if (/^[0-9+\-*/().\s%]+$/.test(expr)) {
        try {
          // eslint-disable-next-line no-new-func
          const val = Function(`"use strict"; return (${expr})`)();
          if (Number.isFinite(val)) return `\`${expr}\` = **${val}**`;
        } catch {}
      }
    }
    return text;
  }

  if (text.startsWith('/anket')) {
    const parts = text.replace(/^\/anket\s*/i, '').split('|').map(s => s.trim()).filter(Boolean);
    const q = parts[0] || 'Bu fikre katılıyor musunuz?';
    const opts = parts.length > 1 ? parts.slice(1) : ['Evet', 'Hayır', 'Kararsızım'];
    const payload = { q, opts: opts.map(o => ({ text: o, votes: [] })) };
    return `[POLL:${JSON.stringify(payload)}]`;
  }

  if (text.startsWith('/todo')) {
    const parts = text.replace(/^\/todo\s*/i, '').split('|').map(s => s.trim()).filter(Boolean);
    const title = parts[0] || 'Yapılacaklar Listesi';
    const items = (parts.length > 1 ? parts.slice(1) : ['İlk görev', 'İkinci görev']).map(t => ({ text: t, done: false }));
    return `[TODO:${JSON.stringify({ title, items })}]`;
  }

  if (text === '/xox') {
    const payload = {
      type: 'xox',
      board: Array(9).fill(''),
      turn: 'X',
      starter: meUsername,
      playerX: meUsername,
      playerO: null,
      winner: null,
    };
    return `[GAME:${JSON.stringify(payload)}]`;
  }

  if (text === '/tkm') {
    const payload = { type: 'rps', moves: {}, starter: meUsername };
    return `[GAME:${JSON.stringify(payload)}]`;
  }

  if (text === '/zar') {
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    return `[GAME:${JSON.stringify({ type: 'dice', d1, d2, roller: meUsername })}]`;
  }

  if (text.startsWith('/sureli')) {
    const m = text.match(/^\/sureli\s+(\d+)\s+(.+)$/is);
    const sec = m ? Math.min(3600, Math.max(5, Number(m[1]))) : 30;
    const body = m ? m[2] : text.replace(/^\/sureli\s*/i, '') || 'Gizli süreli mesaj';
    const exp = Date.now() + sec * 1000;
    return `[TTL:${exp}]${body}`;
  }

  if (text.startsWith('/konum')) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(`[LOC:${JSON.stringify({ lat: 41.0082, lng: 28.9784, label: 'İstanbul, Türkiye' })}]`);
        return;
      }
      toast('Konum alınıyor…');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve(`[LOC:${JSON.stringify({
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
            label: 'Paylaşılan Canlı Konum',
          })}]`);
        },
        () => {
          resolve(`[LOC:${JSON.stringify({ lat: 41.0082, lng: 28.9784, label: 'İstanbul (Varsayılan Konum)' })}]`);
        },
        { timeout: 5000 }
      );
    });
  }

  if (text === '/titret') {
    return '[NUDGE]Ekranı titretti!';
  }

  return text;
}

/* ---------------- 2. Özel Mesaj Türü Çözümleyici ve Render (#31-#40, #59, #77) ---------------- */
export function renderRichMessageBody(m, { meId, meUsername, onUpdateMessage, onOpenContact }) {
  const raw = m.content || '';
  const frag = document.createDocumentFragment();

  // 2.1 İletildi Etiketi (#34)
  let working = raw;
  const fwdMatch = working.match(/^\[FWD:([^\]]+)\](.*)$/s);
  if (fwdMatch) {
    const fwdBadge = el('div', 'rc-forwarded-badge');
    fwdBadge.innerHTML = `<span class="ico-inline">${icon('forward')} @${escapeHtml(fwdMatch[1])} kişisinden iletildi</span>`;
    frag.append(fwdBadge);
    working = fwdMatch[2];
  }

  // 2.2 Tek Gösterimlik Medya (#38)
  if (working.startsWith('[VIEWONCE]')) {
    working = working.replace('[VIEWONCE]', '');
    const viewedKey = `wa_vo_${m.id}`;
    const alreadyViewed = localStorage.getItem(viewedKey) === '1';
    const voBtn = el('button', 'rc-viewonce-card' + (alreadyViewed ? ' opened' : ''));
    voBtn.type = 'button';
    voBtn.innerHTML = alreadyViewed
      ? `<span class="ico-inline">${icon('lock')} Açıldı (Tek Gösterimlik)</span>`
      : `<span class="ico-inline">${icon('eye')} Tek Gösterimlik Mesaj — Açmak için dokun</span>`;
    if (!alreadyViewed) {
      voBtn.addEventListener('click', () => {
        localStorage.setItem(viewedKey, '1');
        voBtn.classList.add('opened');
        voBtn.innerHTML = `<div class="rc-vo-revealed">${escapeHtml(working || 'Gizli içerik görüntülendi')}</div>`;
      });
    }
    frag.append(voBtn);
    return frag;
  }

  // 2.3 Süreli / Kendini İmha Eden Mesaj (#37)
  const ttlMatch = working.match(/^\[TTL:(\d+)\](.*)$/s);
  if (ttlMatch) {
    const expiresAt = Number(ttlMatch[1]);
    working = ttlMatch[2];
    const remainSec = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (remainSec <= 0) {
      const expEl = el('div', 'rc-expired-msg');
      expEl.innerHTML = `<span class="ico-inline">${icon('flame')} Bu süreli mesajın süresi doldu ve imha edildi.</span>`;
      frag.append(expEl);
      return frag;
    }
    const timerChip = el('div', 'rc-ttl-chip');
    timerChip.innerHTML = `<span class="ico-inline">${icon('timer')} ${remainSec} sn içinde silinecek</span>`;
    const iv = setInterval(() => {
      const r = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      if (r <= 0) {
        clearInterval(iv);
        timerChip.innerHTML = `<span class="ico-inline">${icon('flame')} Süresi doldu</span>`;
        if (onUpdateMessage) onUpdateMessage(m, '[TTL:0]');
      } else {
        timerChip.innerHTML = `<span class="ico-inline">${icon('timer')} ${r} sn içinde silinecek</span>`;
      }
    }, 1000);
    frag.append(timerChip);
  }

  // 2.4 Canlı Anket (Poll) (#33)
  if (working.startsWith('[POLL:')) {
    try {
      const jsonStr = working.slice(6, working.lastIndexOf(']'));
      const poll = JSON.parse(jsonStr);
      frag.append(buildPollWidget(poll, meUsername, (updatedPoll) => {
        if (onUpdateMessage) onUpdateMessage(m, `[POLL:${JSON.stringify(updatedPoll)}]`);
      }));
      return frag;
    } catch {}
  }

  // 2.5 Yapılacaklar Listesi (Checklist) (#77)
  if (working.startsWith('[TODO:')) {
    try {
      const jsonStr = working.slice(6, working.lastIndexOf(']'));
      const todo = JSON.parse(jsonStr);
      frag.append(buildTodoWidget(todo, (updatedTodo) => {
        if (onUpdateMessage) onUpdateMessage(m, `[TODO:${JSON.stringify(updatedTodo)}]`);
      }));
      return frag;
    } catch {}
  }

  // 2.6 Sohbet İçi Mini Oyunlar (XOX, Taş-Kağıt-Makas, Zar) (#59)
  if (working.startsWith('[GAME:')) {
    try {
      const jsonStr = working.slice(6, working.lastIndexOf(']'));
      const game = JSON.parse(jsonStr);
      frag.append(buildGameWidget(game, meUsername, (updatedGame) => {
        if (onUpdateMessage) onUpdateMessage(m, `[GAME:${JSON.stringify(updatedGame)}]`);
      }, m, meId));
      return frag;
    } catch {}
  }

  // 2.7 İnteraktif Konum Kartı (#40)
  if (working.startsWith('[LOC:')) {
    try {
      const jsonStr = working.slice(5, working.lastIndexOf(']'));
      const loc = JSON.parse(jsonStr);
      frag.append(buildLocationWidget(loc));
      return frag;
    } catch {}
  }

  // 2.8 Kişi Kartı (#64)
  if (working.startsWith('[CONTACT:')) {
    try {
      const jsonStr = working.slice(9, working.lastIndexOf(']'));
      const contact = JSON.parse(jsonStr);
      frag.append(buildContactCardWidget(contact, onOpenContact));
      return frag;
    } catch {}
  }

  // 2.9 Titreşim (Nudge) Rozeti (#57)
  if (working.startsWith('[NUDGE]')) {
    const nudgeEl = el('div', 'rc-nudge-card');
    nudgeEl.innerHTML = `<span class="ico-inline">${icon('vibrate')} ${escapeHtml(working.replace('[NUDGE]', ''))}</span>`;
    frag.append(nudgeEl);
    return frag;
  }

  // 2.10 Normal Zengin Metin (Markdown, Kod Bloğu, Spoiler, Uzun Mesaj Katlama ve Link Önizleme)
  const textNode = buildFormattedTextElement(working);
  frag.append(textNode);

  // Link Önizleme Kartı (#39) + Güvenli Bağlantı Kontrolü (#88)
  const urlMatch = working.match(/https?:\/\/[^\s<>"']+/i);
  if (urlMatch) {
    const linkCard = buildLinkPreviewCard(urlMatch[0]);
    if (linkCard) frag.append(linkCard);
  }

  return frag;
}

/* ---------------- 3. Widget Oluşturucular ---------------- */
function buildPollWidget(poll, meUsername, onSave) {
  const card = el('div', 'rc-widget rc-poll');
  const badge = el('div', 'rc-widget-badge');
  badge.innerHTML = `${icon('chart')} CANLI ANKET`;
  card.append(badge);
  card.append(el('div', 'rc-widget-title', poll.q || 'Anket'));

  const totalVotes = (poll.opts || []).reduce((sum, o) => sum + ((o.votes || []).length), 0);
  const optsWrap = el('div', 'rc-poll-opts');

  (poll.opts || []).forEach((opt, idx) => {
    const votes = opt.votes || [];
    const voted = votes.includes(meUsername);
    const pct = totalVotes > 0 ? Math.round((votes.length / totalVotes) * 100) : 0;

    const btn = el('button', 'rc-poll-opt' + (voted ? ' voted' : ''));
    btn.type = 'button';
    btn.innerHTML = `
      <div class="rc-poll-bar" style="width:${pct}%"></div>
      <span class="rc-poll-label">${escapeHtml(opt.text)}</span>
      <span class="rc-poll-stat">${votes.length} oy (%${pct})</span>
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = structuredClone(poll);
      const list = next.opts[idx].votes || [];
      const i = list.indexOf(meUsername);
      if (i >= 0) list.splice(i, 1);
      else list.push(meUsername);
      next.opts[idx].votes = list;
      onSave(next);
    });
    optsWrap.append(btn);
  });

  card.append(optsWrap);
  card.append(el('div', 'rc-widget-foot', `Toplam ${totalVotes} oy • Oy vermek için seçeneğe dokun`));
  return card;
}

function buildTodoWidget(todo, onSave) {
  const card = el('div', 'rc-widget rc-todo');
  const badge = el('div', 'rc-widget-badge');
  badge.innerHTML = `${icon('listChecks')} ORTAK LİSTE`;
  card.append(badge);
  card.append(el('div', 'rc-widget-title', todo.title || 'Yapılacaklar'));

  const list = el('div', 'rc-todo-list');
  (todo.items || []).forEach((item, idx) => {
    const row = el('label', 'rc-todo-item' + (item.done ? ' done' : ''));
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.done;
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const next = structuredClone(todo);
      next.items[idx].done = cb.checked;
      onSave(next);
    });
    const span = el('span', '', item.text);
    row.append(cb, span);
    list.append(row);
  });
  card.append(list);
  return card;
}

function buildGameWidget(game, meUsername, onSave, m, meId) {
  const card = el('div', 'rc-widget rc-game');

  if (game.type === 'dice') {
    const badge = el('div', 'rc-widget-badge');
    badge.innerHTML = `${icon('dice')} 3B ZAR ATMA`;
    card.append(badge);
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const row = el('div', 'rc-dice-row');
    row.innerHTML = `<span class="rc-die">${faces[(game.d1 || 1) - 1]}</span><span class="rc-die">${faces[(game.d2 || 1) - 1]}</span>`;
    card.append(row);
    card.append(el('div', 'rc-widget-foot', `@${game.roller || 'oyuncu'} attı: ${game.d1} + ${game.d2} = ${(game.d1 || 1) + (game.d2 || 1)}`));
    return card;
  }

  if (game.type === 'rps') {
    const badge = el('div', 'rc-widget-badge');
    badge.innerHTML = `${icon('scissors')} TAŞ - KAĞIT - MAKAS`;
    card.append(badge);
    const moves = game.moves || {};
    const players = Object.keys(moves);
    const status = el('div', 'rc-game-status');

    if (players.length < 2) {
      status.textContent = moves[meUsername]
        ? 'Hamleniz kaydedildi! Rakip bekleniyor…'
        : 'Hamlenizi seçin:';
    } else {
      const [p1, p2] = players;
      const m1 = moves[p1], m2 = moves[p2];
      status.textContent = `@${p1}: ${m1}  •  @${p2}: ${m2}`;
    }
    card.append(status);

    const btnRow = el('div', 'rc-rps-btns');
    ['Taş', 'Kağıt', 'Makas'].forEach((choice) => {
      const b = el('button', 'btn-sm secondary', choice);
      b.type = 'button';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = structuredClone(game);
        next.moves = next.moves || {};
        if (Object.keys(next.moves).length >= 2) next.moves = {};
        next.moves[meUsername] = choice;
        onSave(next);
      });
      btnRow.append(b);
    });
    card.append(btnRow);
    return card;
  }

  // XOX (Tic-Tac-Toe) — Sıra ve Oyuncu Yetki Korumalı
  const xoxBadge = el('div', 'rc-widget-badge');
  xoxBadge.innerHTML = `${icon('gamepad')} CANLI XOX OYUNU`;
  card.append(xoxBadge);

  const board = game.board || Array(9).fill('');
  const winner = game.winner || checkXoxWinner(board);

  // Oyuncu rollerinin belirlenmesi: X (başlatan) ve O (ikinci oyuncu)
  const playerX = game.playerX || game.starter || (m && m.sender_id === meId ? meUsername : null);
  let playerO = game.playerO || null;

  let mySymbol = null;
  if (meUsername && playerX && meUsername === playerX) {
    mySymbol = 'X';
  } else if (meUsername && playerO && meUsername === playerO) {
    mySymbol = 'O';
  } else if (meUsername && !playerO && playerX && meUsername !== playerX) {
    // Henüz O hamlesi kaydedilmemişse ve kullanıcı X değilse, bu kullanıcı O rolündedir
    mySymbol = 'O';
  }

  const currentTurn = game.turn || 'X';
  const isMyTurn = !winner && !!mySymbol && (currentTurn === mySymbol);

  // 1. Oyuncular ve Roller Başlığı
  const p1Name = playerX || 'Oyuncu 1';
  const p2Name = playerO || (mySymbol === 'O' ? meUsername : 'Oyuncu 2');

  const playersRow = el('div', 'rc-xox-players');
  playersRow.innerHTML = `
    <div class="rc-xox-player ${currentTurn === 'X' && !winner ? 'turn-active' : ''} ${mySymbol === 'X' ? 'is-me' : ''}">
      <span class="rc-xox-sym x">X</span>
      <span class="rc-xox-name">${escapeHtml(p1Name)}${mySymbol === 'X' ? ' (Sen)' : ''}</span>
    </div>
    <div class="rc-xox-vs">VS</div>
    <div class="rc-xox-player ${currentTurn === 'O' && !winner ? 'turn-active' : ''} ${mySymbol === 'O' ? 'is-me' : ''}">
      <span class="rc-xox-sym o">O</span>
      <span class="rc-xox-name">${escapeHtml(p2Name)}${mySymbol === 'O' ? ' (Sen)' : ''}</span>
    </div>
  `;
  card.append(playersRow);

  // 2. Durum / Sıra Bildirimi
  let statusText = '';
  if (winner) {
    if (winner === 'Berabere') {
      statusText = '🤝 Oyun Berabere Bitti!';
    } else if (mySymbol && winner === mySymbol) {
      statusText = '🏆 Tebrikler, Kazandın!';
    } else {
      const winnerName = winner === 'X' ? p1Name : p2Name;
      statusText = `👑 Kazanan: @${winnerName || winner}!`;
    }
  } else {
    if (!mySymbol) {
      const activeUser = currentTurn === 'X' ? p1Name : p2Name;
      statusText = `İzleyici Modu • Sıra: @${activeUser} (${currentTurn})`;
    } else if (isMyTurn) {
      statusText = `🟢 Sıra Sende! (${mySymbol} hamleni yap)`;
    } else {
      const waitUser = currentTurn === 'X' ? p1Name : p2Name;
      statusText = `⏳ Sıra Rakipte (@${waitUser} bekleniyor...)`;
    }
  }

  const status = el('div', 'rc-game-status');
  status.textContent = statusText;
  card.append(status);

  // 3. Oyun Alanı (3x3 Grid)
  const grid = el('div', 'rc-xox-grid');
  board.forEach((cell, i) => {
    const b = el('button', 'rc-xox-cell' + (cell ? ` val-${cell}` : ''));
    b.type = 'button';
    b.textContent = cell || '';

    // Sadece boşsa, oyun bitmemişse VE sıra bu oyuncudaysa tıklanabilir
    const canPlay = !cell && !winner && isMyTurn;
    b.disabled = !canPlay;
    if (!cell && !winner && !isMyTurn) {
      b.title = mySymbol ? 'Sıra sizde değil! Rakibin oynamasını bekleyin.' : 'Bu oyunda izleyicisiniz.';
    }

    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (winner) return;
      if (!mySymbol) {
        toast('Bu oyunda izleyicisiniz.');
        return;
      }
      if (!isMyTurn) {
        toast('Sıra sizde değil! Lütfen sıranızı bekleyin.');
        return;
      }
      if (board[i]) return;

      const next = structuredClone(game);
      next.board[i] = mySymbol;
      next.playerX = playerX || meUsername;
      if (mySymbol === 'O' && !next.playerO) {
        next.playerO = meUsername;
      }

      const nextWin = checkXoxWinner(next.board);
      if (nextWin) {
        next.winner = nextWin;
        next.turn = null;
      } else {
        next.turn = mySymbol === 'X' ? 'O' : 'X';
      }
      onSave(next);
    });
    grid.append(b);
  });
  card.append(grid);

  // 4. Yeniden Oyna Butonu
  if (winner) {
    const resetBtn = el('button', 'btn-sm secondary');
    resetBtn.innerHTML = `${icon('rotate')} Yeniden Oyna`;
    resetBtn.type = 'button';
    resetBtn.style.marginTop = '8px';
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onSave({
        type: 'xox',
        board: Array(9).fill(''),
        turn: 'X',
        starter: meUsername,
        playerX: playerX || meUsername,
        playerO: playerO || null,
        winner: null,
      });
    });
    card.append(resetBtn);
  }
  return card;
}

function checkXoxWinner(b) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a, c, d] of lines) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  if (b.every(Boolean)) return 'Berabere';
  return null;
}

function buildLocationWidget(loc) {
  const card = el('div', 'rc-widget rc-loc');
  card.innerHTML = `
    <div class="rc-loc-map">
      <div class="rc-loc-pin">${icon('mapPin')}</div>
      <div class="rc-loc-grid"></div>
    </div>
    <div class="rc-loc-body">
      <b>${escapeHtml(loc.label || 'Konum Paylaşımı')}</b>
      <small>${loc.lat}, ${loc.lng}</small>
    </div>
  `;
  const openBtn = el('a', 'btn-sm primary');
  openBtn.innerHTML = `${icon('map')} Haritada Aç`;
  openBtn.href = `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=15/${loc.lat}/${loc.lng}`;
  openBtn.target = '_blank';
  openBtn.rel = 'noopener noreferrer';
  card.append(openBtn);
  return card;
}

function buildContactCardWidget(contact, onOpenContact) {
  const card = el('div', 'rc-widget rc-contact');
  card.innerHTML = `
    <div class="rc-widget-badge">${icon('user')} KİŞİ KARTI</div>
    <div class="rc-widget-title">@${escapeHtml(contact.username || 'kullanici')}</div>
  `;
  const btn = el('button', 'btn-sm primary', 'Sohbeti Başlat');
  btn.type = 'button';
  btn.addEventListener('click', () => {
    if (onOpenContact) onOpenContact(contact);
  });
  card.append(btn);
  return card;
}

/* ---------------- 4. Zengin Metin (Markdown, Kod, Spoiler, Uzun Mesaj) (#31, #32, #79) ---------------- */
function buildFormattedTextElement(rawText) {
  const wrap = el('div', 'text rc-formatted');
  const isLong = rawText.length > 460;
  const displayStr = isLong ? rawText.slice(0, 440) + '…' : rawText;

  wrap.innerHTML = formatMarkdownAndSpoilers(displayStr);
  bindInteractiveFormattedElements(wrap);

  if (isLong) {
    const moreBtn = el('button', 'rc-read-more', 'Devamını Oku ▾');
    moreBtn.type = 'button';
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.innerHTML = formatMarkdownAndSpoilers(rawText);
      bindInteractiveFormattedElements(wrap);
    });
    wrap.append(moreBtn);
  }
  return wrap;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarkdownAndSpoilers(text) {
  let html = escapeHtml(text);

  // Çok satırlı kod blokları: ```js ... ```
  html = html.replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/gi, (_, lang, code) => {
    return `<div class="rc-codeblock"><div class="rc-code-head"><span>${lang || 'kod'}</span><button type="button" class="rc-copy-code">Kopyala</button></div><pre><code>${code.trim()}</code></pre></div>`;
  });

  // Satır içi kod: `kod`
  html = html.replace(/`([^`\n]+)`/g, '<code class="rc-inline-code">$1</code>');

  // Spoiler: ||gizli||
  html = html.replace(/\|\|([^|]+)\|\|/g, '<span class="rc-spoiler" title="Görmek için dokun">$1</span>');

  // Kalın: **metin**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // İtalik: *metin*
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // Üstü çizili: ~~metin~~
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // @kullanıcı etiketleri (#63)
  html = html.replace(/(^|\s)(@[a-z0-9_]{3,20})/gi, '$1<span class="rc-mention">$2</span>');

  // Güvenli tıklanabilir URL'ler (#39, #88)
  html = html.replace(/(https?:\/\/[^\s<]+)/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="rc-link">$1</a>');

  return html;
}

function bindInteractiveFormattedElements(container) {
  container.querySelectorAll('.rc-spoiler').forEach(sp => {
    sp.addEventListener('click', (e) => {
      e.stopPropagation();
      sp.classList.toggle('revealed');
    });
  });

  container.querySelectorAll('.rc-copy-code').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = btn.closest('.rc-codeblock')?.querySelector('code')?.textContent || '';
      navigator.clipboard?.writeText(code);
      btn.textContent = 'Kopyalandı ✓';
      setTimeout(() => { btn.textContent = 'Kopyala'; }, 1500);
    });
  });

  // Dış bağlantı güvenlik kontrolü (#88)
  container.querySelectorAll('.rc-link').forEach(a => {
    a.addEventListener('click', (e) => {
      const url = a.getAttribute('href') || '';
      if (!url.startsWith(location.origin)) {
        const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
        if (!confirm(`Dış bağlantıya yönlendiriliyorsunuz:\n\n${host}\n\nDevam etmek istiyor musunuz?`)) {
          e.preventDefault();
        }
      }
    });
  });
}

/* ---------------- 5. Zengin Bağlantı Önizlemesi (#39) ---------------- */
function buildLinkPreviewCard(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const card = el('a', 'rc-link-card');
    card.href = url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    let badge = `<span class="ico-inline">${icon('link')} Web Bağlantısı</span>`;
    if (host.includes('youtube.com') || host.includes('youtu.be')) badge = `<span class="ico-inline">${icon('video')} YouTube Videosu</span>`;
    else if (host.includes('github.com')) badge = `<span class="ico-inline">${icon('github')} GitHub Deposu</span>`;
    else if (host.includes('open.spotify.com')) badge = `<span class="ico-inline">${icon('music')} Spotify Parçası</span>`;

    card.innerHTML = `
      <div class="rc-lc-badge">${badge}</div>
      <div class="rc-lc-host">${escapeHtml(host)}</div>
      <div class="rc-lc-url">${escapeHtml(url)}</div>
    `;
    return card;
  } catch {
    return null;
  }
}

/* ---------------- 6. Akıllı Hızlı Yanıt Önerileri (Smart Replies) (#71) ---------------- */
export function getSmartReplies(incomingText) {
  const t = (incomingText || '').toLowerCase();
  if (!t || t.startsWith('[')) return ['Harika!', 'Tamamdır', 'Teşekkürler'];
  if (t.includes('merhaba') || t.includes('selam') || t.includes('naber') || t.includes('nasılsın')) {
    return ['Selam! İyiyim, sen nasılsın?', 'Merhaba!', 'Teşekkürler, her şey yolunda'];
  }
  if (t.includes('?') || t.includes('miyim') || t.includes('misin') || t.includes('mı')) {
    return ['Evet, kesinlikle', 'Birazdan kontrol edip döneceğim', 'Şu an emin değilim'];
  }
  if (t.includes('teşekkür') || t.includes('sağ ol') || t.includes('eyvallah')) {
    return ['Rica ederim!', 'Ne demek, her zaman', 'Memnuniyetle'];
  }
  if (t.includes('nerede') || t.includes('geliyor')) {
    return ['Yoldayım, 5 dakikaya oradayım', 'Konum atıyorum', 'Hazırlanıyorum'];
  }
  return ['Tamamdır', 'Harika görünüyor', 'Anlaştık!'];
}

/* ---------------- 7. Sohbet İçi Anlık Çeviri (#73) ---------------- */
export async function translateMessageText(text) {
  const clean = (text || '').replace(/^\[[^\]]+\]/, '').trim();
  if (!clean) return '';
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean.slice(0, 450))}&langpair=Autodetect|tr`);
    const json = await res.json();
    if (json?.responseData?.translatedText) {
      return json.responseData.translatedText;
    }
  } catch {}
  return `[TR Çeviri]: ${clean}`;
}
