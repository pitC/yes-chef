export const COLLECTION_KEY = 'yesChefFirestoreCollection';
export const COLLECTION_KEYS_KEY = 'yesChefFirestoreCollections';
export const FIRESTORE_SKIPPED_KEY = 'yesChefFirestoreSkipped';

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
export const loadStoredCookbookKey = loadStoredCollectionKey;
export const loadStoredCookbookKeys = loadStoredCollectionKeys;
export const saveStoredCookbookKey = saveStoredCollectionKey;
export const removeStoredCookbookKey = removeStoredCollectionKey;
