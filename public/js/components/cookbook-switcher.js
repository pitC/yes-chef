import {
  loadStoredCollectionKey,
  loadStoredCollectionKeys,
  saveStoredCollectionKey,
  removeStoredCollectionKey,
  getCookbookMeta,
} from '../storage.js';
import {
  fetchMetadataForKey,
  getCookbookName,
  getCookbookNote,
  normalizeCollectionKey,
  validateCookbookCode,
} from '../repository.js';

import { escapeHtml } from '../utils/escape.js';

export const FALLBACK_COOKBOOK_TITLE = 'Yes Chef';

export function resolveCookbookDisplayName(meta, fallback = FALLBACK_COOKBOOK_TITLE) {
  return getCookbookName(meta) || fallback;
}

function reloadApp() {
  try {
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
      window.location.reload();
    }
  } catch {
    // jsdom or test env; ignore
  }
}

export function redactCookbookCode(code) {
  if (typeof code !== 'string' || !code) return '';
  return code
    .split('-')
    .map((part) => (part ? `${part[0]}***` : ''))
    .join('-');
}

function renderKnownList(listEl, { keys, activeKey, metaByCode, onSwitch, onRemove }) {
  if (!keys.length) {
    listEl.innerHTML = '<p class="cookbook-switcher__empty">No cookbooks yet — add one below.</p>';
    return;
  }
  listEl.innerHTML = keys
    .map((code) => {
      const meta = metaByCode[code] || null;
      const displayCode = redactCookbookCode(code);
      const name = getCookbookName(meta) || displayCode;
      const note = getCookbookNote(meta) || '';
      const isActive = code === activeKey;
      return `
      <li class="cookbook-switcher__item${isActive ? ' cookbook-switcher__item--active' : ''}" data-code="${escapeHtml(code)}">
        <div class="cookbook-switcher__info">
          <span class="cookbook-switcher__name">${escapeHtml(name)}${isActive ? ' <span class="cookbook-switcher__badge">Current</span>' : ''}</span>
          <span class="cookbook-switcher__code">${escapeHtml(displayCode)}</span>
          ${note ? `<span class="cookbook-switcher__note">${escapeHtml(note)}</span>` : ''}
        </div>
        <div class="cookbook-switcher__row-actions">
          ${isActive ? '' : '<button class="btn btn--secondary cookbook-switcher__switch" type="button">Switch</button>'}
          <button class="btn btn--ghost cookbook-switcher__remove" type="button" aria-label="Remove ${escapeHtml(displayCode)}">✕</button>
        </div>
      </li>`;
    })
    .join('');

  listEl.querySelectorAll('.cookbook-switcher__item').forEach((item) => {
    const code = item.dataset.code;
    const switchBtn = item.querySelector('.cookbook-switcher__switch');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => onSwitch(code));
    }
    const removeBtn = item.querySelector('.cookbook-switcher__remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => onRemove(code));
    }
  });
}

