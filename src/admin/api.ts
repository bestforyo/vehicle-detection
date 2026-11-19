export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3001/api/v1").replace(/\/+$/, "");
const REFRESH_KEY = "jianjian-admin-refresh";

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export type Workspace = {
  id: string;
  name: string;
  code: string;
  role: "INSPECTOR" | "ORG_ADMIN";
};

export type CurrentUser = {
  id: string;
  displayName: string;
  email: string | null;
  platformRole: "NONE" | "OPERATOR" | "SUPER_ADMIN";
  activeWorkspace: {
    tenantId: string;
    membershipId: string;
    role: "INSPECTOR" | "ORG_ADMIN";
  } | null;
  memberships: Array<{
    id: string;
    role: "INSPECTOR" | "ORG_ADMIN";
    tenant: { id: string; name: string; code: string };
  }>;
};

export type SignInResult = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  requiresWorkspaceSelection?: boolean;
  workspaces?: Workspace[];
};

function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = sessionStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return Promise.resolve(false);
  refreshInFlight = (async () => {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      sessionStorage.removeItem(REFRESH_KEY);
      accessToken = null;
      return false;
    }
    const tokens = await response.json() as { accessToken: string; refreshToken: string };
    accessToken = tokens.accessToken;
    sessionStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = () => fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  let response = await send();
  if (response.status === 401 && await refreshAccessToken()) {
    response = await send();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[]; error?: string } | null;
    const message = Array.isArray(body?.message) ? body.message.join("；") : body?.message;
    throw new Error(message || body?.error || `请求失败（${response.status}）`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function publicApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || "该报告分享链接不可用。");
  }
  return response.json() as Promise<T>;
}

export async function signIn(email: string, password: string, tenantId?: string): Promise<SignInResult> {
  const result = await api<SignInResult>("/auth/password/session", {
    method: "POST",
    body: JSON.stringify({ email, password, ...(tenantId ? { tenantId } : {}) }),
  });
  if (result.accessToken && result.refreshToken) {
    accessToken = result.accessToken;
    sessionStorage.setItem(REFRESH_KEY, result.refreshToken);
  }
  return result;
}

export async function restoreSession(): Promise<CurrentUser | null> {
  if (!await refreshAccessToken()) return null;
  return api<CurrentUser>("/auth/me");
}

export async function endSession(): Promise<void> {
  try {
    if (accessToken || await refreshAccessToken()) {
      await api("/auth/logout", { method: "POST" });
    }
  } finally {
    accessToken = null;
    sessionStorage.removeItem(REFRESH_KEY);
  }
}
