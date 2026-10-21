import { describe, it, expect, vi } from 'vitest';
import { api, ApiError, getToken, onUnauthorized, setToken } from './api';
import { mockFetch } from './test-utils';

describe('api client', () => {
  it('sends the bearer token once logged in', async () => {
    setToken('tok');
    const fetch = mockFetch((method, path) => {
      expect(method).toBe('GET');
      expect(path).toBe('/api/quotations');
      return [];
    });
    await api.quotations();
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('clears the token and notifies on 401', async () => {
    setToken('expired');
    const handler = vi.fn();
    onUnauthorized(handler);
    mockFetch(() => ({ status: 401, body: { message: 'Invalid or expired token' } }));
    await expect(api.facets()).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    onUnauthorized(null);
  });

  it('encodes catalog ids with # in paths', async () => {
    mockFetch((_m, path) => {
      expect(path).toBe('/api/catalog/TM1643-06%2310/similar?limit=3');
      return [];
    });
    await api.similar('TM1643-06#10', 3);
  });
});
