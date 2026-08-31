import { getFirestoreApi } from './firebase.js';
import {
  loadStoredCollectionKey,
  saveStoredCollectionKey,
  markFirestoreSkipped,
  isFirestoreSkipped,
} from './storage.js';

export function normalizeCollectionKey(input) {
  const trimmed = input.trim();
  return trimmed && !trimmed.includes('/') ? trimmed : null;
}

export const METADATA_DOCUMENT_ID = 'metadata';

export async function fetchCollectionMetadata(collectionKey) {
  if (!collectionKey) return null;
  try {
    const { db, doc, getDoc } = await getFirestoreApi();
    const snapshot = await getDoc(doc(db, collectionKey, METADATA_DOCUMENT_ID));
    return snapshot.exists() ? snapshot.data() : null;
  } catch (e) {
    console.error(`[Yes Chef] Collection metadata fetch error for "${collectionKey}"`, e);
    return null;
  }
}

export function showFirestoreSetup(statusEl) {
  return new Promise((resolve) => {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <div class="setup-box">
        <p>Enter your secret cookbook code to sync recipes from Firestore, or continue locally with the bundled recipe.</p>
        <input class="setup-input" id="collection-input" type="password" placeholder="Enter the secret cookbook code" autocomplete="off" spellcheck="false">
        <div class="setup-hint">
          Ask the cookbook owner for the code. Each recipe is a separate document in that Firestore collection.
          Keep the code private — anyone with it can read your recipes.
        </div>
        <div class="setup-actions">
          <button class="primary" id="collection-save">Save &amp; sync</button>
          <button id="firestore-skip">Skip (local only)</button>
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

    document.getElementById('firestore-skip').addEventListener('click', () => {
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
    collectionKey = await showFirestoreSetup(statusEl);
  }
  return { collectionKey, cloudSync: !!collectionKey };
}

export async function fetchAllRecipes({ collectionKey, onStatus } = {}) {
  if (!collectionKey) {
    if (onStatus) onStatus('Local only');
    return [];
  }

  if (onStatus) onStatus('Syncing…');
  try {
    const { db, collection, getDocs } = await getFirestoreApi();
    const snapshot = await getDocs(collection(db, collectionKey));
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
  if (!collectionKey || !recipeId) return null;
  try {
    const { db, doc, getDoc } = await getFirestoreApi();
    const snapshot = await getDoc(doc(db, collectionKey, recipeId));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return data.id ? data : { ...data, id: snapshot.id || recipeId };
  } catch (e) {
    console.error(`[Yes Chef] Firestore fetch error for recipe "${recipeId}"`, e);
    if (onStatus) onStatus('Local only (sync failed)');
    return null;
  }
}
