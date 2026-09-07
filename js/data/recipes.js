import { fetchAllRecipes, fetchRecipe } from '../repository.js';

let recipesCache = null;

// eslint-disable-next-line no-undef
const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

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

  if (!isTestEnv) {
    try {
      const remote = await fetchAllRecipes({});
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
  if (!isTestEnv) {
    try {
      const remote = await fetchAllRecipes({});
      if (remote.length > 0) return remote;
      // eslint-disable-next-line no-empty
    } catch {}
  }
  return loadFromLocal();
}

export async function getRecipes() {
  if (recipesCache) return recipesCache;
  return loadRecipes();
}

export async function getRecipe(id) {
  if (!isTestEnv) {
    try {
      const remote = await fetchRecipe({ recipeId: id });
      if (remote) return remote;
      // eslint-disable-next-line no-empty
    } catch {}
  }
  const recipes = await loadRecipes();
  return recipes.find((r) => r.id === id) || null;
}

export function _clearCache() {
  recipesCache = null;
}

export async function _reloadFromFirestoreForTests() {
  _clearCache();
  if (!isTestEnv) {
    try {
      const remote = await fetchAllRecipes({});
      if (remote.length > 0) return remote;
      // eslint-disable-next-line no-empty
    } catch {}
  }
  return loadFromLocal();
}

export { loadRecipesFresh as _loadFromLocalForTests };
