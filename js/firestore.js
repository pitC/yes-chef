import { getFirestoreApi } from './firebase.js';

export const ESTABLISHED_COLLECTION = 'deafening-gnarly-dining';
export const METADATA_DOCUMENT_ID = 'metadata';

// Deprecated: kept for compat, not used for established collection
export function normalizeCollectionKey(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed && !trimmed.includes('/') ? trimmed : null;
}

export async function fetchCollectionMetadata(collectionKey) {
  const key = collectionKey || ESTABLISHED_COLLECTION;
  if (!key) return null;
  try {
    const { db, doc, getDoc } = await getFirestoreApi();
    const snapshot = await getDoc(doc(db, key, METADATA_DOCUMENT_ID));
    return snapshot.exists() ? snapshot.data() : null;
  } catch (e) {
    console.error(`[Yes Chef] Collection metadata fetch error for "${key}"`, e);
    return null;
  }
}

// No longer prompts for collection key — returns established collection immediately
export function showFirestoreSetup() {
  return Promise.resolve(ESTABLISHED_COLLECTION);
}

export async function ensureSyncConfig() {
  return { collectionKey: ESTABLISHED_COLLECTION, cloudSync: true };
}

export async function fetchAllRecipes({ collectionKey, onStatus } = {}) {
  const key = collectionKey || ESTABLISHED_COLLECTION;
  if (!key) {
    if (onStatus) onStatus('Local only');
    return [];
  }

  if (onStatus) onStatus('Syncing…');
  try {
    const { db, collection, getDocs } = await getFirestoreApi();
    const snapshot = await getDocs(collection(db, key));
    const recipes = [];
    const forEach = snapshot.forEach ? snapshot.forEach.bind(snapshot) : null;
    if (forEach) {
      forEach((docSnap) => {
        if (docSnap.id === METADATA_DOCUMENT_ID) return;
        const data = docSnap.data();
        if (data && typeof data === 'object') {
          const recipe = data.id ? data : { ...data, id: docSnap.id };
          recipes.push(recipe);
        }
      });
    } else if (Array.isArray(snapshot.docs)) {
      for (const docSnap of snapshot.docs) {
        if (docSnap.id === METADATA_DOCUMENT_ID) continue;
        const data = docSnap.data();
        if (data && typeof data === 'object') {
          const recipe = data.id ? data : { ...data, id: docSnap.id };
          recipes.push(recipe);
        }
      }
    }
    if (onStatus) onStatus('Synced');
    return recipes;
  } catch (e) {
    console.error('[Yes Chef] Firestore fetch error', e);
    if (onStatus) onStatus('Local only (sync failed)');
    return [];
  }
}

export async function fetchRecipe({ collectionKey, recipeId, onStatus } = {}) {
  const rid = recipeId || collectionKey;
  const key = ESTABLISHED_COLLECTION;
  if (!rid || !key) return null;
  try {
    const { db, doc, getDoc } = await getFirestoreApi();
    const snapshot = await getDoc(doc(db, key, rid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return data.id ? data : { ...data, id: snapshot.id || rid };
  } catch (e) {
    console.error(`[Yes Chef] Firestore fetch error for recipe "${rid}"`, e);
    if (onStatus) onStatus('Local only (sync failed)');
    return null;
  }
}
