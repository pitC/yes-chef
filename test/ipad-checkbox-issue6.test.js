import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderCookingStep } from '../public/js/components/cooking-step.js';
import fs from 'node:fs';
import path from 'node:path';

describe('issue #6: larger check buttons for iPad', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    document.body.removeChild(container);
  });

  it('step-done checkbox is compact on mobile (20px) not oversized', () => {
    const step = {
      id: 'step_1',
      order: 1,
      text: 'Test step',
      timer: null,
      ingredientRefs: [],
    };
    renderCookingStep(step, [], { isDone: false, onToggleDone: vi.fn(), onStartTimer: vi.fn() }, container);
    const cb = container.querySelector('.step-done-checkbox');
    expect(cb).toBeTruthy();
    // Mobile should be compact — inline must NOT be 44px (that would be too large on phone)
    const inlineW = cb.style.width;
    const inlineH = cb.style.height;
    // No large inline size on mobile; CSS will handle responsive scaling
    if (inlineW) expect(parseInt(inlineW, 10)).toBeLessThanOrEqual(24);
    if (inlineH) expect(parseInt(inlineH, 10)).toBeLessThanOrEqual(24);
    // Computed style on jsdom without media query should be base 20px (from CSS)
    // Ensure we have class for styling
    expect(cb.classList.contains('step-done-checkbox')).toBe(true);
  });

  it('CSS is responsive: step checkboxes 44x44 on iPad, ingredient checkboxes stay 18px', async () => {
    const cssPath = path.resolve('public/css/views.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/44px/);
    expect(css).toMatch(/@media\s*\(\s*min-width:\s*768px\s*\)/);
    const media768 = css.split('@media (min-width: 768px)')[1] || '';
    const beforeMedia = css.split('@media (min-width: 768px)')[0];
    // Inside 768 media, step checkboxes should be 44px
    expect(media768).toMatch(/\.step-done-checkbox[^}]*44px/);
    expect(media768).toMatch(/\.prep-done-checkbox[^}]*44px/);
    // Ingredient checkboxes must NOT enlarge on iPad — stay 18px
    expect(media768).not.toMatch(/\.prep-checkbox[^}]*44px/);
    // Base should be compact 20px/18px for phone
    expect(beforeMedia).toMatch(/\.step-done-checkbox[^}]*20px/);
    expect(beforeMedia).toMatch(/\.prep-checkbox[^}]*18px/);
    const count44Before = (beforeMedia.match(/44px/g) || []).length;
    expect(count44Before).toBe(0);
  });

  it('spacing: step grid enlarges on iPad, ingredient checklist stays compact', () => {
    const cssPath = path.resolve('public/css/views.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const beforeMedia = css.split('@media (min-width: 768px)')[0];
    const afterMedia = css.split('@media (min-width: 768px)')[1] || '';
    // Mobile: both gaps compact 6px
    expect(beforeMedia).toMatch(/\.prep-checklist[^}]*gap:\s*6px/);
    expect(beforeMedia).toMatch(/\.cooking-step__grid[^}]*gap:\s*6px 12px/);
    // iPad: only step grid enlarges, ingredient checklist stays 6px
    expect(afterMedia).toMatch(/\.cooking-step__grid[^}]*gap:\s*12px 16px/);
    // Ingredient checklist must not have 12px gap in iPad media
    const prepGap12InMedia = /@media[^}]*\.prep-checklist[^}]*gap:\s*12px/.test(css);
    expect(prepGap12InMedia).toBe(false);
  });

  it('step checkbox shares title row and aligns left with description below', () => {
    const cssPath = path.resolve('public/css/views.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    // Grid keeps check + number on same top row, text full-width below
    expect(css).toMatch(/"check number"/);
    expect(css).toMatch(/"text text"/);
    // Check container flush left, no centering/padding that would inset it vs text
    expect(css).toMatch(/\.cooking-step__check[^}]*justify-content:\s*flex-start/);
    expect(css).toMatch(/\.cooking-step__check[^}]*padding:\s*0/);
    const afterMedia = css.split('@media (min-width: 768px)')[1] || '';
    expect(afterMedia).toMatch(/\.cooking-step__check[^}]*justify-content:\s*flex-start/);
    expect(afterMedia).not.toMatch(/\.cooking-step__check[^}]*justify-content:\s*center/);
    // Rendered DOM: check and number are siblings in grid, text is separate row below
    const step = {
      id: 'step_1',
      order: 1,
      text: 'Test step text',
      timer: null,
      ingredientRefs: [],
    };
    renderCookingStep(step, [], { isDone: false, onToggleDone: vi.fn(), onStartTimer: vi.fn() }, container);
    const grid = container.querySelector('.cooking-step__grid');
    expect(grid).toBeTruthy();
    expect(grid.querySelector('.cooking-step__check')).toBeTruthy();
    expect(grid.querySelector('.cooking-step__number')).toBeTruthy();
    expect(grid.querySelector('.cooking-step__text')).toBeTruthy();
  });
});
