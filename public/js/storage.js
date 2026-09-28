export const COLLECTION_KEY = 'yesChefFirestoreCollection';
export const COLLECTION_KEYS_KEY = 'yesChefFirestoreCollections';
export const FIRESTORE_SKIPPED_KEY = 'yesChefFirestoreSkipped';
export const COOKBOOK_META_KEY = 'yesChefCookbookMeta';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // ignore
  }
  if (typeof globalThis !== 'undefined') {
    try {
      const g = globalThis.localStorage;
      if (g) return g;
    } catch {
      // Node's experimental localStorage may warn; ignore
    }
  }
  return null;
}

export function loadStoredCollectionKey() {
  const s = getStorage();
  return s ? s.getItem(COLLECTION_KEY) : null;
}

export function loadStoredCollectionKeys() {
  const s = getStorage();
  if (!s) return [];
  let keys = [];
  try {
    const stored = JSON.parse(s.getItem(COLLECTION_KEYS_KEY));
    if (Array.isArray(stored)) keys = stored.filter((k) => typeof k === 'string' && k.length > 0);
  } catch {
    // malformed list; fall through
  }
  const active = s.getItem(COLLECTION_KEY);
  if (active && !keys.includes(active)) keys.push(active);
  return keys;
}

export function saveStoredCollectionKey(collectionKey) {
  const s = getStorage();
  if (!s) return;
  const keys = loadStoredCollectionKeys().filter((k) => k !== collectionKey);
  keys.unshift(collectionKey);
  s.setItem(COLLECTION_KEYS_KEY, JSON.stringify(keys));
  s.setItem(COLLECTION_KEY, collectionKey);
  s.removeItem(FIRESTORE_SKIPPED_KEY);
}

export function removeStoredCollectionKey(collectionKey) {
  const s = getStorage();
  if (!s) return;
  const keys = loadStoredCollectionKeys().filter((k) => k !== collectionKey);
  s.setItem(COLLECTION_KEYS_KEY, JSON.stringify(keys));
  if (s.getItem(COLLECTION_KEY) === collectionKey) {
    s.removeItem(COLLECTION_KEY);
  }
  removeCookbookMeta(collectionKey);
}

export function markFirestoreSkipped() {
  const s = getStorage();
  if (!s) return;
  s.setItem(FIRESTORE_SKIPPED_KEY, '1');
  s.removeItem(COLLECTION_KEY);
}

export function isFirestoreSkipped() {
  const s = getStorage();
  return s ? s.getItem(FIRESTORE_SKIPPED_KEY) === '1' : false;
}

// Aliases for cookbook terminology
export const COOKBOOK_COLLECTION_KEY = COLLECTION_KEY;
export const COOKBOOK_COLLECTIONS_KEY = COLLECTION_KEYS_KEY;
export const COOKBOOK_SKIPPED_KEY = FIRESTORE_SKIPPED_KEY;
export const COOKBOOK_META_STORAGE_KEY = COOKBOOK_META_KEY;
export const loadStoredCookbookKey = loadStoredCollectionKey;
export const loadStoredCookbookKeys = loadStoredCollectionKeys;
export const saveStoredCookbookKey = saveStoredCollectionKey;
export const removeStoredCookbookKey = removeStoredCollectionKey;

export function loadCookbookMetaMap() {
  const s = getStorage();
  if (!s) return {};
  try {
    const parsed = JSON.parse(s.getItem(COOKBOOK_META_KEY));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // malformed; fall through
  }
  return {};
}

export function getCookbookMeta(collectionKey) {
  if (typeof collectionKey !== 'string' || !collectionKey) return null;
  const map = loadCookbookMetaMap();
  const entry = map[collectionKey];
  return entry && typeof entry === 'object' ? entry : null;
}

export function saveCookbookMeta(collectionKey, meta) {
  const s = getStorage();
  if (!s || typeof collectionKey !== 'string' || !collectionKey) return;
  if (!meta || typeof meta !== 'object') return;
  const map = loadCookbookMetaMap();
  map[collectionKey] = { ...meta };
  try {
    s.setItem(COOKBOOK_META_KEY, JSON.stringify(map));
  } catch {
    // quota or unavailable; ignore
  }
}

export function removeCookbookMeta(collectionKey) {
  const s = getStorage();
  if (!s || typeof collectionKey !== 'string' || !collectionKey) return;
  const map = loadCookbookMetaMap();
  if (map[collectionKey]) {
    delete map[collectionKey];
    try {
      s.setItem(COOKBOOK_META_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }
}
