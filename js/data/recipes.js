import { loadStoredCollectionKey } from '../storage.js';
import { fetchAllRecipes, fetchRecipe } from '../firestore.js';

let recipesCache = null;

async function loadFromLocal() {
  const url = new URL('test/menemen.json', window.location.href).href;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load recipes: ${response.status}`);
  }
  const recipe = await response.json();
  return [recipe];
}

async function loadRecipes() {
  if (recipesCache) return recipesCache;

  const collectionKey = loadStoredCollectionKey();
  if (collectionKey) {
    try {
      const remote = await fetchAllRecipes({ collectionKey });
      if (remote.length > 0) {
        recipesCache = remote;
        return recipesCache;
      }
    } catch (e) {
      console.error('[Yes Chef] Failed to load recipes from Firestore, falling back to local', e);
    }
  }

  const local = await loadFromLocal();
  recipesCache = local;
  return recipesCache;
}

async function loadRecipesFresh() {
  const collectionKey = loadStoredCollectionKey();
  if (collectionKey) {
    const remote = await fetchAllRecipes({ collectionKey });
    if (remote.length > 0) return remote;
  }
  return loadFromLocal();
}

export async function getRecipes() {
  if (recipesCache) return recipesCache;
  // Avoid double-fetching when loadRecipes already handles fallback logic
  return loadRecipes();
}

export async function getRecipe(id) {
  const collectionKey = loadStoredCollectionKey();
  if (collectionKey) {
    const remote = await fetchRecipe({ collectionKey, recipeId: id });
    if (remote) return remote;
  }
  const recipes = await loadRecipes();
  return recipes.find((r) => r.id === id) || null;
}

export function _clearCache() {
  recipesCache = null;
}

export async function _reloadFromFirestoreForTests(collectionKey) {
  _clearCache();
  if (collectionKey) {
    return fetchAllRecipes({ collectionKey });
  }
  return loadFromLocal();
}

export { loadRecipesFresh as _loadFromLocalForTests };