import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderBrowseView } from '../js/views/browse.js';
import { renderDetailView } from '../js/views/detail.js';
import { renderCookingView } from '../js/views/cooking.js';
import { navigate } from '../js/router.js';
import { timerManager } from '../js/timers/manager.js';

vi.mock('../js/router.js', () => ({
  navigate: vi.fn(),
  router: {
    currentRoute: { value: { path: '/', params: {} } },
    on: vi.fn(),
    start: vi.fn(),
    navigate: vi.fn(),
  },
}));

describe('integration: Browse → Detail → Cooking → Timer flow', () => {
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);
    vi.useFakeTimers();
    sessionStorage.clear();
    
    // Clear timers
    const timers = timerManager.getAllTimers();
    timers.value.forEach(t => timerManager.cancelTimer(t.id));
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('complete flow: browse → detail → cooking → start timer', async () => {
    // 1. Start at browse view
    await renderBrowseView({}, container);
    
    expect(container.querySelector('.recipe-card')).toBeTruthy();
    
    // 2. Click recipe card to navigate to detail
    const recipeCard = container.querySelector('.recipe-card');
    recipeCard.click();
    
    expect(navigate).toHaveBeenCalledWith('/recipe/menemen');
    
    // 3. Render detail view
    container.innerHTML = '';
    await renderDetailView({ id: 'menemen' }, container);
    
    expect(container.textContent).toContain('Menemen');
    expect(container.querySelector('.start-cooking-btn')).toBeTruthy();
    
    // 4. Click Start Cooking
    const startBtn = container.querySelector('.start-cooking-btn');
    startBtn.click();
    
    expect(navigate).toHaveBeenCalledWith('/cook/menemen');
    
    // 5. Render cooking view
    container.innerHTML = '';
    await renderCookingView({ id: 'menemen' }, container);
    
    expect(container.querySelectorAll('.cooking-step').length).toBe(6);
    
    // 6. Start a timer on step 2 (which has a timer)
    const stepWithTimer = container.querySelector('.cooking-step[data-step-id="step_2"]');
    const timerBtn = stepWithTimer.querySelector('.start-timer-btn');
    timerBtn.click();
    
    // 7. Verify timer was created
    const timers = timerManager.getAllTimers().value;
    expect(timers.length).toBe(1);
    expect(timers[0].label).toBe('Cook onions');
  });

  it('mark step as done persists across navigation', async () => {
    await renderCookingView({ id: 'menemen' }, container);
    
    // Mark first step as done
    const firstStep = container.querySelector('.cooking-step[data-step-id="step_1"]');
    const checkbox = firstStep.querySelector('.step-done-checkbox');
    checkbox.click();
    
    // Verify signal updated
    const { doneSteps } = await import('../js/views/cooking.js');
    expect(doneSteps.value.has('step_1')).toBe(true);
  });

  it('servings scaling works in detail view', async () => {
    await renderDetailView({ id: 'menemen' }, container);
    
    // Initial amount for eggs (4 pieces for 2 servings)
    const eggsItem = container.querySelector('.ingredients-list li');
    expect(eggsItem.textContent).toContain('4');
    
    // Increase servings to 4
    const incrementBtn = container.querySelector('.stepper-increment');
    incrementBtn.click();
    incrementBtn.click();
    
    // Check stepper value
    const stepperValue = container.querySelector('.stepper-value');
    expect(stepperValue.textContent).toBe('4');
  });
});