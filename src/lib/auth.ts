// Auth for the admin panel. We reuse the platform's /api/login. Admins get the
// whole panel; recruiters get a hiring-only view of their own company (the
// backend enforces the company scope — the UI only hides what they can't use).
// Students and applicants are rejected here.

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AdminUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function isAdmin(): boolean {
  return !!getToken() && getUser()?.role === 'admin';
}

export function isRecruiter(): boolean {
  return !!getToken() && getUser()?.role === 'recruiter';
}

/** Anyone allowed into the panel at all. */
export function isStaff(): boolean {
  return isAdmin() || isRecruiter();
}

/** Where a signed-in user lands: recruiters have no dashboard. */
export function homePath(): string {
  return isRecruiter() ? '/tests' : '/dashboard';
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const resp = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!resp.ok) {
    let msg = 'Failed to authenticate';
    try {
      const body = await resp.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const data = (await resp.json()) as { token: string; user: AdminUser };
  if (data.user?.role !== 'admin' && data.user?.role !== 'recruiter') {
    throw new Error('This account does not have access to the admin panel.');
  }

  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
