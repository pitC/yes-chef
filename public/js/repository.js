// Generic repository — all data access goes through the app server
// No direct storage SDK usage; generic interface only

import { APP_SERVER_URL } from './app-config.js';
import {
  loadStoredCollectionKey,
  saveStoredCollectionKey,
  markFirestoreSkipped,
  isFirestoreSkipped,
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
  if (isTestEnv) return null;
  const base = getBaseUrl();
  const headers = {};
  const auth = getAuthHeader();
  if (auth) headers.Authorization = auth;
  try {
    const resp = await fetch(`${base}/api/metadata`, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data;
  } catch {
    return null;
  }
}

export function showRepositorySetup(statusEl) {
  return new Promise((resolve) => {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <div class="setup-box">
        <p>Enter your secret cookbook code to sync recipes, or continue locally with the bundled recipe.</p>
        <input class="setup-input" id="collection-input" type="password" placeholder="Enter the secret cookbook code" autocomplete="off" spellcheck="false">
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
    input.focus();

    document.getElementById('collection-save').addEventListener('click', () => {
      const collectionKey = normalizeCollectionKey(input.value);
      if (!collectionKey) {
        input.setCustomValidity('Enter a cookbook code without slashes.');
        input.reportValidity();
        input.focus();
        return;
      }
      input.setCustomValidity('');
      saveStoredCollectionKey(collectionKey);
      resolve(collectionKey);
    });

    document.getElementById('repository-skip').addEventListener('click', () => {
      markFirestoreSkipped();
      resolve(null);
    });

    input.addEventListener('keydown', (e) => {
      input.setCustomValidity('');
      if (e.key === 'Enter') document.getElementById('collection-save').click();
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
  const base = getBaseUrl();
  if (onStatus) onStatus('Syncing…');
  try {
    const headers = {};
    const auth = getAuthHeader();
    if (auth) headers.Authorization = auth;
    const resp = await fetch(`${base}/api/recipes`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const recipes = await resp.json();
    if (onStatus) onStatus('Synced');
    return Array.isArray(recipes) ? recipes : [];
  } catch (e) {
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
    if (!resp.ok) return null;
    const data = await resp.json();
    return data;
  } catch (e) {
    console.error(`[Yes Chef] Repository fetch error for recipe "${rid}"`, e);
    if (onStatus) onStatus('Local only (sync failed)');
    return null;
  }
}
