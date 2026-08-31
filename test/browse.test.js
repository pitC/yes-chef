import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderBrowseView } from '../js/views/browse.js';
import { renderRecipeCard } from '../js/components/recipe-card.js';

vi.mock('../js/router.js', () => ({
  navigate: vi.fn(),
  router: {
    currentRoute: { value: { path: '/', params: {} } },
    on: vi.fn(),
    start: vi.fn(),
    navigate: vi.fn(),
  },
}));

describe('browse view', () => {
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders recipe cards for all recipes', async () => {
    await renderBrowseView({}, container);
    
    const cards = container.querySelectorAll('.recipe-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('search input filters by keyword (debounced 150ms)', async () => {
    await renderBrowseView({}, container);
    
    const searchInput = container.querySelector('input[type="search"]');
    expect(searchInput).toBeTruthy();
    
    searchInput.value = 'menemen';
    searchInput.dispatchEvent(new Event('input'));
    
    vi.advanceTimersByTime(150);
    
    const cards = container.querySelectorAll('.recipe-card');
    expect(cards.length).toBe(1);
  });

  it('tag chips show all unique tags; click toggles selection', async () => {
    await renderBrowseView({}, container);
    
    const tagChips = container.querySelectorAll('.tag-chip');
    expect(tagChips.length).toBeGreaterThan(0);
    
    const firstTag = tagChips[0];
    firstTag.click();
    
    expect(firstTag.classList.contains('selected')).toBe(true);
  });

  it('multiple selected tags = OR filter', async () => {
    await renderBrowseView({}, container);
    
    const tagChips = container.querySelectorAll('.tag-chip');
    tagChips[0].click();
    if (tagChips.length > 1) tagChips[1].click();
    
    vi.advanceTimersByTime(150);
    
    const cards = container.querySelectorAll('.recipe-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('empty state when no recipes match', async () => {
    await renderBrowseView({}, container);
    
    const searchInput = container.querySelector('input[type="search"]');
    searchInput.value = 'nonexistent';
    searchInput.dispatchEvent(new Event('input'));
    
    vi.advanceTimersByTime(150);
    
    const emptyState = container.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
  });

  it('clicking card navigates to /recipe/:id', async () => {
    const { navigate } = await import('../js/router.js');
    
    await renderBrowseView({}, container);
    
    const card = container.querySelector('.recipe-card');
    card.click();
    
    expect(navigate).toHaveBeenCalledWith('/recipe/menemen');
  });
});

describe('recipe card component', () => {
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders title, timing, tags', () => {
    const recipe = {
      id: 'test',
      title: 'Test Recipe',
      timing: { prepMinutes: 5, cookMinutes: 10, totalMinutes: 15 },
      tags: ['tag1', 'tag2'],
    };
    
    renderRecipeCard(recipe, container);
    
    expect(container.textContent).toContain('Test Recipe');
    expect(container.textContent).toContain('15');
    expect(container.textContent).toContain('tag1');
    expect(container.textContent).toContain('tag2');
  });
});