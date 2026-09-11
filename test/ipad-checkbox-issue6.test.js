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

  it('CSS is responsive: base 20px on mobile, 44x44 on iPad via 768px media query', async () => {
    const cssPath = path.resolve('public/css/views.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/44px/);
    // Must have responsive media query for iPad
    expect(css).toMatch(/@media\s*\(\s*min-width:\s*768px\s*\)/);
    // Inside 768 media, checkboxes should be 44px
    const media768 = css.split('@media (min-width: 768px)')[1] || '';
    // Check that 44px appears after the media query (within it)
    expect(media768).toMatch(/44px/);
    // Base (outside media) should be compact 20px/18px for phone
    const beforeMedia = css.split('@media (min-width: 768px)')[0];
    expect(beforeMedia).toMatch(/\.step-done-checkbox[^}]*20px/);
    expect(beforeMedia).toMatch(/\.prep-checkbox[^}]*18px/);
    // Ensure we don't have universal 44px outside media (would affect mobile)
    // The only 44px outside 768 should be none — count 44s before media should be 0
    const count44Before = (beforeMedia.match(/44px/g) || []).length;
    expect(count44Before).toBe(0);
  });

  it('spacing is responsive: compact on mobile (6-8px), larger on iPad (12px+)', () => {
    const cssPath = path.resolve('public/css/views.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const beforeMedia = css.split('@media (min-width: 768px)')[0];
    const afterMedia = css.split('@media (min-width: 768px)')[1] || '';
    // Mobile: prep checklist gap should be 6px
    expect(beforeMedia).toMatch(/\.prep-checklist[^}]*gap:\s*6px/);
    // iPad: gap should increase to 12px
    expect(afterMedia).toMatch(/\.prep-checklist[^}]*gap:\s*12px/);
    expect(afterMedia).toMatch(/gap:\s*12px/);
  });
});
