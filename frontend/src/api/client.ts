import type { Preview, Structure, WorkSummary, WorkView } from "../types";
import { readStore, writeStore } from "../lib/storage";
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// What a share link carries (backend SHARED_KEYS): nothing of the owner's or the session's.
export type SharedWork = Pick<
  WorkView,
  | "title"
  | "author"
  | "kind"
  | "format"
  | "word_count"
  | "structure"
  | "analysis"
  | "completed_at"
  | "model_id"
  | "question_set_version"
  | "kind_warning"
>;

export class ApiError extends Error {
  status: number;
  code: string;
  detail: Record<string, unknown>;
  constructor(status: number, code: string, detail: Record<string, unknown> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export const ERRORS: Record<string, string> = {
  not_english: "This looks like it isn't in English. Only English texts can be analyzed.",
  over_word_cap: "This work is over the 600,000-word limit. Split it and analyze the parts.",
  unsupported_format: "Only TXT, Markdown, EPUB, DOCX, Fountain, SRT and VTT files can be read.",
  drm_protected: "This EPUB is DRM-protected and can't be read.",
  over_upload_cap: "Files must be under 50 MB.",
  limit_session_running: "Two analyses are already running for you. Wait for one to finish.",
  limit_instance_busy: "The server is busy right now. Try again in a minute.",
  missing_key: "Enter your TypeSafe key first.",
  empty_text: "There's no readable text in this file.",
  corrupt_file: "This file couldn't be read.",
  missing_input: "Choose a file or paste some text first.",
  limit_kept: "You've reached the limit of kept analyses. Delete one to keep another.",
  not_complete: "Wait for the analysis to finish before keeping it.",
  not_resumable: "This analysis can't be resumed; start it again.",
  not_kept: "This analysis must be kept before it can be shared.",
  not_running: "This analysis has already finished or stopped.",
  internal: "Something went wrong on the server. Try again in a moment.",
};

// detail.bucket from enforce_limit (backend/app/api/deps.py).
const RATE_LIMIT_BY_BUCKET: Record<string, string> = {
  uploads: "Too many uploads today from this connection. Try again tomorrow.",
  analyses: "Too many analyses today for this session. Try again tomorrow.",
  keycheck: "Too many key checks this hour. Try again in a bit.",
  sessions: "Too many new visits today from this connection. Try again tomorrow.",
};
// Anything but an answer from the server means the request never got one.
export function errorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return "Network error.";
  if (e.code === "rate_limited") {
    const bucket = e.detail.bucket;
    return (
      (typeof bucket === "string" && RATE_LIMIT_BY_BUCKET[bucket]) ||
      "Too many requests for now. Try again later."
    );
  }
  return ERRORS[e.code] ?? `Something went wrong (${e.code}).`;
}

// The site's own static files, where anything but a success is a failure.
export async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}

export function getKey(): string | null {
  return readStore("sessionStorage", "sos.key") ?? readStore("localStorage", "sos.key");
}
export const keyRemembered = () => readStore("localStorage", "sos.key") !== null;
export function setKey(key: string, remember: boolean) {
  clearKey();
  writeStore(remember ? "localStorage" : "sessionStorage", "sos.key", key);
}
export function clearKey() {
  writeStore("sessionStorage", "sos.key", null);
  writeStore("localStorage", "sos.key", null);
}

type ErrorBody = { error?: string; detail?: Record<string, unknown> };
const apiError = (r: Response, body: ErrorBody) =>
  new ApiError(r.status, body.error ?? "http_error", body.detail ?? {});

// Calls made together before a session exists share this one request instead of each making (and overwriting) their own.
let creating: Promise<string> | null = null;
async function session(): Promise<string> {
  const s = readStore("localStorage", "sos.session");
  if (s) return s;
  creating ??= (async () => {
    const r = await fetch(`${API_BASE}/api/session`, { method: "POST" });
    const body = (await r.json().catch(() => ({}))) as ErrorBody & { session_id: string };
    if (!r.ok) throw apiError(r, body);
    writeStore("localStorage", "sos.session", body.session_id);
    return body.session_id;
  })().finally(() => {
    creating = null;
  });
  return creating;
}

async function call<T>(
  path: string,
  init: RequestInit = {},
  opts: { session?: boolean; key?: string } = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  const sent = opts.session ? await session() : undefined;
  if (sent) headers["X-Session"] = sent;
  if (opts.key) headers["X-Jev-Key"] = opts.key;
  const r = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (r.status === 204) return undefined as T;
  const body = (await r.json().catch(() => ({}))) as ErrorBody;
  if (!r.ok) {
    // An unknown or expired session is dropped, if no other call has replaced it, and the call retried once.
    if (opts.session && r.status === 401 && body.error === "no_session" && !retried) {
      if (readStore("localStorage", "sos.session") === sent)
        writeStore("localStorage", "sos.session", null);
      return call<T>(path, init, opts, true);
    }
    throw apiError(r, body);
  }
  return body as T;
}

// The server reads the raw body, so a file's name travels in X-Filename, made printable ASCII for the header.
function uploadInit(input: File | string): RequestInit {
  const headers: Record<string, string> = { "Content-Type": "application/octet-stream" };
  if (typeof input !== "string") headers["X-Filename"] = input.name.replace(/[^\x20-\x7e]/g, "_");
  return { method: "POST", body: input, headers };
}

// Every id and token is one escaped path segment, so no value can reach another route.
const workPath = (id: string, rest = "") => `/api/works/${encodeURIComponent(id)}${rest}`;
// A visitor holding a work's address gets no session made for them; the server answers 404 either way.
const ownSession = (): RequestInit => {
  const s = readStore("localStorage", "sos.session");
  return s ? { headers: { "X-Session": s } } : {};
};

export const api = {
  session,
  preview: (input: File | string) => call<Preview>("/api/preview", uploadInit(input)),
  createWork: (input: File | string, key: string) =>
    call<{ work_id: string; structure: Structure }>("/api/works", uploadInit(input), {
      session: true,
      key,
    }),
  // Only the owner's session reads a work by its id; anyone else gets 404.
  getWork: (id: string) => call<WorkView>(workPath(id), ownSession()),
  keep: (id: string) =>
    call<{ kept: boolean }>(workPath(id, "/keep"), { method: "POST" }, { session: true }),
  cancel: (id: string) =>
    call<{ state: string }>(workPath(id, "/cancel"), { method: "POST" }, { session: true }),
  resume: (id: string, key: string) =>
    call<{ state: string }>(workPath(id, "/resume"), { method: "POST" }, { session: true, key }),
  remove: (id: string) => call<void>(workPath(id), { method: "DELETE" }, { session: true }),
  share: (id: string) =>
    call<{ token: string }>(workPath(id, "/share"), { method: "POST" }, { session: true }),
  unshare: (id: string) =>
    call<void>(workPath(id, "/share"), { method: "DELETE" }, { session: true }),
  shareLink: (id: string) =>
    call<{ token: string | null }>(workPath(id, "/share"), {}, { session: true }),
  shared: (token: string) => call<SharedWork>(`/api/shared/${encodeURIComponent(token)}`),
  myWorks: () => call<{ works: WorkSummary[] }>("/api/session/works", {}, { session: true }),
  checkKey: (key: string) =>
    call<{ ok: boolean; last4?: string; error?: string }>(
      "/api/key/check",
      { method: "POST" },
      { key },
    ),
};
