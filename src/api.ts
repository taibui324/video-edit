export async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await res.json(); if (!res.ok) throw new Error(value.error); return value;
}
