import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveStoredCollectionKey, removeStoredCollectionKey, loadStoredCollectionKey } from '../public/js/storage.js';

function createMockStorage() {
  const store = Object.create(null);
  return {
    getItem(k) { return store[k] ?? null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
    get store() { return store; },
  };
}

function installMockStorage() {
  const mockLocal = createMockStorage();
  const mockSession = createMockStorage();
  // storage.js checks window.localStorage, then global localStorage, then globalThis
  if (typeof window !== 'undefined') {
    try { Object.defineProperty(window, 'localStorage', { value: mockLocal, configurable: true, writable: true }); } catch (_e) { void _e; window.localStorage = mockLocal; }
    try { Object.defineProperty(window, 'sessionStorage', { value: mockSession, configurable: true, writable: true }); } catch (_e) { void _e; window.sessionStorage = mockSession; }
  }
  try { globalThis.localStorage = mockLocal; } catch (_e) { void _e; }
  try { globalThis.sessionStorage = mockSession; } catch (_e) { void _e; }
  try { global.localStorage = mockLocal; } catch (_e) { void _e; }
  try { global.sessionStorage = mockSession; } catch (_e) { void _e; }
  return { mockLocal, mockSession };
}

describe('invalid cookbook code — should not fallback to default recipe', () => {
  let storages;
  beforeEach(() => {
    storages = installMockStorage();
    storages.mockLocal.clear();
    storages.mockSession.clear();
  });

  afterEach(() => {
    storages.mockLocal.clear();
    storages.mockSession.clear();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('storage: removeStoredCollectionKey clears active key (not just list)', async () => {
    saveStoredCollectionKey('wrong-code');
    expect(loadStoredCollectionKey()).toBe('wrong-code');
    expect(JSON.parse(storages.mockLocal.getItem('yesChefFirestoreCollections'))).toContain('wrong-code');

    removeStoredCollectionKey('wrong-code');

    // Old bug: active key remained, cause silent fallback on next load
    expect(loadStoredCollectionKey()).toBeNull();
    expect(storages.mockLocal.getItem('yesChefFirestoreCollection')).toBeNull();
    expect(JSON.parse(storages.mockLocal.getItem('yesChefFirestoreCollections') || '[]')).not.toContain('wrong-code');
  });

  it('repository: fetchAllRecipes throws on 401 and clears stored code (not return [])', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    // reinstall mock after resetModules (which may clear)
    const { mockLocal } = installMockStorage();
    mockLocal.setItem('yesChefFirestoreCollection', 'wrong-code');
    mockLocal.setItem('yesChefFirestoreCollections', JSON.stringify(['wrong-code']));

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid cookbook code' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { fetchAllRecipes } = await import('../public/js/repository.js?invalid1');

    await expect(fetchAllRecipes({})).rejects.toThrow(/Invalid cookbook code/);
    expect(mockLocal.getItem('yesChefFirestoreCollection')).toBeNull();
    expect(fetchMock).toHaveBeenCalled();

    globalThis.fetch = origFetch;
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('repository: fetchRecipe throws on 401 (not return null)', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    const { mockLocal } = installMockStorage();
    mockLocal.setItem('yesChefFirestoreCollection', 'wrong-code');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid cookbook code' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { fetchRecipe } = await import('../public/js/repository.js?invalid2');

    await expect(fetchRecipe({ recipeId: 'menemen' })).rejects.toThrow(/Invalid cookbook code/);
    expect(mockLocal.getItem('yesChefFirestoreCollection')).toBeNull();

    globalThis.fetch = origFetch;
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('data/recipes: getRecipes propagates Invalid instead of falling back to menemen', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    const { mockLocal } = installMockStorage();
    mockLocal.setItem('yesChefFirestoreCollection', 'wrong-code');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid cookbook code' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    const { getRecipes, _clearCache } = await import('../public/js/data/recipes.js?invalidRecipes');
    _clearCache();

    await expect(getRecipes()).rejects.toThrow(/Invalid cookbook code/);

    _clearCache();
    globalThis.fetch = origFetch;
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('browse view: renders Invalid-code error-state instead of default recipe cards', async () => {
    installMockStorage();
    const dataMod = await import('../public/js/data/recipes.js');
    vi.spyOn(dataMod, 'getRecipes').mockRejectedValue(new Error('Invalid cookbook code — please re-enter'));

    const { renderBrowseView } = await import('../public/js/views/browse.js');
    const container = document.createElement('div');
    document.body.appendChild(container);

    await renderBrowseView({}, container);

    expect(container.innerHTML).toContain('Invalid cookbook code');
    expect(container.innerHTML).toContain('Re-enter code');
    expect(container.querySelectorAll('.recipe-card').length).toBe(0);
    expect(container.querySelector('#retry-code')).toBeTruthy();
    expect(container.querySelector('#use-local')).toBeTruthy();

    document.body.removeChild(container);
  });

  it('detail view: propagates Invalid instead of showing Recipe not found or menemen', async () => {
    vi.resetModules();
    installMockStorage();
    const dataMod = await import('../public/js/data/recipes.js');
    vi.spyOn(dataMod, 'getRecipe').mockRejectedValue(new Error('Invalid cookbook code — please re-enter'));

    const { renderDetailView } = await import('../public/js/views/detail.js?invalid4');
    const container = document.createElement('div');
    document.body.appendChild(container);

    await renderDetailView({ id: 'menemen' }, container);

    expect(container.innerHTML).toContain('Invalid cookbook code');
    expect(container.querySelector('#retry-code')).toBeTruthy();

    document.body.removeChild(container);
  });
});
