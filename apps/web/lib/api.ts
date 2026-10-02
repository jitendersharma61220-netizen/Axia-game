export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message ?? res.statusText);
    throw new ApiError(res.status, data?.code, message, data);
  }
  return data as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);

/** Fire-and-forget client analytics. */
export function track(name: string, props?: Record<string, unknown>) {
  void api('/events', { body: { name, props } }).catch(() => undefined);
}
