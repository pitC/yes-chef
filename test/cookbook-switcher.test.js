import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveStoredCollectionKey,
  getCookbookMeta,
  saveCookbookMeta,
  loadCookbookMetaMap,
  COOKBOOK_META_KEY,
} from '../public/js/storage.js';
import { getCookbookName, getCookbookNote } from '../public/js/repository.js';

vi.mock('../public/js/router.js', () => ({
  navigate: vi.fn(),
  router: {
    currentRoute: { value: { path: '/', params: {} } },
    on: vi.fn(),
    start: vi.fn(),
    navigate: vi.fn(),
  },
}));

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

describe('cookbook metadata cache (storage)', () => {
  let storages;
  beforeEach(() => {
    storages = installMockStorage();
    storages.mockLocal.clear();
  });
  afterEach(() => {
    storages.mockLocal.clear();
    vi.restoreAllMocks();
  });

  it('saves and loads meta per code', () => {
    saveCookbookMeta('code-a', { name: 'Family', note: 'Shared' });
    expect(getCookbookMeta('code-a')).toEqual({ name: 'Family', note: 'Shared' });
    expect(loadCookbookMetaMap()['code-a']).toEqual({ name: 'Family', note: 'Shared' });
  });

  it('isolates meta per code', () => {
    saveCookbookMeta('code-a', { name: 'A' });
    saveCookbookMeta('code-b', { name: 'B', note: 'Second' });
    expect(getCookbookMeta('code-a')).toEqual({ name: 'A' });
    expect(getCookbookMeta('code-b')).toEqual({ name: 'B', note: 'Second' });
  });

  it('returns null for unknown code and ignores invalid writes', () => {
    expect(getCookbookMeta('missing')).toBeNull();
    saveCookbookMeta('code-a', null);
    expect(getCookbookMeta('code-a')).toBeNull();
    expect(storages.mockLocal.getItem(COOKBOOK_META_KEY)).toBeNull();
  });
});

describe('cookbook name/note helpers', () => {
  it('prefers name, falls back to title', () => {
    expect(getCookbookName({ name: 'Family' })).toBe('Family');
    expect(getCookbookName({ title: 'Titled' })).toBe('Titled');
    expect(getCookbookName({})).toBeNull();
    expect(getCookbookName(null)).toBeNull();
  });

  it('prefers note, falls back to description', () => {
    expect(getCookbookNote({ note: 'Shared' })).toBe('Shared');
    expect(getCookbookNote({ description: 'Desc' })).toBe('Desc');
    expect(getCookbookNote({})).toBeNull();
  });
});

