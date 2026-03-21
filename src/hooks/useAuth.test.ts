import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';

// ── localStorage mock ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ── fetch mock helpers ───────────────────────────────────────────────────────

const mockFetch = (status: number, body: unknown) => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
};

const TOKEN_KEY = '2048-auth-token';

const fakeUserProfile = {
  id: 'user-1',
  username: 'testuser',
  createdAt: '2026-01-01T00:00:00.000Z',
  stats: { totalGames: 5, wins: 3, bestScore: 2048, totalScore: 5000, totalMoves: 200 },
};

const fakeGuestProfile = {
  id: 'guest-abc',
  username: 'Guest-1234',
  isGuest: true as const,
};

beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('useAuth', () => {
  it('initialises unauthenticated when no token exists', async () => {
    mockFetch(200, fakeUserProfile);
    const { result } = renderHook(() => useAuth());

    // isLoading starts true, but since no token, resolves quickly
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    // fetch should NOT have been called (no token)
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('restores session when valid token exists', async () => {
    localStorageMock.setItem(TOKEN_KEY, 'valid-jwt');
    mockFetch(200, fakeUserProfile);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(fakeUserProfile);
  });

  it('clears token and sets user null on 401 during session restore', async () => {
    localStorageMock.setItem(TOKEN_KEY, 'expired-jwt');
    mockFetch(401, { code: 'UNAUTHORIZED', message: 'Token expired' });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorageMock.getItem(TOKEN_KEY)).toBeNull();
  });

  it('login success sets user and stores token', async () => {
    // First call: /api/v1/me (no token, skipped). Then login call.
    mockFetch(200, { token: 'new-jwt', user: fakeUserProfile });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('testuser', 'password123');
    });

    expect(result.current.user).toEqual(fakeUserProfile);
    expect(localStorageMock.getItem(TOKEN_KEY)).toBe('new-jwt');
  });

  it('login failure throws with API error message', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock a failed login
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' }),
    } as unknown as Response);

    await expect(
      act(async () => {
        await result.current.login('wronguser', 'wrongpass');
      })
    ).rejects.toThrow('Invalid username or password');

    expect(result.current.user).toBeNull();
    expect(localStorageMock.getItem(TOKEN_KEY)).toBeNull();
  });

  it('logout clears token and user', async () => {
    localStorageMock.setItem(TOKEN_KEY, 'some-jwt');
    mockFetch(200, fakeUserProfile);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(fakeUserProfile);

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(localStorageMock.getItem(TOKEN_KEY)).toBeNull();
  });

  it('guest login creates guest user', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ token: 'guest-jwt', user: fakeGuestProfile }),
    } as unknown as Response);

    await act(async () => {
      await result.current.loginAsGuest();
    });

    expect(result.current.user).toEqual(fakeGuestProfile);
    expect(localStorageMock.getItem(TOKEN_KEY)).toBe('guest-jwt');
  });

  it('register success sets user and stores token', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue({ token: 'reg-jwt', user: fakeUserProfile }),
    } as unknown as Response);

    await act(async () => {
      await result.current.register('testuser', 'password123');
    });

    expect(result.current.user).toEqual(fakeUserProfile);
    expect(localStorageMock.getItem(TOKEN_KEY)).toBe('reg-jwt');
  });

  it('upgradeGuest success updates user and token', async () => {
    localStorageMock.setItem(TOKEN_KEY, 'guest-jwt');
    // session restore returns guest
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(fakeGuestProfile),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ token: 'full-jwt', user: fakeUserProfile }),
      } as unknown as Response);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(fakeGuestProfile);

    await act(async () => {
      await result.current.upgradeGuest('testuser', 'password123');
    });

    expect(result.current.user).toEqual(fakeUserProfile);
    expect(localStorageMock.getItem(TOKEN_KEY)).toBe('full-jwt');
  });
});