function openSwitcherDialog({ onSwitchRequest } = {}) {
  const keys = loadStoredCollectionKeys();
  const metaByCode = {};
  keys.forEach((code) => {
    metaByCode[code] = getCookbookMeta(code);
  });

  const overlay = document.createElement('div');
  overlay.className = 'cookbook-switcher__overlay';
  overlay.innerHTML = `
    <div class="cookbook-switcher__dialog" role="dialog" aria-modal="true" aria-label="Switch cookbook">
      <div class="cookbook-switcher__header">
        <h2 class="cookbook-switcher__title">Cookbooks</h2>
        <button class="btn btn--ghost cookbook-switcher__close" type="button" aria-label="Close">✕</button>
      </div>
      <ul class="cookbook-switcher__list"></ul>
      <div class="cookbook-switcher__add">
        <h3 class="cookbook-switcher__subtitle">Add new cookbook</h3>
        <input class="setup-input cookbook-switcher__input" type="password" placeholder="Enter the secret cookbook code" autocomplete="off" spellcheck="false" aria-label="Secret cookbook code">
        <div class="setup-error cookbook-switcher__error" style="display:none;"></div>
        <div class="cookbook-switcher__add-actions">
          <button class="btn btn--primary cookbook-switcher__save" type="button">Save &amp; sync</button>
        </div>
      </div>
    </div>
  `;

  const listEl = overlay.querySelector('.cookbook-switcher__list');
  const input = overlay.querySelector('.cookbook-switcher__input');
  const errorEl = overlay.querySelector('.cookbook-switcher__error');
  const saveBtn = overlay.querySelector('.cookbook-switcher__save');
  const closeBtn = overlay.querySelector('.cookbook-switcher__close');

  let removed = false;
  function close() {
    if (removed) return;
    removed = true;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKeyDown);

  function refreshList() {
    const currentKeys = loadStoredCollectionKeys();
    const currentActive = loadStoredCollectionKey();
    currentKeys.forEach((code) => {
      if (!metaByCode[code]) metaByCode[code] = getCookbookMeta(code);
    });
    renderKnownList(listEl, {
      keys: currentKeys,
      activeKey: currentActive,
      metaByCode,
      onSwitch: handleSwitch,
      onRemove: handleRemove,
    });
  }

  function handleSwitch(code) {
    const key = normalizeCollectionKey(code);
    if (!key) return;
    saveStoredCollectionKey(key);
    close();
    if (typeof onSwitchRequest === 'function') {
      onSwitchRequest(key);
      return;
    }
    reloadApp();
  }

  function handleRemove(code) {
    removeStoredCollectionKey(code);
    delete metaByCode[code];
    refreshList();
    void refreshMeta();
  }

  async function refreshMeta() {
    const currentKeys = loadStoredCollectionKeys();
    let changed = false;
    await Promise.all(
      currentKeys.map(async (code) => {
        if (metaByCode[code]) return;
        const meta = await fetchMetadataForKey(code);
        if (meta) {
          metaByCode[code] = meta;
          changed = true;
        }
      }),
    );
    if (changed && !removed) refreshList();
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  async function handleSave() {
    const raw = input.value;
    const key = normalizeCollectionKey(raw);
    if (!key) {
      input.setCustomValidity('Enter a cookbook code without slashes.');
      input.reportValidity();
      input.focus();
      return;
    }
    input.setCustomValidity('');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Verifying…';
    errorEl.style.display = 'none';
    const result = await validateCookbookCode(key);
    if (!result.ok) {
      showError(result.error || 'Invalid code — please check and try again.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save & sync';
      input.focus();
      input.select();
      return;
    }
    const meta = await fetchMetadataForKey(key);
    if (meta) metaByCode[key] = meta;
    close();
    if (typeof onSwitchRequest === 'function') {
      onSwitchRequest(key);
      return;
    }
    reloadApp();
  }

  saveBtn.addEventListener('click', handleSave);
  input.addEventListener('keydown', (e) => {
    input.setCustomValidity('');
    errorEl.style.display = 'none';
    if (e.key === 'Enter') saveBtn.click();
  });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  refreshList();
  document.body.appendChild(overlay);
  void refreshMeta();
  input.focus();

  return { close, element: overlay };
}

export function attachCookbookSwitcher(titleEl, { onSwitch } = {}) {
  if (!titleEl) return () => {};
  titleEl.classList.add('cookbook-switcher__trigger');
  titleEl.setAttribute('role', 'button');
  titleEl.setAttribute('tabindex', '0');
  titleEl.setAttribute('aria-label', 'Switch cookbook');
  titleEl.title = 'Switch cookbook';

  const activeKey = loadStoredCollectionKey();
  const cached = activeKey ? getCookbookMeta(activeKey) : null;
  titleEl.textContent = resolveCookbookDisplayName(cached);

  let cancelled = false;
  if (activeKey && !cached) {
    fetchMetadataForKey(activeKey).then((meta) => {
      if (cancelled || !meta) return;
      const name = resolveCookbookDisplayName(meta);
      if (titleEl.isConnected) titleEl.textContent = name;
    });
  }

  function open() {
    openSwitcherDialog({ onSwitchRequest: onSwitch });
  }
  function onClick() {
    open();
  }
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }
  titleEl.addEventListener('click', onClick);
  titleEl.addEventListener('keydown', onKey);

  return () => {
    cancelled = true;
    titleEl.removeEventListener('click', onClick);
    titleEl.removeEventListener('keydown', onKey);
  };
}

export { openSwitcherDialog };
