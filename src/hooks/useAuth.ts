import { useState, useEffect, useCallback } from 'react';
import type { CurrentUser } from '../types/multiplayer';
import { API_BASE } from '../utils/env';

export interface UseAuthReturn {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => void;
  upgradeGuest: (username: string, password: string) => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const apiFetch = async (path: string, options?: RequestInit): Promise<Response> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
    ...(options?.headers ?? {}),
  };
  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
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
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // On mount, restore session from httpOnly cookie (server validates it)
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/me')
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = (await res.json()) as CurrentUser;
        setUser(data);
      })
      .catch((err: unknown) => {
        // Network errors — leave user as null; cookie still valid for next request
        if (!cancelled) {
          console.error('Session restore failed (network error):', err);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    const res = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      await handleApiError(res);
    }
    const data = (await res.json()) as { user: CurrentUser };
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
    const data = (await res.json()) as { user: CurrentUser };
    setUser(data.user);
  }, []);

  const loginAsGuest = useCallback(async (): Promise<void> => {
    const res = await apiFetch('/api/v1/auth/guest', {
      method: 'POST',
    });
    if (!res.ok) {
      await handleApiError(res);
    }
    const data = (await res.json()) as { user: CurrentUser };
    setUser(data.user);
  }, []);

  const logout = useCallback((): void => {
    // Fire-and-forget: revoke the token server-side (clears httpOnly cookie)
    apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => { /* silent */ });
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
    const data = (await res.json()) as { user: CurrentUser };
    setUser(data.user);
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
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

  return { user, isLoading, login, register, loginAsGuest, logout, upgradeGuest, updateUsername, refreshUser };
};
