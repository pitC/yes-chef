function getTagClass(tag) {
  const normalized = String(tag).toLowerCase().trim();
  if (normalized === 'mains') return 'tag--mains';
  if (normalized === 'fish') return 'tag--fish';
  if (normalized === 'veg' || normalized === 'vegetarian' || normalized === 'vegetables') return 'tag--veg';
  if (normalized === 'meat') return 'tag--meat';
  if (normalized === 'salad') return 'tag--salad';
  if (normalized === 'breakfast' || normalized === 'supper' || normalized === 'breakfast/supper') return 'tag--breakfast';
  if (normalized === 'cocktails' || normalized === 'cocktail') return 'tag--cocktails';
  return 'tag--default';
}

import { escapeHtml } from '../utils/escape.js';

export function renderRecipeCard(recipe, container) {
  const totalTime =
    recipe.timing?.totalMinutes ||
    (recipe.timing?.prepMinutes || 0) + (recipe.timing?.cookMinutes || 0);

  container.innerHTML = `
    <div class="recipe-card__content">
      <h3 class="recipe-card__title">${escapeHtml(recipe.title)}</h3>
      <div class="recipe-card__meta">
        <span>${escapeHtml(totalTime)} min</span>
      </div>
      <div class="recipe-card__tags">
        ${recipe.tags.map((tag) => `<span class="tag ${getTagClass(tag)}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}
      </div>
    </div>
  `;
}