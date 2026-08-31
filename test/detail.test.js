import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderDetailView } from '../js/views/detail.js';

vi.mock('../js/router.js', () => ({
  navigate: vi.fn(),
  router: {
    currentRoute: { value: { path: '/', params: {} } },
    on: vi.fn(),
    start: vi.fn(),
    navigate: vi.fn(),
  },
}));

describe('detail view', () => {
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('shows recipe title, timing, tags, source link', async () => {
    await renderDetailView({ id: 'menemen' }, container);
    
    expect(container.textContent).toContain('Menemen');
    expect(container.textContent).toContain('20 min');
    expect(container.textContent).toContain('breakfast');
    expect(container.textContent).toContain('The Guardian');
  });

  it('ingredient list shows scaled amounts based on stepper value', async () => {
    await renderDetailView({ id: 'menemen' }, container);
    
    const ingredients = container.querySelectorAll('.ingredient-item');
    expect(ingredients.length).toBeGreaterThan(0);
    
    const firstIngredient = ingredients[0];
    expect(firstIngredient.textContent).toContain('eggs');
    expect(firstIngredient.textContent).toContain('4');
  });

  it('stepper updates ingredient amounts live (via signal)', async () => {
    await renderDetailView({ id: 'menemen' }, container);
    
    const incrementBtn = container.querySelector('.stepper-increment');
    incrementBtn.click();
    
    const firstIngredient = container.querySelector('.ingredient-item');
    expect(firstIngredient.textContent).toContain('6');
  });

  it('steps show order, text, timer label if present, ingredient chips', async () => {
    await renderDetailView({ id: 'menemen' }, container);
    
    const steps = container.querySelectorAll('.step-item');
    expect(steps.length).toBe(5);
    
    const firstStep = steps[0];
    expect(firstStep.textContent).toContain('1');
    expect(firstStep.textContent).toContain('beat');
  });

  it('Start Cooking navigates to /cook/:id', async () => {
    const { navigate } = await import('../js/router.js');
    
    await renderDetailView({ id: 'menemen' }, container);
    
    const startBtn = container.querySelector('.start-cooking-btn');
    startBtn.click();
    
    expect(navigate).toHaveBeenCalledWith('/cook/menemen');
  });

  it('Back button returns to browse', async () => {
    const { navigate } = await import('../js/router.js');
    
    await renderDetailView({ id: 'menemen' }, container);
    
    const backBtn = container.querySelector('.back-btn');
    backBtn.click();
    
    expect(navigate).toHaveBeenCalledWith('/');
  });
});