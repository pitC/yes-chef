import { describe, it, expect, beforeEach, vi } from 'vitest';
import { router, navigate } from '../js/router.js';

describe('router', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
  });

  it('navigation updates currentRoute signal', () => {
    const callback = vi.fn();
    router.on('route', callback);
    
    navigate('/recipe/menemen');
    
    expect(callback).toHaveBeenCalled();
    expect(router.currentRoute.value).toMatchObject({
      path: '/recipe/menemen',
      params: { id: 'menemen' },
    });
  });

  it('extracts params from route', () => {
    navigate('/recipe/menemen');
    expect(router.currentRoute.value.params).toEqual({ id: 'menemen' });
  });

  it('redirects unknown route to /', () => {
    navigate('/unknown');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('handles browse route', () => {
    navigate('/');
    expect(router.currentRoute.value.path).toBe('/');
    expect(router.currentRoute.value.params).toEqual({});
  });

  it('handles cooking route', () => {
    navigate('/cook/menemen');
    expect(router.currentRoute.value.path).toBe('/cook/menemen');
    expect(router.currentRoute.value.params).toEqual({ id: 'menemen' });
  });
});