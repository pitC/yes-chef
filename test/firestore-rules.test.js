import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('firestore.rules — server-identity gate, deny-all fallback', () => {
  const rules = readFileSync('firestore.rules', 'utf8');

  it('does not hardcode collection key', () => {
    expect(rules).not.toMatch(/deafening-gnarly-dining/);
  });

  it('gates collection access on the server service-user claim', () => {
    expect(rules).toMatch(/match \/\{collection\}\/\{docId\}/);
    expect(rules).toMatch(/isWebServer\(\)/);
    expect(rules).toMatch(/request\.auth\.token\.isServer == true/);
  });

  it('keeps the metadata-establishment check for collections', () => {
    expect(rules).toMatch(/\/metadata\)/);
  });

  it('gates config access on the server identity (not world-readable)', () => {
    expect(rules).toMatch(/match \/config\/\{docId\}/);
    expect(rules).toMatch(/allow read, write: if isWebServer\(\);/);
  });

  it('never allows bare authenticated access (no `request.auth != null` alone)', () => {
    for (const line of rules.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('allow ')) {
        expect(trimmed).not.toBe('allow read, write: if request.auth != null;');
        expect(trimmed).not.toBe('allow read: if request.auth != null;');
      }
    }
  });

  it('does not contain blanket allow read: if true', () => {
    expect(rules).not.toMatch(/allow read:\s*if true/);
  });

  it('has fallback deny for {other=**}', () => {
    expect(rules).toMatch(/match \/\{other=\*\*\}/);
  });
});
