import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects others', () => {
    const h = hashPassword('somec2026');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('somec2026', h)).toBe(true);
    expect(verifyPassword('somec2027', h)).toBe(false);
    expect(verifyPassword('somec2026', 'garbage')).toBe(false);
    expect(hashPassword('somec2026')).not.toBe(h); // salted
  });
  it('refuses short passwords', () => {
    expect(() => hashPassword('abc')).toThrow();
  });
});
