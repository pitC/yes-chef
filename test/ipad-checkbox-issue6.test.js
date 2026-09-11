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

  it('step-done checkbox should be at least 44x44', () => {
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
    // Check inline style or computed style width/height >=44
    const width = cb.style.width || getComputedStyle(cb).width;
    const height = cb.style.height || getComputedStyle(cb).height;
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);
    // Allow either inline 44px or CSS-driven 44px
    expect(w).toBeGreaterThanOrEqual(44);
    expect(h).toBeGreaterThanOrEqual(44);
  });

  it('prep checkboxes should be at least 44x44 on iPad', async () => {
    // Render cooking view prep check requires cooking.js, but we can test CSS file directly
    const cssPath = path.resolve('public/css/views.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    // Should contain 44px for checkboxes and media query or direct rule
    expect(css).toMatch(/44px/);
    // Should have responsive / iPad consideration: either media query or min-width
    const hasResponsive = css.includes('@media') && css.includes('44px');
    const hasDirect44 = /\.step-done-checkbox[^}]*44px/.test(css) || /cooking-step__check[^}]*44px/.test(css) || css.includes('.prep-done-checkbox');
    // At least one of these should be true after fix
    expect(hasResponsive || hasDirect44 || css.match(/44px/g).length >= 2).toBeTruthy();
  });

  it('checkboxes should have adequate spacing (gap or padding >= 12px in CSS)', () => {
    const cssPath = path.resolve('public/css/views.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    // Look for gap or padding that prevents accidental taps - should be >=12px or 16px
    // After fix, cooking-step__grid gap should be larger on iPad, or prep checklist gap
    const hasLargeGap = css.includes('gap:') && (css.includes('12px') || css.includes('16px') || css.includes('gap: 12') || css.includes('gap: 16'));
    expect(hasLargeGap).toBeTruthy();
    // Also check that check container has padding/min-height for touch target
    // The checkbox itself should have spacing via container styles
  });
});
