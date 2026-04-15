'use client';

import { PermissionCode, SessionPayload, UserRole } from '@/types';

const SESSION_KEY = 'moka_solar_session';
export const AUTH_SESSION_CHANGED_EVENT = 'moka-auth-session-changed';

export type AuthSessionChangeReason =
  | 'saved'
  | 'cleared'
  | 'logout'
  | 'expired'
  | 'forbidden';

export type AuthSessionChangeDetail = {
  reason: AuthSessionChangeReason;
  session: SessionPayload | null;
};

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

function emitSessionChange(detail: AuthSessionChangeDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AuthSessionChangeDetail>(AUTH_SESSION_CHANGED_EVENT, {
      detail,
    }),
  );
}

export function saveSession(session: SessionPayload) {
  const storage = getAvailableStorage();

  if (!storage) {
    throw new Error(
      'Trình duyệt hiện không cho phép lưu phiên đăng nhập. Vui lòng mở bằng trình duyệt thông thường thay vì tab riêng tư hoặc webview bị giới hạn.',
    );
  }

  storage.setItem(SESSION_KEY, JSON.stringify(session));
  emitSessionChange({
    reason: 'saved',
    session,
  });
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

export function getRefreshToken() {
  return getSession()?.refreshToken || '';
}

export function hasRole(session: SessionPayload | null, allowedRoles: UserRole[]) {
  return session ? allowedRoles.includes(session.user.role) : false;
}

export function hasPermission(
  session: SessionPayload | null,
  permission: PermissionCode | PermissionCode[],
) {
  if (!session) {
    return false;
  }

  const currentPermissions = new Set(session.user.permissions || []);
  const requiredPermissions = Array.isArray(permission) ? permission : [permission];
  return requiredPermissions.every((item) => currentPermissions.has(item));
}

export function hasAnyPermission(
  session: SessionPayload | null,
  permissions: PermissionCode[],
) {
  if (!session) {
    return false;
  }

  const currentPermissions = new Set(session.user.permissions || []);
  return permissions.some((permission) => currentPermissions.has(permission));
}

export function getDefaultRouteForRole(role?: UserRole | null) {
  if (
    role === 'SUPER_ADMIN' ||
    role === 'ADMIN' ||
    role === 'MANAGER' ||
    role === 'STAFF'
  ) {
    return '/admin';
  }

  if (role === 'CUSTOMER') {
    return '/portal';
  }

  return '/login';
}

export function clearSession(reason: AuthSessionChangeReason = 'cleared') {
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

  emitSessionChange({
    reason,
    session: null,
  });
}

export function expireSession(reason: 'expired' | 'forbidden' = 'expired') {
  clearSession(reason);
}

export function subscribeToSessionChange(
  listener: (detail: AuthSessionChangeDetail) => void,
) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<AuthSessionChangeDetail>;
    listener(customEvent.detail);
  };

  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handler as EventListener);

  return () => {
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handler as EventListener);
  };
}

export function logout() {
  clearSession('logout');
  window.location.href = '/login';
}
