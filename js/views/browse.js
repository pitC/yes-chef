import { getRecipes } from '../data/recipes.js';
import { filterByTags, filterByKeyword, extractAllTags } from '../utils/tags.js';
import { navigate } from '../router.js';
import { signal, computed, effect } from '../signals.js';
import { renderRecipeCard } from '../components/recipe-card.js';

const BROWSE_STATE_KEY = 'browse_view_state';

function saveBrowseState(search, tags, scrollY) {
  try {
    sessionStorage.setItem(
      BROWSE_STATE_KEY,
      JSON.stringify({ search, tags: Array.from(tags), scrollY }),
    );
  } catch (e) {
    // ignore
  }
}

function loadBrowseState() {
  try {
    const stored = sessionStorage.getItem(BROWSE_STATE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      return {
        search: state.search || '',
        tags: new Set(state.tags || []),
        scrollY: state.scrollY || 0,
      };
    }
  } catch (e) {
    // ignore
  }
  return { search: '', tags: new Set(), scrollY: 0 };
}


export async function renderBrowseView(params, container) {
  const recipes = await getRecipes();
  const allTags = extractAllTags(recipes);

  const loadedState = loadBrowseState();
  const searchQuery = signal(loadedState.search);
  const selectedTags = signal(new Set(loadedState.tags));
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
    chip.classList.toggle('active', selectedTags.value.has(chip.dataset.tag));
    chip.classList.toggle('selected', selectedTags.value.has(chip.dataset.tag));
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

  if (loadedState.search) {
    searchInput.value = loadedState.search;
  }

  if (loadedState.tags.size > 0) {
    tagChips.forEach((chip) => {
      chip.classList.toggle('active', loadedState.tags.has(chip.dataset.tag));
      chip.classList.toggle('selected', loadedState.tags.has(chip.dataset.tag));
    });
  }

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
            saveBrowseState(
              searchQuery.value,
              selectedTags.value,
              window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
            );
            navigate(`/recipe/${recipe.id}`);
          });
          grid.appendChild(card);
        });
      }
    }),
  );

  if (loadedState.scrollY > 0) {
    setTimeout(() => {
      window.scrollTo(0, loadedState.scrollY);
    }, 0);
  }

  let saveTimer = null;

  function debouncedSaveState() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveBrowseState(
        searchQuery.value,
        selectedTags.value,
        window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
      );
    }, 100);
  }

  const saveEffect = effect(() => {
    void searchQuery.value;
    void selectedTags.value;
    debouncedSaveState();
  });

  unsubs.push(saveEffect);

  window.addEventListener('scroll', debouncedSaveState);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (saveTimer) clearTimeout(saveTimer);
    window.removeEventListener('scroll', debouncedSaveState);
    unsubs.forEach((fn) => {
      if (typeof fn === 'function') fn();
    });
  };
}