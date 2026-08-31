import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderEmptyState, renderErrorState } from '../js/views/empty-states.js';

describe('empty states', () => {
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders empty state with icon, title, text, action', () => {
    renderEmptyState({
      icon: '📭',
      title: 'No recipes',
      text: 'No recipes found matching your search.',
      action: { label: 'Clear filters', onClick: () => {} }
    }, container);
    
    expect(container.textContent).toContain('📭');
    expect(container.textContent).toContain('No recipes');
    expect(container.textContent).toContain('No recipes found');
    expect(container.textContent).toContain('Clear filters');
  });

  it('renders error state with message and retry', () => {
    const retry = vi.fn();
    renderErrorState({
      message: 'Failed to load recipes',
      retry
    }, container);
    
    expect(container.textContent).toContain('Failed to load recipes');
    expect(container.textContent).toContain('Retry');
    
    const retryBtn = container.querySelector('button');
    retryBtn.click();
    expect(retry).toHaveBeenCalled();
  });
});