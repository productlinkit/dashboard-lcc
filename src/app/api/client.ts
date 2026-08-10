/*
 * The single door to the backend.
 *
 * Every response the API sends uses one envelope, so unwrapping it belongs here
 * rather than in thirty call sites:
 *
 *   { success, message, data, meta, code, errors, request_id }
 *
 * A failure is thrown as an ApiError carrying the machine-readable `code` and,
 * for a form submission, one entry per offending field — the shape the civil
 * registration forms need to highlight every missing field at once.
 */


export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface FieldError {
  field: string;
  rule?: string;
  message: string;
}

export interface Envelope<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PageMeta;
  code?: string;
  errors?: FieldError[];
  request_id?: string;
}

/** A page of rows plus the pagination block that came with it. */
export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export type ApiCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_STATE_TRANSITION"
  | "PAYMENT_REQUIRED"
  | "INSUFFICIENT_FUNDS"
  | "NETWORK_ERROR";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiCode | string;
  readonly fields: FieldError[];
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, fields: FieldError[] = [], requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }

  /** Field errors keyed by field name, for a form to look up as it renders. */
  fieldMap(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.fields) out[f.field] = f.message;
    return out;
  }

  get isValidation(): boolean {
    return this.code === "VALIDATION_ERROR" || this.status === 422;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/* ── Configuration ─────────────────────────────────────────────────────── */

const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
export const API_BASE_URL = (RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : "http://localhost:8080/api/v1").replace(/\/+$/, "");

/* ── Token storage ─────────────────────────────────────────────────────── */

const ACCESS_KEY = "lcc.admin.access_token";
const REFRESH_KEY = "lcc.admin.refresh_token";

/** Listeners fire when the session is established or cleared. */
type SessionListener = (authenticated: boolean) => void;
const listeners = new Set<SessionListener>();

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private-browsing mode denies localStorage; the session then lives only
    // in memory, which still lets the current tab work.
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* memory-only session */
  }
}

let accessToken: string | null = readStored(ACCESS_KEY);
let refreshToken: string | null = readStored(REFRESH_KEY);

export const tokens = {
  get access() {
    return accessToken;
  },
  get refresh() {
    return refreshToken;
  },
  isAuthenticated() {
    return accessToken !== null;
  },
  set(access: string, refresh?: string) {
    accessToken = access;
    writeStored(ACCESS_KEY, access);
    if (refresh) {
      refreshToken = refresh;
      writeStored(REFRESH_KEY, refresh);
    }
    listeners.forEach((l) => l(true));
  },
  clear() {
    accessToken = null;
    refreshToken = null;
    writeStored(ACCESS_KEY, null);
    writeStored(REFRESH_KEY, null);
    listeners.forEach((l) => l(false));
  },
  subscribe(listener: SessionListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/* ── Request ───────────────────────────────────────────────────────────── */

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Send as multipart instead of JSON — used by the upload endpoints. */
  form?: FormData;
  signal?: AbortSignal;
  /** Skip the Authorization header even when a token is held. */
  anonymous?: boolean;
  /** Read the response as text rather than JSON — used by the CSV exports. */
  raw?: boolean;
}

function buildURL(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(API_BASE_URL + (path.startsWith("/") ? path : `/${path}`));
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        // The API reads a repeated parameter as a list: status=a&status=b.
        for (const v of value) url.searchParams.append(key, String(v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/*
 * A 401 on a normal request means the access token expired. Refresh once and
 * replay — but only once at a time, or ten concurrent requests would each start
 * their own refresh and invalidate each other's token.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false;
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      const res = await fetch(buildURL("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const envelope = (await res.json()) as Envelope<{ tokens?: { access_token: string; refresh_token?: string } }>;
      const next = envelope.data?.tokens;
      if (!next?.access_token) return false;
      tokens.set(next.access_token, next.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

async function send(method: string, path: string, options: RequestOptions, retry: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!options.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let payload: BodyInit | undefined;
  if (options.form) {
    payload = options.form; // the browser sets the multipart boundary itself
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(options.body);
  }

  const res = await fetch(buildURL(path, options.query), {
    method,
    headers,
    body: payload,
    signal: options.signal,
  });

  if (res.status === 401 && retry && !options.anonymous && refreshToken) {
    if (await refreshSession()) return send(method, path, options, false);
    tokens.clear();
  }
  return res;
}

/** Perform a request and unwrap the envelope, throwing ApiError on failure. */
export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, options, true);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection and try again.");
  }

  if (options.raw) {
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, "BAD_REQUEST", text.slice(0, 200) || res.statusText);
    return text as unknown as T;
  }

  let envelope: Envelope<T>;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(res.status, "INTERNAL_ERROR", res.ok ? "The server sent a malformed response." : res.statusText);
  }

  if (!res.ok || envelope.success === false) {
    throw new ApiError(
      res.status,
      envelope.code ?? "INTERNAL_ERROR",
      envelope.message || "Something went wrong.",
      envelope.errors ?? [],
      envelope.request_id,
    );
  }

  return envelope.data as T;
}

/** Like request, but keeps the pagination block alongside the rows. */
export async function requestPaged<T>(path: string, options: RequestOptions = {}): Promise<Paged<T>> {
  let res: Response;
  try {
    res = await send("GET", path, options, true);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection and try again.");
  }

  const envelope = (await res.json().catch(() => null)) as Envelope<T[]> | null;
  if (!envelope || !res.ok || envelope.success === false) {
    throw new ApiError(
      res.status,
      envelope?.code ?? "INTERNAL_ERROR",
      envelope?.message || "Something went wrong.",
      envelope?.errors ?? [],
      envelope?.request_id,
    );
  }

  return {
    data: envelope.data ?? [],
    meta: envelope.meta ?? {
      page: 1,
      per_page: envelope.data?.length ?? 0,
      total: envelope.data?.length ?? 0,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    },
  };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, { ...options, body }),
  // A DELETE may carry a body: removing a household member records why.
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
  paged: requestPaged,
  upload: <T>(path: string, form: FormData, options?: RequestOptions) => request<T>("POST", path, { ...options, form }),
};
