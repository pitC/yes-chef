import { getRecipe } from '../data/recipes.js';
import { scaleIngredients, formatAmount } from '../utils/scaling.js';
import { navigate } from '../router.js';
import { signal, computed, effect } from '../signals.js';
import { renderServingsStepper } from '../components/servings-stepper.js';

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

export async function renderDetailView(params, container) {
  if (!container) container = document.getElementById('app') || document.body;
  const recipe = await getRecipe(params.id);
  if (!recipe) {
    container.innerHTML = '<div class="empty-state"><p class="empty-state__text">Recipe not found</p></div>';
    return;
  }

  const storedServings = sessionStorage.getItem(`servings_${recipe.id}`);
  const initialServings = storedServings ? Number(storedServings) : recipe.servings.base;
  const servings = signal(initialServings);

  const scaledIngredients = computed(() =>
    scaleIngredients(recipe.ingredients, recipe.servings.base, servings.value),
  );

  // persist servings for cooking mode
  effect(() => {
    void servings.value;
    sessionStorage.setItem(`servings_${recipe.id}`, String(servings.value));
  });

  const totalTime =
    recipe.timing?.totalMinutes ||
    (recipe.timing?.prepMinutes || 0) + (recipe.timing?.cookMinutes || 0);

  container.innerHTML = `
    <header class="app-header">
      <button class="btn btn--ghost back-btn" aria-label="Back to browse">← Back</button>
      <h1 class="app-header__title" style="flex:1; text-align:center; margin-right:60px;" title="${recipe.title.replace(/"/g, '&quot;')}">${recipe.title}</h1>
    </header>
    <main class="app-main" style="max-width:900px; margin:0 auto; width:100%;">
      <div class="recipe-detail__header">
        <h1 class="recipe-detail__title">${recipe.title}</h1>
        <div class="recipe-detail__meta">
          <span>⏱ ${totalTime} min</span>
          <span>•</span>
          <span>${recipe.servings.base} ${recipe.servings.unit}</span>
          <span>•</span>
          <a href="${recipe.sourceUrl}" target="_blank" rel="noopener" style="font-size:0.9rem; color:var(--color-primary);">${recipe.sourceName} ↗</a>
          <div class="recipe-card__tags" style="margin-left:auto;">
            ${recipe.tags.map((tag) => `<span class="tag ${getTagClass(tag)}" data-tag="${tag}">${tag}</span>`).join('')}
          </div>
        </div>
      </div>

      <div class="detail-card detail-card--servings" style="display:flex; flex-direction:column; align-items:center; gap:8px; margin:16px 0;">
        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; justify-content:center;">
          <label style="font-weight:600; display:flex; align-items:center; align-self:center; line-height:1;">Servings</label>
          <div class="servings-stepper-container" style="display:flex; align-items:center;"></div>
        </div>
        <span style="color:var(--color-text-secondary); font-size:0.72rem; opacity:0.8; text-align:center; display:block; width:100%;">Scales ingredients automatically</span>
      </div>

      <section class="detail-card">
        <h2 style="margin:0 0 12px; font-size:1.2rem;">Ingredients</h2>
        <ul class="ingredients-list"></ul>
      </section>

      <section class="detail-card">
        <h2 style="margin:0 0 12px; font-size:1.2rem;">Steps</h2>
        <ol class="steps-list"></ol>
      </section>

      <button class="btn btn--primary start-cooking-btn" style="width:100%; padding:14px; font-size:1.1rem;">▶ Start Cooking</button>
    </main>
  `;

  const stepperContainer = container.querySelector('.servings-stepper-container');
  renderServingsStepper(initialServings, (newValue) => {
    servings.value = newValue;
  }, stepperContainer);

  const ingredientsList = container.querySelector('.ingredients-list');
  const unsubIngredients = effect(() => {
    ingredientsList.innerHTML = scaledIngredients.value
      .map(
        (ing) => `
        <li class="ingredient-item">
          <span class="ingredient-item__main">
            <strong class="ingredient-item__amount">${formatAmount(ing.amount)} ${ing.unit}</strong>
            <span class="ingredient-item__name">${ing.name}</span>
          </span>
          ${ing.notes ? `<span class="ingredient-item__notes">${ing.notes}</span>` : ''}
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
  backBtn.addEventListener('click', () => {
    sessionStorage.removeItem(`servings_${recipe.id}`);
    navigate('/');
  });

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
