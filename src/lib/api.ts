export interface ApiUser {
  id: number;
  email: string;
  name: string;
  isAdmin?: boolean;
}

export class ApiError extends Error {
  status: number;
  /** Per-field validation messages, when the server sends them. */
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const body = data as { error?: string; fields?: Record<string, string> } | null;
    const message = body?.error ?? 'Something went wrong. Please try again.';
    throw new ApiError(message, res.status, body?.fields);
  }
  return data as T;
}
