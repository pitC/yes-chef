import { getRecipe } from '../data/recipes.js';
import { scaleIngredients, formatAmount } from '../utils/scaling.js';
import { navigate } from '../router.js';
import { signal, computed, effect } from '../signals.js';
import { renderServingsStepper } from '../components/servings-stepper.js';

export async function renderDetailView(params, container) {
  if (!container) container = document.getElementById('app') || document.body;
  const recipe = await getRecipe(params.id);
  if (!recipe) {
    container.innerHTML = '<div class="empty-state"><p class="empty-state__text">Recipe not found</p></div>';
    return;
  }

  const servings = signal(recipe.servings.base);

  const scaledIngredients = computed(() =>
    scaleIngredients(recipe.ingredients, recipe.servings.base, servings.value),
  );

  const totalTime =
    recipe.timing?.totalMinutes ||
    (recipe.timing?.prepMinutes || 0) + (recipe.timing?.cookMinutes || 0);

  container.innerHTML = `
    <header class="app-header">
      <button class="btn btn--secondary back-btn" aria-label="Back to browse">← Back</button>
      <h1 class="app-header__title" style="flex:1; text-align:center; margin-right:60px;">${recipe.title}</h1>
    </header>
    <main class="app-main" style="max-width:900px; margin:0 auto; width:100%;">
      <div class="recipe-detail__header">
        <h1 class="recipe-detail__title">${recipe.title}</h1>
        <div class="recipe-detail__meta">
          <span>⏱ ${totalTime} min</span>
          <span>•</span>
          <span>${recipe.servings.base} ${recipe.servings.unit}</span>
          <div class="recipe-card__tags" style="margin-left:auto;">
            ${recipe.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
          </div>
        </div>
        <a href="${recipe.sourceUrl}" target="_blank" rel="noopener" style="font-size:0.85rem; color:var(--color-primary);">${recipe.sourceName} ↗</a>
      </div>

      <div style="display:flex; align-items:center; gap:16px; margin:16px 0; background:var(--color-surface); padding:12px 16px; border-radius:12px; box-shadow:var(--shadow-sm);">
        <label style="font-weight:600;">Servings</label>
        <div class="servings-stepper-container"></div>
        <span style="color:var(--color-text-secondary); font-size:0.9rem; margin-left:auto;">Scales ingredients automatically</span>
      </div>

      <section style="background:var(--color-surface); border-radius:12px; box-shadow:var(--shadow-sm); padding:16px; margin-bottom:16px;">
        <h2 style="margin:0 0 12px; font-size:1.2rem;">Ingredients</h2>
        <ul class="ingredients-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:8px;"></ul>
      </section>

      <section style="background:var(--color-surface); border-radius:12px; box-shadow:var(--shadow-sm); padding:16px; margin-bottom:20px;">
        <h2 style="margin:0 0 12px; font-size:1.2rem;">Steps</h2>
        <ol class="steps-list"></ol>
      </section>

      <button class="btn btn--primary start-cooking-btn" style="width:100%; padding:14px; font-size:1.1rem;">▶ Start Cooking</button>
    </main>
  `;

  const stepperContainer = container.querySelector('.servings-stepper-container');
  renderServingsStepper(recipe.servings.base, (newValue) => {
    servings.value = newValue;
  }, stepperContainer);

  const ingredientsList = container.querySelector('.ingredients-list');
  const unsubIngredients = effect(() => {
    ingredientsList.innerHTML = scaledIngredients.value
      .map(
        (ing) => `
        <li class="ingredient-item" style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-background); font-size:0.92rem;">
          <span style="display:flex; gap:6px; align-items:baseline; flex-wrap:wrap;">
            <strong style="color:var(--color-primary-dark);">${formatAmount(ing.amount)} ${ing.unit}</strong>
            <span class="ingredient-name">${ing.name}</span>
          </span>
          ${ing.notes ? `<span style="color:var(--color-text-secondary); font-size:0.8rem; text-align:right; max-width:45%;">${ing.notes}</span>` : ''}
        </li>
      `,
      )
      .join('');
  });

  function highlightText(text) {
    return text.replace(/\[([^\]]+)\]/g, '<span class="ingredient-highlight">$1</span>');
  }

  const stepsList = container.querySelector('.steps-list');
  stepsList.innerHTML = recipe.steps
    .map(
      (step) => `
      <li class="step-item" data-step-id="${step.id}" style="align-items:flex-start;">
        <span class="step-item__number">${step.order}</span>
        <div class="step-item__content">
          <p class="step-item__text">${highlightText(step.text)}</p>
          ${step.timer ? `<span class="step-item__timer">⏱ ${step.timer.label} · ${formatDuration(step.timer.durationSeconds)}</span>` : ''}
        </div>
      </li>
    `,
    )
    .join('');

  const backBtn = container.querySelector('.back-btn');
  backBtn.addEventListener('click', () => navigate('/'));

  const startBtn = container.querySelector('.start-cooking-btn');
  startBtn.addEventListener('click', () => navigate(`/cook/${recipe.id}`));

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins} min`;
  }

  return () => {
    if (typeof unsubIngredients === 'function') unsubIngredients();
  };
}
