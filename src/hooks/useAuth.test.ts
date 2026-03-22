import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';

// ── fetch mock helpers ───────────────────────────────────────────────────────

const mockFetch = (status: number, body: unknown) => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
};

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
  jest.clearAllMocks();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('useAuth', () => {
  it('restores session when valid cookie exists (200 from /me)', async () => {
    mockFetch(200, fakeUserProfile);
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(fakeUserProfile);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/me'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('sets user null when /me returns 401 (no valid cookie)', async () => {
    mockFetch(401, { code: 'UNAUTHORIZED', message: 'Token expired' });
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('login success sets user (cookie set by server)', async () => {
    // session restore: 401 (no cookie yet)
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn().mockResolvedValue({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ user: fakeUserProfile }) } as unknown as Response);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('testuser', 'password123');
    });

    expect(result.current.user).toEqual(fakeUserProfile);
  });

  it('login sends credentials: include', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn().mockResolvedValue({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ user: fakeUserProfile }) } as unknown as Response);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('testuser', 'pass');
    });

    const calls = (globalThis.fetch as jest.Mock).mock.calls as [string, RequestInit][];
    const loginCall = calls.find(([url]) => (url as string).includes('/auth/login'));
    expect(loginCall).toBeDefined();
    expect(loginCall![1].credentials).toBe('include');
  });

  it('login failure throws with API error message', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn().mockResolvedValue({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn().mockResolvedValue({ message: 'Invalid username or password' }) } as unknown as Response);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('wronguser', 'wrongpass');
      })
    ).rejects.toThrow('Invalid username or password');

    expect(result.current.user).toBeNull();
  });

  it('logout clears user and calls POST /auth/logout', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue(fakeUserProfile) } as unknown as Response)
      .mockResolvedValue({ ok: true, status: 204, json: jest.fn().mockResolvedValue(null) } as unknown as Response);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(fakeUserProfile);

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();

    // Logout call fires (fire-and-forget)
    await waitFor(() => {
      const calls = (globalThis.fetch as jest.Mock).mock.calls as [string, RequestInit][];
      const logoutCall = calls.find(([url]) => (url as string).includes('/auth/logout'));
      expect(logoutCall).toBeDefined();
      expect(logoutCall![1].method).toBe('POST');
    });
  });

  it('guest login creates guest user', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn().mockResolvedValue({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 201, json: jest.fn().mockResolvedValue({ user: fakeGuestProfile }) } as unknown as Response);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginAsGuest();
    });

    expect(result.current.user).toEqual(fakeGuestProfile);
  });

  it('register success sets user', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn().mockResolvedValue({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 201, json: jest.fn().mockResolvedValue({ user: fakeUserProfile }) } as unknown as Response);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register('testuser', 'password123');
    });

    expect(result.current.user).toEqual(fakeUserProfile);
  });

  it('upgradeGuest success updates user', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue(fakeGuestProfile) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ user: fakeUserProfile }) } as unknown as Response);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(fakeGuestProfile);

    await act(async () => {
      await result.current.upgradeGuest('testuser', 'password123');
    });

    expect(result.current.user).toEqual(fakeUserProfile);
  });
});
