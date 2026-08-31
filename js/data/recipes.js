let recipesCache = null;

async function loadRecipes() {
  if (recipesCache) return recipesCache;

  const url = new URL('test/menemen.json', window.location.href).href;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load recipes: ${response.status}`);
  }
  const recipe = await response.json();
  recipesCache = [recipe];
  return recipesCache;
}

export async function getRecipes() {
  return loadRecipes();
}

export async function getRecipe(id) {
  const recipes = await loadRecipes();
  return recipes.find((r) => r.id === id) || null;
}

export function _clearCache() {
  recipesCache = null;
}