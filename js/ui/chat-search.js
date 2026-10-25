/* ui/chat-search.js — sohbet içi kelime arama ve eşleşmeler arasında gezinme */
import { $ } from '../utils.js';

let activeMatches = [];
let currentIndex = -1;
let isOpen = false;

export function initChatSearch() {
  const bar = $('chat-search-bar');
  const toggleBtn = $('chat-search-btn');
  const input = $('search-input-chat');
  const countEl = $('search-match-count');
  const prevBtn = $('search-prev-btn');
  const nextBtn = $('search-next-btn');
  const closeBtn = $('search-close-btn');

  if (!bar || !toggleBtn) return;

  function openSearch() {
    isOpen = true;
    bar.hidden = false;
    input.focus();
    performSearch();
  }

  function closeSearch() {
    isOpen = false;
    bar.hidden = true;
    input.value = '';
    clearHighlights();
  }

  function clearHighlights() {
    activeMatches.forEach(row => {
      row.classList.remove('search-matched', 'search-active');
    });
    activeMatches = [];
    currentIndex = -1;
    if (countEl) countEl.textContent = '0 / 0';
  }

  function performSearch() {
    clearHighlights();
    const query = input.value.trim().toLowerCase();
    if (!query) return;

    const rows = document.querySelectorAll('#messages .msg-row');
    rows.forEach(row => {
      const textEl = row.querySelector('.text, .doc-name');
      if (textEl && textEl.textContent.toLowerCase().includes(query)) {
        row.classList.add('search-matched');
        activeMatches.push(row);
      }
    });

    if (activeMatches.length > 0) {
      currentIndex = activeMatches.length - 1; // En son mesaja git
      jumpToCurrent();
    } else {
      if (countEl) countEl.textContent = '0 / 0';
    }
  }

  function jumpToCurrent() {
    if (currentIndex < 0 || currentIndex >= activeMatches.length) return;
    activeMatches.forEach((row, i) => {
      row.classList.toggle('search-active', i === currentIndex);
    });
    const target = activeMatches[currentIndex];
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (countEl) countEl.textContent = `${currentIndex + 1} / ${activeMatches.length}`;
  }

  toggleBtn.addEventListener('click', () => {
    if (isOpen) closeSearch();
    else openSearch();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeSearch);

  if (input) {
    input.addEventListener('input', performSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) prev();
        else next();
      } else if (e.key === 'Escape') {
        closeSearch();
      }
    });
  }

  function prev() {
    if (activeMatches.length === 0) return;
    currentIndex = (currentIndex - 1 + activeMatches.length) % activeMatches.length;
    jumpToCurrent();
  }

  function next() {
    if (activeMatches.length === 0) return;
    currentIndex = (currentIndex + 1) % activeMatches.length;
    jumpToCurrent();
  }

  if (prevBtn) prevBtn.addEventListener('click', prev);
  if (nextBtn) nextBtn.addEventListener('click', next);
}

export function resetChatSearch() {
  const bar = $('chat-search-bar');
  if (bar) bar.hidden = true;
  isOpen = false;
  activeMatches = [];
  currentIndex = -1;
}
