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
  if (recipesCache) {
    console.error(`[Yes Chef] loadRecipes: returning cached ${recipesCache.length} recipes`);
    return recipesCache;
  }

  const collectionKey = loadStoredCollectionKey();
  console.error(`[Yes Chef] loadRecipes: collectionKey="${collectionKey}"`);
  if (collectionKey) {
    try {
      const remote = await fetchAllRecipes({ collectionKey });
      console.error(`[Yes Chef] loadRecipes: remote returned ${remote.length} recipes`);
      if (remote.length > 0) {
        recipesCache = remote;
        console.error(`[Yes Chef] loadRecipes: using remote ${remote.map((r) => r.id).join(', ')}`);
        return recipesCache;
      }
      console.error(`[Yes Chef] loadRecipes: remote empty, falling back to local`);
    } catch (e) {
      console.error('[Yes Chef] Failed to load recipes from Firestore, falling back to local', e);
    }
  } else {
    console.error(`[Yes Chef] loadRecipes: no collectionKey, using local`);
  }

  const local = await loadFromLocal();
  console.error(`[Yes Chef] loadRecipes: using local ${local.map((r) => r.id).join(', ')}`);
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
  console.error(`[Yes Chef] getRecipe: id="${id}" collectionKey="${collectionKey}"`);
  if (collectionKey) {
    const remote = await fetchRecipe({ collectionKey, recipeId: id });
    console.error(`[Yes Chef] getRecipe: remote ${remote ? `hit ${remote.id}` : 'miss'}`);
    if (remote) return remote;
  }
  const recipes = await loadRecipes();
  const found = recipes.find((r) => r.id === id) || null;
  console.error(`[Yes Chef] getRecipe: from loadRecipes ${found ? `hit ${found.id}` : 'miss'}`);
  return found;
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