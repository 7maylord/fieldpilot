export const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
let csrfToken: string | undefined;

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !csrfToken) {
    const csrf = await fetch(`${apiBase}/auth/csrf`, {
      credentials: 'include',
    });
    if (!csrf.ok) throw new Error(`CSRF request failed (${csrf.status})`);
    csrfToken = ((await csrf.json()) as { csrfToken: string }).csrfToken;
  }
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}
