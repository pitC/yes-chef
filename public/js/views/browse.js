import { getRecipes } from '../data/recipes.js';
import { filterByTags, filterByKeyword, extractAllTags } from '../utils/tags.js';
import { navigate } from '../router.js';
import { signal, computed, effect } from '../signals.js';
import { renderRecipeCard } from '../components/recipe-card.js';

export async function renderBrowseView(params, container) {
  let recipes;
  try {
    recipes = await getRecipes();
  } catch (e) {
    const isAuthError = String(e.message).includes('Invalid') || String(e.message).includes('401') || String(e.message).includes('cookbook code');
    if (isAuthError) {
      container.innerHTML = `
        <div class="error-state" style="padding: 24px; text-align: center;">
          <p style="color: #b91c1c; font-weight: 600; margin-bottom: 12px;">Invalid cookbook code — please check and try again.</p>
          <p style="color: #666; margin-bottom: 16px;">The code you entered is not valid. Please re-enter the correct code.</p>
          <button class="primary" id="retry-code">Re-enter code</button>
          <button id="use-local">Use local recipes</button>
        </div>
      `;
      container.querySelector('#retry-code').addEventListener('click', () => {
        localStorage.removeItem('yesChefFirestoreCollection');
        localStorage.removeItem('yesChefFirestoreSkipped');
        window.location.reload();
      });
      container.querySelector('#use-local').addEventListener('click', async () => {
        localStorage.setItem('yesChefFirestoreSkipped', '1');
        localStorage.removeItem('yesChefFirestoreCollection');
        window.location.reload();
      });
      return () => {};
    }
    throw e;
  }
  const allTags = extractAllTags(recipes);

  const searchQuery = signal('');
  const selectedTags = signal(new Set());
  const debouncedQuery = signal('');

  let debounceTimer = null;
  const unsubs = [];

  unsubs.push(
    effect(() => {
      const query = searchQuery.value;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debouncedQuery.value = query;
      }, 150);
    }),
  );

  const filteredRecipes = computed(() => {
    let result = filterByTags(recipes, Array.from(selectedTags.value));
    result = filterByKeyword(result, debouncedQuery.value);
    return result;
  });

  container.innerHTML = `
    <header class="app-header">
      <h1 class="app-header__title">Yes Chef</h1>
    </header>
    <main class="app-main">
      <input type="search" class="search-bar search-input" placeholder="Search recipes..." aria-label="Search recipes" />
      <div class="filter-chips tag-filters">
        ${allTags.map((tag) => `<button class="filter-chip tag-chip" data-tag="${tag}">${tag}</button>`).join('')}
      </div>
      <div class="recipe-list recipe-grid"></div>
      <div class="empty-state hidden" style="display: none;">No recipes found</div>
    </main>
  `;

  const searchInput = container.querySelector('.search-bar');
  searchInput.addEventListener('input', (e) => {
    searchQuery.value = e.target.value;
  });

  const tagChips = container.querySelectorAll('.filter-chip');
  tagChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      const newSelected = new Set(selectedTags.value);
      if (newSelected.has(tag)) {
        newSelected.delete(tag);
      } else {
        newSelected.add(tag);
      }
      selectedTags.value = newSelected;
      chip.classList.toggle('active', newSelected.has(tag));
      chip.classList.toggle('selected', newSelected.has(tag));
    });
  });

  const grid = container.querySelector('.recipe-list');
  const emptyState = container.querySelector('.empty-state');

  unsubs.push(
    effect(() => {
      const result = filteredRecipes.value;
      if (result.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        emptyState.style.display = 'block';
      } else {
        emptyState.classList.add('hidden');
        emptyState.style.display = 'none';
        grid.innerHTML = '';
        result.forEach((recipe) => {
          const card = document.createElement('div');
          card.className = 'recipe-card';
          card.dataset.id = recipe.id;
          renderRecipeCard(recipe, card);
          card.addEventListener('click', () => {
            navigate(`/recipe/${recipe.id}`);
          });
          grid.appendChild(card);
        });
      }
    }),
  );

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubs.forEach((fn) => {
      if (typeof fn === 'function') fn();
    });
  };
}