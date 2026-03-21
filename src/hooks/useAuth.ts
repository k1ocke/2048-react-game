import { useState, useEffect, useCallback } from 'react';
import type { CurrentUser } from '../types/multiplayer';
import { API_BASE } from '../utils/env';

const TOKEN_KEY = '2048-auth-token';

export interface UseAuthReturn {
  user: CurrentUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => void;
  upgradeGuest: (username: string, password: string) => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

const apiFetch = async (path: string, options?: RequestInit): Promise<Response> => {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  };
  return fetch(`${API_BASE}${path}`, { ...options, headers });
};

const handleApiError = async (res: Response): Promise<never> => {
  try {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? `Request failed with status ${res.status}`);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`Request failed with status ${res.status}`);
  }
};

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // On mount, restore session from stored token
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    apiFetch('/api/v1/me')
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          clearToken();
          setTokenState(null);
          setUser(null);
          return;
        }
        if (!res.ok) {
          clearToken();
          setTokenState(null);
          setUser(null);
          return;
        }
        const data = (await res.json()) as CurrentUser;
        setUser(data);
      })
      .catch(() => {
        if (!cancelled) {
          clearToken();
          setTokenState(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // React 19 (used here) auto-batches all state updates — including those inside async/await and
  // setTimeout — so the multiple setTokenState/setUser calls below are already batched into a
  // single re-render with no extra work needed (no unstable_batchedUpdates required).
  const login = useCallback(async (username: string, password: string): Promise<void> => {
    const res = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      await handleApiError(res);
    }
    const data = (await res.json()) as { token: string; user: CurrentUser };
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (username: string, password: string): Promise<void> => {
    const res = await apiFetch('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      await handleApiError(res);
    }
    const data = (await res.json()) as { token: string; user: CurrentUser };
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }, []);

  const loginAsGuest = useCallback(async (): Promise<void> => {
    const res = await apiFetch('/api/v1/auth/guest', {
      method: 'POST',
    });
    if (!res.ok) {
      await handleApiError(res);
    }
    const data = (await res.json()) as { token: string; user: CurrentUser };
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback((): void => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const upgradeGuest = useCallback(async (username: string, password: string): Promise<void> => {
    const res = await apiFetch('/api/v1/auth/upgrade', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      await handleApiError(res);
    }
    const data = (await res.json()) as { token: string; user: CurrentUser };
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    const res = await apiFetch('/api/v1/me', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as CurrentUser;
      setUser(data);
    }
  }, []);

  const updateUsername = useCallback(async (username: string): Promise<void> => {
    const res = await apiFetch('/api/v1/me', {
      method: 'PATCH',
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      await handleApiError(res);
    }
    const data = (await res.json()) as CurrentUser;
    setUser(data);
  }, []);

  return { user, token, isLoading, login, register, loginAsGuest, logout, upgradeGuest, updateUsername, refreshUser };
};
