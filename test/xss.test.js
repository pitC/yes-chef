import { describe, it, expect } from 'vitest';
import { escapeHtml, safeHttpUrl, highlightSafe } from '../public/js/utils/escape.js';
import { renderRecipeCard } from '../public/js/components/recipe-card.js';

describe('xss escaping', () => {
  it('escapeHtml neutralizes markup', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('"\'&<>')).toBe('&quot;&#39;&amp;&lt;&gt;');
  });

  it('safeHttpUrl rejects javascript: and allows http(s)', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<h1>x</h1>')).toBeNull();
    expect(safeHttpUrl('https://example.com/a?b=c')).toContain('https://example.com/');
    expect(safeHttpUrl('/relative')).toContain('http://localhost');
  });

  it('highlightSafe escapes before highlighting', () => {
    const out = highlightSafe('<script>alert(1)</script> [salt]');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<span class="ingredient-highlight">salt</span>');
  });

  it('recipe card does not inject script', () => {
    const container = document.createElement('div');
    renderRecipeCard(
      {
        title: '<img src=x onerror=window.__xss=1>',
        timing: { totalMinutes: 10 },
        tags: ['"><svg onload=window.__xss=2>'],
      },
      container,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.innerHTML).toContain('&lt;img');
  });
});
