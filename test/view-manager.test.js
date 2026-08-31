import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { viewManager } from '../js/views/view-manager.js';

describe('view manager', () => {
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('showView calls render(params) and returns cleanup', async () => {
    const render = vi.fn((params, container) => {
      const el = document.createElement('div');
      el.textContent = 'View 1';
      container.appendChild(el);
      return () => el.remove();
    });
    const destroy = vi.fn();

    viewManager.registerView('view1', { render, destroy });
    const cleanup = await viewManager.showView('view1', { param: 'test' });

    expect(render).toHaveBeenCalledWith({ param: 'test' }, container);
    expect(typeof cleanup).toBe('function');
  });

  it('switching views calls previous destroy', () => {
    const render1 = vi.fn(() => {
      const el = document.createElement('div');
      el.textContent = 'View 1';
      container.appendChild(el);
      return () => el.remove();
    });
    const destroy1 = vi.fn();
    const render2 = vi.fn(() => {
      const el = document.createElement('div');
      el.textContent = 'View 2';
      container.appendChild(el);
      return () => el.remove();
    });
    const destroy2 = vi.fn();
    
    viewManager.registerView('view1', { render: render1, destroy: destroy1 });
    viewManager.registerView('view2', { render: render2, destroy: destroy2 });
    
    viewManager.showView('view1', {});
    viewManager.showView('view2', {});
    
    expect(destroy1).toHaveBeenCalled();
    expect(render2).toHaveBeenCalled();
  });

  it('only one view mounted at a time', () => {
    const render1 = vi.fn(() => {
      const el = document.createElement('div');
      el.textContent = 'View 1';
      container.appendChild(el);
      return () => el.remove();
    });
    const render2 = vi.fn(() => {
      const el = document.createElement('div');
      el.textContent = 'View 2';
      container.appendChild(el);
      return () => el.remove();
    });
    
    viewManager.registerView('view1', { render: render1 });
    viewManager.registerView('view2', { render: render2 });
    
    viewManager.showView('view1', {});
    viewManager.showView('view2', {});
    
    expect(container.children.length).toBe(1);
    expect(container.textContent).toBe('View 2');
  });
});