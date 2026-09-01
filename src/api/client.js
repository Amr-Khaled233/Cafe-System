/**
 * عميل الـ API.
 * التوكن في httpOnly cookie، فبنبعت credentials مع كل ريكوست
 * والواجهة مش شايفة التوكن أصلاً.
 */
const BASE = '/api';

export class ApiError extends Error {
  constructor(code, status, details) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body, opts = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('NETWORK', 0);
  }

  if (opts.raw) {
    if (!res.ok) throw new ApiError('SERVER_ERROR', res.status);
    return res;
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) throw new ApiError(data?.code || 'SERVER_ERROR', res.status, data?.details);
  return data;
}

/** بيحوّل كائن فلاتر لـ query string، وبيشيل الفاضي */
export function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: (p, opts) => request('GET', p, null, opts),
  post: (p, b, opts) => request('POST', p, b, opts),
  patch: (p, b, opts) => request('PATCH', p, b, opts),
  put: (p, b, opts) => request('PUT', p, b, opts),
  del: (p, opts) => request('DELETE', p, null, opts),

  /** بينزّل ملف CSV — بيمرّ بنفس الحماية لأن الكوكي بيتبعت معاه */
  async download(path, filename) {
    const res = await request('GET', path, null, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
