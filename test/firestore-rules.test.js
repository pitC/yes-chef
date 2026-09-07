import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('firestore.rules — all through app server, no hardcoding', () => {
  const rules = readFileSync('firestore.rules', 'utf8');

  it('does not hardcode collection key', () => {
    expect(rules).not.toMatch(/deafening-gnarly-dining/);
  });

  it('denies direct client reads/writes on any collection (all via app server)', () => {
    expect(rules).toMatch(/match \/\{collection\}\/\{docId\}/);
    expect(rules).toMatch(/allow read, write: if false/);
  });

  it('denies config reads/writes via client (all via app server)', () => {
    expect(rules).toMatch(/match \/config\/\{docId\}/);
    expect(rules).toMatch(/allow read, write: if false/);
  });

  it('does not contain blanket allow read: if true on {document=**}', () => {
    expect(rules).not.toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read: if true;\s*allow write: if false;/);
  });

  it('has fallback deny for {other=**}', () => {
    expect(rules).toMatch(/match \/\{other=\*\*\}/);
  });
});
