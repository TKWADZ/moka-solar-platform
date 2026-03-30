'use client';

import { SessionPayload, UserRole } from '@/types';

const SESSION_KEY = 'moka_solar_session';

function getAvailableStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidates = [window.localStorage, window.sessionStorage];

  for (const storage of candidates) {
    try {
      const probeKey = `${SESSION_KEY}_probe`;
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      return storage;
    } catch {
      // Try the next storage implementation.
    }
  }

  return null;
}

export function saveSession(session: SessionPayload) {
  const storage = getAvailableStorage();

  if (!storage) {
    throw new Error(
      'Trình duyệt hiện không cho phép lưu phiên đăng nhập. Vui lòng mở bằng trình duyệt thông thường thay vì tab riêng tư hoặc webview bị giới hạn.',
    );
  }

  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): SessionPayload | null {
  const storage = getAvailableStorage();

  if (!storage) {
    return null;
  }

  const raw = storage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionPayload;
  } catch {
    storage.removeItem(SESSION_KEY);
    return null;
  }
}

export function getAccessToken() {
  return getSession()?.accessToken || '';
}

export function hasRole(session: SessionPayload | null, allowedRoles: UserRole[]) {
  return session ? allowedRoles.includes(session.user.role) : false;
}

export function getDefaultRouteForRole(role?: UserRole | null) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'STAFF') {
    return '/admin';
  }

  if (role === 'CUSTOMER') {
    return '/portal';
  }

  return '/login';
}

export function clearSession() {
  if (typeof window === 'undefined') {
    return;
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage.removeItem(SESSION_KEY);
    } catch {
      // Ignore storage access errors while clearing the session.
    }
  }
}

export function logout() {
  clearSession();
  window.location.href = '/login';
}
