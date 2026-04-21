import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Token store logic extracted for isolated testing.
// This mirrors the implementation in server.ts exactly.
// ---------------------------------------------------------------------------
function makeTokenStore(ttlMs: number) {
  const store: Record<string, { value: unknown; expiresAt: number }> = {};

  const storeToken = (key: string, value: unknown) => {
    store[key] = { value, expiresAt: Date.now() + ttlMs };
  };

  const getToken = (key: string): unknown | null => {
    const entry = store[key];
    if (!entry || Date.now() > entry.expiresAt) {
      delete store[key];
      return null;
    }
    return entry.value;
  };

  const deleteToken = (key: string) => {
    delete store[key];
  };

  const size = () => Object.keys(store).length;

  return { storeToken, getToken, deleteToken, size };
}

describe('Token store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves a token', () => {
    const { storeToken, getToken } = makeTokenStore(600_000);
    storeToken('abc', { access_token: 'tok_123' });
    expect(getToken('abc')).toEqual({ access_token: 'tok_123' });
  });

  it('returns null for unknown keys', () => {
    const { getToken } = makeTokenStore(600_000);
    expect(getToken('nonexistent')).toBeNull();
  });

  it('returns null after TTL expires', () => {
    const { storeToken, getToken } = makeTokenStore(1_000);
    storeToken('key1', 'value');
    vi.advanceTimersByTime(1_001);
    expect(getToken('key1')).toBeNull();
  });

  it('still returns token just before TTL', () => {
    const { storeToken, getToken } = makeTokenStore(1_000);
    storeToken('key1', 'value');
    vi.advanceTimersByTime(999);
    expect(getToken('key1')).toBe('value');
  });

  it('cleans up expired entry on access', () => {
    const { storeToken, getToken, size } = makeTokenStore(500);
    storeToken('stale', 'old');
    vi.advanceTimersByTime(501);
    getToken('stale'); // triggers cleanup
    expect(size()).toBe(0);
  });

  it('deletes a token on explicit removal', () => {
    const { storeToken, getToken, deleteToken } = makeTokenStore(60_000);
    storeToken('tok', 'data');
    deleteToken('tok');
    expect(getToken('tok')).toBeNull();
  });

  it('handles concurrent keys independently', () => {
    const { storeToken, getToken } = makeTokenStore(2_000);
    storeToken('short', 'a');
    storeToken('long', 'b');
    vi.advanceTimersByTime(2_001);
    expect(getToken('short')).toBeNull();
    expect(getToken('long')).toBeNull();
  });

  it('stores uri_ prefixed redirect URI keys separately from token keys', () => {
    const { storeToken, getToken } = makeTokenStore(60_000);
    const stateId = 'xk3f9';
    storeToken(`uri_${stateId}`, 'https://app.example.com/auth/callback');
    storeToken(stateId, { access_token: 'tok' });
    expect(getToken(`uri_${stateId}`)).toBe('https://app.example.com/auth/callback');
    expect(getToken(stateId)).toEqual({ access_token: 'tok' });
  });
});
