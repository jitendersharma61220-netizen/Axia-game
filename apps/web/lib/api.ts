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

/** Server-side judging for instant-feedback games, with retries on network/server errors (never on 4xx). */
export async function postStep<T = Record<string, unknown>>(sessionId: string, index: number, step: object): Promise<T> {
  let lastErr: unknown;
  for (const wait of [0, 500, 1000, 2000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return await api<T>(`/sessions/${sessionId}/steps`, { body: { index, step } });
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError && err.status < 500) throw err;
    }
  }
  throw lastErr;
}