describe('fetchMetadataForKey caches metadata (production mode)', () => {
  let storages;
  beforeEach(() => {
    storages = installMockStorage();
    storages.mockLocal.clear();
  });
  afterEach(() => {
    storages.mockLocal.clear();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('fetches /api/metadata with Bearer and caches result', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    installMockStorage();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'Family', note: 'Shared' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { fetchMetadataForKey } = await import('../public/js/repository.js?cookbookMeta1');
    const meta = await fetchMetadataForKey('code-a');
    expect(meta).toEqual({ name: 'Family', note: 'Shared' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/metadata'),
      expect.objectContaining({ headers: { Authorization: 'Bearer code-a' } }),
    );
    const { getCookbookMeta: getMeta } = await import('../public/js/storage.js?cookbookMeta1');
    expect(getMeta('code-a')).toEqual({ name: 'Family', note: 'Shared' });

    globalThis.fetch = origFetch;
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('returns null on non-ok without caching', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    installMockStorage();
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { fetchMetadataForKey } = await import('../public/js/repository.js?cookbookMeta2');
    expect(await fetchMetadataForKey('bad-code')).toBeNull();

    globalThis.fetch = origFetch;
    vi.stubEnv('NODE_ENV', 'test');
  });
});

describe('cookbook switcher component', () => {
  let storages;
  beforeEach(() => {
    storages = installMockStorage();
    storages.mockLocal.clear();
    storages.mockSession.clear();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    storages.mockLocal.clear();
    vi.restoreAllMocks();
  });

  it('header trigger shows cached cookbook name, falls back to Yes Chef', async () => {
    const { attachCookbookSwitcher } = await import('../public/js/components/cookbook-switcher.js');
    saveStoredCollectionKey('code-a');
    saveCookbookMeta('code-a', { name: 'Family Book', note: 'Shared' });

    const title = document.createElement('h1');
    title.textContent = 'Yes Chef';
    document.body.appendChild(title);
    const detach = attachCookbookSwitcher(title);
    expect(title.textContent).toBe('Family Book');
    expect(title.getAttribute('role')).toBe('button');
    detach();

    storages.mockLocal.clear();
    const plain = document.createElement('h1');
    plain.textContent = 'Yes Chef';
    document.body.appendChild(plain);
    const detach2 = attachCookbookSwitcher(plain);
    expect(plain.textContent).toBe('Yes Chef');
    detach2();
  });

  it('dialog lists known cookbooks with name, code and note; switch calls back', async () => {
    const { attachCookbookSwitcher } = await import('../public/js/components/cookbook-switcher.js?dialog1');
    saveStoredCollectionKey('code-b');
    saveStoredCollectionKey('code-a');
    saveCookbookMeta('code-a', { name: 'Family Book', note: 'Shared notes' });
    saveCookbookMeta('code-b', { name: 'Second Book', note: 'Other notes' });

    const onSwitch = vi.fn();
    const title = document.createElement('h1');
    document.body.appendChild(title);
    const detach = attachCookbookSwitcher(title, { onSwitch });
    title.click();

    const overlay = document.querySelector('.cookbook-switcher__overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.textContent).toContain('Family Book');
    expect(overlay.textContent).toContain('code-a');
    expect(overlay.textContent).toContain('Shared notes');
    expect(overlay.textContent).toContain('Second Book');
    expect(overlay.textContent).toContain('code-b');
    expect(overlay.textContent).toContain('Other notes');

    const items = overlay.querySelectorAll('.cookbook-switcher__item');
    expect(items.length).toBe(2);

    const inactiveItem = Array.from(items).find((li) => li.dataset.code === 'code-b');
    inactiveItem.querySelector('.cookbook-switcher__switch').click();
    expect(onSwitch).toHaveBeenCalledWith('code-b');
    expect(document.querySelector('.cookbook-switcher__overlay')).toBeNull();
    detach();
  });

  it('add-new flow validates and switches (test env short-circuit)', async () => {
    const { openSwitcherDialog } = await import('../public/js/components/cookbook-switcher.js?dialog2');
    const onSwitch = vi.fn();
    const { close } = openSwitcherDialog({ onSwitchRequest: onSwitch });

    const input = document.querySelector('.cookbook-switcher__input');
    const saveBtn = document.querySelector('.cookbook-switcher__save');
    input.value = 'brand-new-code';
    saveBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(onSwitch).toHaveBeenCalledWith('brand-new-code');
    expect(document.querySelector('.cookbook-switcher__overlay')).toBeNull();
    close();
  });
});

describe('browse header shows cookbook name', () => {
  let storages;
  beforeEach(() => {
    storages = installMockStorage();
    storages.mockLocal.clear();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    storages.mockLocal.clear();
    vi.restoreAllMocks();
  });

  it('renders cookbook name in header instead of generic Yes Chef', async () => {
    saveStoredCollectionKey('code-a');
    saveCookbookMeta('code-a', { name: 'Family Book' });
    const { renderBrowseView } = await import('../public/js/views/browse.js?cookbookHeader');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const cleanup = await renderBrowseView({}, container);
    expect(container.querySelector('.app-header__title').textContent).toBe('Family Book');
    if (typeof cleanup === 'function') cleanup();
  });
});
