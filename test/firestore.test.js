import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('firestore.js — established collection (TDD)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports ESTABLISHED_COLLECTION and uses it for fetchAllRecipes without collectionKey', async () => {
    const mod = await import('../js/firestore.js');
    expect(mod.ESTABLISHED_COLLECTION).toBe('deafening-gnarly-dining');
    const fs = await import('node:fs');
    const src = fs.readFileSync('js/firestore.js', 'utf8');
    // fetchAllRecipes should reference ESTABLISHED_COLLECTION or the fallback key
    expect(src).toMatch(/ESTABLISHED_COLLECTION/);
    expect(src).toMatch(/fetchAllRecipes/);
    // Should not short-circuit on missing collectionKey to Local only with empty return
    expect(src).not.toMatch(/if \(!collectionKey\)\s*\{\s*if \(onStatus\) onStatus\('Local only'\)/);
  });

  it('fetchRecipe uses established collection and recipeId', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('js/firestore.js', 'utf8');
    expect(src).toMatch(/ESTABLISHED_COLLECTION/);
    expect(src).toMatch(/fetchRecipe/);
    expect(src).toMatch(/doc\(db, key, rid\)/);
  });

  it('does not import loadStoredCollectionKey from storage', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('js/firestore.js', 'utf8');
    expect(src).not.toMatch(/loadStoredCollectionKey/);
    expect(src).not.toMatch(/RECIPES_COLLECTION/);
    expect(src).toMatch(/ESTABLISHED_COLLECTION/);
  });

  it('ensureSyncConfig does not prompt for collection key', async () => {
    const { ensureSyncConfig } = await import('../js/firestore.js');
    const result = await ensureSyncConfig({ style: {}, innerHTML: '' });
    // Should resolve to established collection without prompting
    expect(result).toHaveProperty('collectionKey', 'deafening-gnarly-dining');
    expect(result).toHaveProperty('cloudSync', true);
  });
});
