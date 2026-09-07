import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('firestore.rules (established collections)', () => {
  const rules = readFileSync('firestore.rules', 'utf8');

  it('allows read and write on deafening-gnarly-dining collection', () => {
    expect(rules).toMatch(/match \/deafening-gnarly-dining\/\{docId\}\s*\{[^}]*allow read, write: if true/s);
  });

  it('denies arbitrary collections via catch-all', () => {
    expect(rules).toMatch(/match \/\{other=\*\*\}\s*\{[^}]*allow read, write: if false/s);
  });

  it('does not contain blanket allow read: if true on {document=**}', () => {
    // Old rule was match /{document=**} { allow read: if true; allow write: if false; }
    // New rules should not have that unrestricted read
    expect(rules).not.toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read: if true;\s*allow write: if false;/);
  });

  it('contains established collections allowlist commentary', () => {
    expect(rules).toMatch(/deafening-gnarly-dining/);
  });
});
