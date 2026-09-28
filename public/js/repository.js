// Generic repository — all data access goes through the app server
// No direct storage SDK usage; generic interface only

import { APP_SERVER_URL } from './app-config.js';
import {
  loadStoredCollectionKey,
  saveStoredCollectionKey,
  removeStoredCollectionKey,
  markFirestoreSkipped,
  isFirestoreSkipped,
  saveCookbookMeta,
} from './storage.js';

export const METADATA_DOCUMENT_ID = 'metadata';

// eslint-disable-next-line no-undef
const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

function getBaseUrl() {
  const base = (typeof APP_SERVER_URL === 'string' && APP_SERVER_URL.trim()) ? APP_SERVER_URL.trim().replace(/\/+$/, '') : '';
  return base;
}

function getAuthHeader() {
  const key = loadStoredCollectionKey();
  return key ? `Bearer ${key}` : null;
}

export function normalizeCollectionKey(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed && !trimmed.includes('/') ? trimmed : null;
}

export async function fetchCollectionMetadata() {
  const key = loadStoredCollectionKey();
  if (!key) return null;
  return fetchMetadataForKey(key);
}

export async function fetchMetadataForKey(collectionKey) {
  const key = normalizeCollectionKey(collectionKey);
  if (isTestEnv) return null;
  if (!key) return null;
  const base = getBaseUrl();
  try {
    const resp = await fetch(`${base}/api/metadata`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && typeof data === 'object') {
      try {
        saveCookbookMeta(key, data);
      } catch {
        // cache best-effort; ignore
      }
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function getCookbookName(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const candidates = [meta.name, meta.title, meta.cookbookName];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

export function getCookbookNote(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const candidates = [meta.note, meta.notes, meta.description];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

export async function validateCookbookCode(collectionKey) {
  const key = normalizeCollectionKey(collectionKey);
  if (!key) return { ok: false, error: 'Enter a cookbook code without slashes.' };
  if (isTestEnv) {
    saveStoredCollectionKey(key);
    return { ok: true, key };
  }
  const base = getBaseUrl();
  try {
    const resp = await fetch(`${base}/api/recipes`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (resp.status === 401) return { ok: false, error: 'Invalid code — please check and try again.' };
    if (!resp.ok) return { ok: false, error: `Verification failed (HTTP ${resp.status}) — try again.` };
    saveStoredCollectionKey(key);
    await fetchMetadataForKey(key);
    return { ok: true, key };
  } catch {
    return { ok: false, error: 'Network error — please try again.' };
  }
}

export function showRepositorySetup(statusEl) {
  return new Promise((resolve) => {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <div class="setup-box">
        <p>Enter your secret cookbook code to sync recipes, or continue locally with the bundled recipe.</p>
        <input class="setup-input" id="collection-input" type="password" placeholder="Enter the secret cookbook code" autocomplete="off" spellcheck="false">
        <div id="collection-error" class="setup-error" style="display:none; color: #b91c1c; margin: 8px 0; font-size: 0.9em;"></div>
        <div class="setup-hint">
          Ask the cookbook owner for the code. Each recipe is stored in that collection.
          Keep the code private — anyone with it can read your recipes.
        </div>
        <div class="setup-actions">
          <button class="primary" id="collection-save">Save &amp; sync</button>
          <button id="repository-skip">Skip (local only)</button>
        </div>
      </div>
    `;

    const input = document.getElementById('collection-input');
    const errorEl = document.getElementById('collection-error');
    const saveBtn = document.getElementById('collection-save');
    input.focus();

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }

    async function validateAndSave(collectionKey) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Verifying…';
      errorEl.style.display = 'none';
      try {
        const base = getBaseUrl();
        const resp = await fetch(`${base}/api/recipes`, {
          headers: { Authorization: `Bearer ${collectionKey}` },
        });
        if (resp.status === 401) {
          showError('Invalid code — please check and try again.');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save & sync';
          input.focus();
          input.select();
          return;
        }
        if (!resp.ok) {
          showError(`Verification failed (HTTP ${resp.status}) — try again.`);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save & sync';
          return;
        }
        // Valid — persist, cache metadata best-effort, and resolve
        saveStoredCollectionKey(collectionKey);
        try {
          await fetchMetadataForKey(collectionKey);
        } catch {
          // metadata cache best-effort; ignore
        }
        resolve(collectionKey);
      } catch {
        showError('Network error — please try again.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & sync';
      }
    }

    saveBtn.addEventListener('click', () => {
      const collectionKey = normalizeCollectionKey(input.value);
      if (!collectionKey) {
        input.setCustomValidity('Enter a cookbook code without slashes.');
        input.reportValidity();
        input.focus();
        return;
      }
      input.setCustomValidity('');
      validateAndSave(collectionKey);
    });

    document.getElementById('repository-skip').addEventListener('click', () => {
      markFirestoreSkipped();
      resolve(null);
    });

    input.addEventListener('keydown', (e) => {
      input.setCustomValidity('');
      errorEl.style.display = 'none';
      if (e.key === 'Enter') saveBtn.click();
    });
  });
}

export async function ensureSyncConfig(statusEl) {
  let collectionKey = loadStoredCollectionKey();
  if (!collectionKey && !isFirestoreSkipped()) {
    collectionKey = await showRepositorySetup(statusEl);
  }
  return { collectionKey, cloudSync: !!collectionKey };
}

// Legacy aliases for bootstrap
export const showFirestoreSetup = showRepositorySetup;
export const ensureFirestoreSyncConfig = ensureSyncConfig;

export async function fetchAllRecipes({ onStatus } = {}) {
  if (isTestEnv) {
    if (onStatus) onStatus('Local only');
    return [];
  }
  if (isFirestoreSkipped()) {
    if (onStatus) onStatus('Local only');
    return [];
  }
  const base = getBaseUrl();
  if (onStatus) onStatus('Syncing…');
  try {
    const headers = {};
    const auth = getAuthHeader();
    if (auth) headers.Authorization = auth;
    const resp = await fetch(`${base}/api/recipes`, { headers });
    if (resp.status === 401) {
      const badKey = loadStoredCollectionKey();
      if (badKey) removeStoredCollectionKey(badKey);
      if (onStatus) onStatus('Invalid code — please re-enter');
      throw new Error('Invalid cookbook code — please re-enter');
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const recipes = await resp.json();
    if (onStatus) onStatus('Synced');
    return Array.isArray(recipes) ? recipes : [];
  } catch (e) {
    if (String(e.message).includes('Invalid') || String(e.message).includes('401') || String(e.message).includes('cookbook code')) {
      throw e;
    }
    console.error('[Yes Chef] Repository fetch error', e);
    if (onStatus) onStatus('Local only (sync failed)');
    return [];
  }
}

export async function fetchRecipe({ recipeId, onStatus } = {}) {
  if (isTestEnv) return null;
  const rid = recipeId;
  if (!rid) return null;
  const base = getBaseUrl();
  try {
    const headers = {};
    const auth = getAuthHeader();
    if (auth) headers.Authorization = auth;
    const resp = await fetch(`${base}/api/recipes/${encodeURIComponent(rid)}`, { headers });
    if (resp.status === 401) {
      const badKey = loadStoredCollectionKey();
      if (badKey) removeStoredCollectionKey(badKey);
      if (onStatus) onStatus('Invalid code — please re-enter');
      throw new Error('Invalid cookbook code — please re-enter');
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    return data;
  } catch (e) {
    if (String(e.message).includes('Invalid') || String(e.message).includes('401') || String(e.message).includes('cookbook code')) {
      throw e;
    }
    console.error(`[Yes Chef] Repository fetch error for recipe "${rid}"`, e);
    if (onStatus) onStatus('Local only (sync failed)');
    return null;
  }
}
