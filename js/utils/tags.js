export function extractAllTags(recipes) {
  const tagSet = new Set();
  recipes.forEach((recipe) => {
    recipe.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

export function filterByTags(recipes, selectedTags) {
  if (!selectedTags || selectedTags.length === 0) {
    return recipes;
  }
  return recipes.filter((recipe) =>
    selectedTags.some((tag) => recipe.tags.includes(tag))
  );
}

export function filterByKeyword(recipes, query) {
  if (!query || query.trim() === '') {
    return recipes;
  }
  const lowerQuery = query.toLowerCase().trim();
  return recipes.filter((recipe) => {
    if (recipe.title.toLowerCase().includes(lowerQuery)) return true;
    if (recipe.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))) return true;
    if (recipe.ingredients.some((ing) => ing.name.toLowerCase().includes(lowerQuery))) return true;
    return false;
  });
}