export function renderRecipeCard(recipe, container) {
  const totalTime =
    recipe.timing?.totalMinutes ||
    (recipe.timing?.prepMinutes || 0) + (recipe.timing?.cookMinutes || 0);

  container.innerHTML = `
    <div class="recipe-card__content">
      <h3 class="recipe-card__title">${recipe.title}</h3>
      <div class="recipe-card__meta">
        <span>${totalTime} min</span>
      </div>
      <div class="recipe-card__tags">
        ${recipe.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
      </div>
    </div>
  `;
}