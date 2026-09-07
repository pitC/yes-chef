// Generic repository — all data access goes through the app server
// No direct storage SDK usage; generic interface only

import { APP_SERVER_URL } from './app-config.js';

export const METADATA_DOCUMENT_ID = 'metadata';

// eslint-disable-next-line no-undef
const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

function getBaseUrl() {
  // APP_SERVER_URL is set via js/app-config.js (generated at deploy)
  // In production on Cloud Storage, it will be the Cloud Run URL
  // In local dev, http://localhost:8080
  // If empty, use same-origin /api (when frontend and server share origin)
  const base = (typeof APP_SERVER_URL === 'string' && APP_SERVER_URL.trim()) ? APP_SERVER_URL.trim().replace(/\/+$/, '') : '';
  return base;
}

export function normalizeCollectionKey(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed && !trimmed.includes('/') ? trimmed : null;
}

export async function fetchCollectionMetadata() {
  if (isTestEnv) return null;
  const base = getBaseUrl();
  try {
    const resp = await fetch(`${base}/api/metadata`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data;
  } catch {
    return null;
  }
}

// No longer prompts for collection — server discovers automatically
export function showRepositorySetup() {
  return Promise.resolve(null);
}

export async function ensureSyncConfig() {
  return { cloudSync: true };
}

// Legacy alias for bootstrap
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
    const resp = await fetch(`${base}/api/recipes`);
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
    const resp = await fetch(`${base}/api/recipes/${encodeURIComponent(rid)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data;
  } catch (e) {
    console.error(`[Yes Chef] Repository fetch error for recipe "${rid}"`, e);
    if (onStatus) onStatus('Local only (sync failed)');
    return null;
  }
}
