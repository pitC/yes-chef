import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('repository.js — generic, no Firestore direct, no hardcoding', () => {
  const repoSrc = readFileSync('public/js/repository.js', 'utf8');
  const firestoreShim = readFileSync('public/js/firestore.js', 'utf8');

  it('repository does not hardcode collection key and does not import firestore SDK', () => {
    expect(repoSrc).not.toMatch(/deafening-gnarly-dining/);
    // Should not import Firestore SDK directly — all via app server
    expect(repoSrc).not.toMatch(/from ['"]firebase\/firestore['"]/);
    expect(repoSrc).not.toMatch(/getFirestoreApi/);
    expect(repoSrc).not.toMatch(/RECIPES_COLLECTION/);
    // Should use storage for code and send as Bearer token
    expect(repoSrc).toMatch(/loadStoredCollectionKey/);
    expect(repoSrc).toMatch(/saveStoredCollectionKey/);
    expect(repoSrc).toMatch(/Authorization/);
    expect(repoSrc).toMatch(/Bearer/);
  });

  it('repository proxies via app server (APP_SERVER_URL + /api)', () => {
    expect(repoSrc).toMatch(/APP_SERVER_URL/);
    expect(repoSrc).toMatch(/app-config\.js/);
    expect(repoSrc).toMatch(/\/api\/recipes/);
    expect(repoSrc).toMatch(/fetch\(/);
  });

  it('repository exports generic API (no firestore hint)', () => {
    expect(repoSrc).toMatch(/fetchAllRecipes/);
    expect(repoSrc).toMatch(/fetchRecipe/);
    expect(repoSrc).toMatch(/ensureSyncConfig/);
    expect(repoSrc).not.toMatch(/getFirestoreApi/);
    expect(repoSrc).not.toMatch(/getFirestore/);
  });

  it('public/js/firestore.js is a shim re-exporting from repository (no direct Firestore)', () => {
    expect(firestoreShim).toMatch(/from ['"]\.\/repository\.js['"]/);
    expect(firestoreShim).not.toMatch(/getFirestoreApi/);
    expect(firestoreShim).not.toMatch(/deafening-gnarly-dining/);
  });

  it('public/js/data/recipes.js and js/bootstrap.js use repository, not firestore', () => {
    const recipesSrc = readFileSync('public/js/data/recipes.js', 'utf8');
    const bootstrapSrc = readFileSync('public/js/bootstrap.js', 'utf8');
    expect(recipesSrc).toMatch(/from ['"]\.\.\/repository\.js['"]/);
    expect(recipesSrc).not.toMatch(/from ['"]\.\.\/firestore\.js['"]/);
    expect(bootstrapSrc).toMatch(/from ['"]\.\/repository\.js['"]/);
    expect(bootstrapSrc).not.toMatch(/from ['"]\.\/firestore\.js['"]/);
  });

  it('app-config is generic and gitignored', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    expect(gitignore).toMatch(/app-config\.js/);
    const appConfigExample = readFileSync('public/js/app-config.example.js', 'utf8');
    expect(appConfigExample).toMatch(/APP_SERVER_URL/);
    expect(appConfigExample).not.toMatch(/deafening-gnarly-dining/);
  });
});
