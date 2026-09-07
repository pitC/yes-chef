import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase/app and firebase/firestore modular SDK before importing js/firebase.js
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn((config) => ({ name: '[DEFAULT]', config, options: config })),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ _mockDb: true })),
  doc: vi.fn(),
  collection: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

describe('firebase modular init (TDD)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports app initialized via initializeApp with firebaseConfig', async () => {
    const { app } = await import('../js/firebase.js');
    const { initializeApp } = await import('firebase/app');
    expect(initializeApp).toHaveBeenCalledTimes(1);
    const cfg = initializeApp.mock.calls[0][0];
    expect(cfg.projectId).toBe('yes-chef-cookbook');
    expect(cfg.authDomain).toBe('yes-chef-cookbook.firebaseapp.com');
    expect(cfg.storageBucket).toBe('yes-chef-cookbook.firebasestorage.app');
    expect(cfg.messagingSenderId).toBe('158345618336');
    expect(cfg.appId).toBe('1:158345618336:web:5846633ae0d4d529c13ac5');
    // apiKey should come from firebase-config, not be undefined
    expect(typeof cfg.apiKey).toBe('string');
    expect(cfg.apiKey.length).toBeGreaterThan(10);
    expect(app).toBeDefined();
    expect(app.config.projectId).toBe('yes-chef-cookbook');
  });

  it('exports db via getFirestore(app) and getFirestoreApi shape', async () => {
    const { db, getFirestoreApi } = await import('../js/firebase.js');
    const { getFirestore } = await import('firebase/firestore');
    expect(getFirestore).toHaveBeenCalled();
    expect(db).toBeDefined();
    expect(db._mockDb).toBe(true);

    const api = await getFirestoreApi();
    expect(api.db).toBeDefined();
    expect(typeof api.doc).toBe('function');
    expect(typeof api.collection).toBe('function');
    expect(typeof api.getDoc).toBe('function');
    expect(typeof api.getDocs).toBe('function');
  });

  it('does not contain hard-coded apiKey literal in js/firebase.js source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('js/firebase.js', 'utf8');
    // js/firebase.js should import from firebase-config, not embed AIza...
    expect(src).not.toMatch(/AIzaSyD_jSlv9np8EJvgVebvHLxGO-St68ZOwGY/);
    expect(src).toMatch(/from ['"]\.\/firebase-config\.js['"]/);
    expect(src).toMatch(/from ['"]firebase\/app['"]/);
  });

  it('firebase-config is generated and gitignored (not committed with real key)', async () => {
    const fs = await import('node:fs');
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    expect(gitignore).toMatch(/firebase-config\.js/);
    // example config exists
    const exampleExists = fs.existsSync('js/firebase-config.example.js');
    expect(exampleExists).toBe(true);
  });
});
