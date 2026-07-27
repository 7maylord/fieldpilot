export const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
let csrfToken: string | undefined;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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
  const headers = new Headers(init?.headers);
  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has('content-type')
  )
    headers.set('content-type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...Object.fromEntries(headers.entries()),
    },
  });
  const text = await response.text();
  if (!response.ok)
    throw new ApiError(
      response.status,
      responseErrorMessage(response.status, text),
    );
  return (text ? JSON.parse(text) : undefined) as T;
}

export function errorMessage(error: unknown, fallback = 'Request failed') {
  return error instanceof Error ? error.message : fallback;
}

function responseErrorMessage(status: number, text: string) {
  try {
    const body = JSON.parse(text) as { detail?: string; message?: string };
    return body.detail ?? body.message ?? `API request failed (${status})`;
  } catch {
    return text || `API request failed (${status})`;
  }
}
