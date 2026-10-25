/* ui/emoji-picker.js — kategorili, "son kullanılanlar" destekli emoji paneli */
import { $, el } from '../utils.js';

const CATEGORIES = [
  { id: 'smileys', tab: '😀', label: 'Yüzler ve duygular', emojis:
    '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🫣 🤗 🫡 🤔 🫢 🤭 🤫 🤥 😶 😐 😑 😬 🫠 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾' },
  { id: 'people', tab: '👍', label: 'İnsanlar ve vücut', emojis:
    '👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫵 👋 🤚 🖐 ✋ 🖖 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 👃 🧠 👀 👁 👅 👄 🫦 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 🕵️ 💂 🥷 👷 🤴 👸 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💃 🕺 👯 🧘' },
  { id: 'hearts', tab: '❤️', label: 'Kalpler ve semboller', emojis:
    '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 ❤️‍🔥 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉 ☸️ ✡️ 🔯 ☯️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 💯 💢 💥 💫 💦 💨 🕳 💬 💭 💤 ✨ ⭐ 🌟 ⚡ 🔥 🌈 ☀️ 🌙 ❄️ ✅ ❌ ❓ ❗ ⚠️ 🚫 ♻️ 🔞 🆗 🆒 🆕 🆓 🔔 🔕' },
  { id: 'nature', tab: '🐶', label: 'Hayvanlar ve doğa', emojis:
    '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🕷 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🐪 🦒 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌺 🌻 🌹 🌷 🌼 🌸 💐 🍄' },
  { id: 'food', tab: '🍕', label: 'Yiyecek ve içecek', emojis:
    '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥒 🌶 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🍞 🥖 🧀 🥚 🍳 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🫖 🍵 🍶 🍾 🍷 🍸 🍹 🍺 🍻 🥂 🥃 🥤 🧋' },
  { id: 'activity', tab: '⚽', label: 'Aktivite ve nesneler', emojis:
    '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🎣 🎽 🛹 🎿 🏆 🥇 🥈 🥉 🏅 🎮 🕹 🎲 🧩 🎯 🎳 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 📷 📹 📱 💻 ⌨️ 🖥 🖨 🖱 💾 📀 ☎️ 📺 📻 ⏰ 🔋 🔌 💡 🔦 📚 📖 ✏️ 📝 📌 📎 ✂️ 🔒 🔑 🔨 🧰 💊 💉 🚗 🚕 🚌 🚓 🚑 🚒 🚲 ✈️ 🚀 🛸 🚢 ⚓ 🏠 🏢 🌍 🗺 🎁 🎉 🎊 🎈' },
];

const RECENT_KEY = 'mesaj_recent_emojis';
const MAX_RECENT = 24;

const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
function saveRecent(e) {
  const list = [e, ...loadRecent().filter((x) => x !== e)].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* depolama dolu/kapalı */ }
}

/** @param {{onPick:(emoji:string)=>void, onToggle?:(open:boolean)=>void}} opts */
export function initEmojiPicker({ onPick, onToggle }) {
  const panel = $('emoji-panel');
  const tabs = el('div', 'emoji-tabs');
  const label = el('div', 'emoji-label');
  const grid = el('div', 'emoji-grid');
  panel.replaceChildren(tabs, label, grid);

  let activeId = 'smileys';

  function categories() {
    const recent = loadRecent();
    return recent.length
      ? [{ id: 'recent', tab: '🕘', label: 'Son kullanılanlar', emojis: recent.join(' ') }, ...CATEGORIES]
      : CATEGORIES;
  }

  function render() {
    const cats = categories();
    if (!cats.some((c) => c.id === activeId)) activeId = cats[0].id;
    tabs.replaceChildren(...cats.map((c) => {
      const b = el('button', c.id === activeId ? 'active' : '', c.tab);
      b.type = 'button';
      b.title = c.label;
      b.addEventListener('click', () => { activeId = c.id; render(); grid.scrollTop = 0; });
      return b;
    }));
    const cat = cats.find((c) => c.id === activeId) || cats[0];
    label.textContent = cat.label;
    const frag = document.createDocumentFragment();
    const emojiList = (cat.emojis || '').trim().split(/\s+/).filter(Boolean);
    for (const e of emojiList) {
      const b = el('button', null, e);
      b.type = 'button';
      b.addEventListener('click', () => { saveRecent(e); onPick(e); });
      frag.append(b);
    }
    grid.replaceChildren(frag);
  }

  const isOpen = () => panel.classList.contains('open');
  function setOpen(open) {
    if (open) render();
    panel.classList.toggle('open', open);
    $('emoji-btn').classList.toggle('active', open);
    if (onToggle) onToggle(open);
  }

  return { toggle: () => setOpen(!isOpen()), close: () => setOpen(false), isOpen };
}
