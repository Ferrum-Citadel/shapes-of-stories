import { api, ApiError, setKey, getKey, clearKey, errorMessage } from "../api/client";
import { blockStorage } from "./fixtures";

test("session is created once and sent as header", async () => {
  const calls: RequestInit[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(init!);
      if (url.endsWith("/api/session"))
        return new Response(JSON.stringify({ session_id: "s123" }), { status: 201 });
      return new Response(JSON.stringify({ works: [] }), { status: 200 });
    }),
  );
  await api.myWorks();
  expect(localStorage.getItem("sos.session")).toBe("s123");
  expect((calls[1].headers as Record<string, string>)["X-Session"]).toBe("s123");
});

test("typed errors and key storage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ error: "not_found", detail: {} }), { status: 404 }),
    ),
  );
  await expect(api.getWork("x")).rejects.toMatchObject({
    code: "not_found",
    status: 404,
  } satisfies Partial<ApiError>);
  setKey("sk-abc", false);
  expect(getKey()).toBe("sk-abc");
  expect(localStorage.getItem("sos.key")).toBeNull();
  setKey("sk-abc", true);
  expect(localStorage.getItem("sos.key")).toBe("sk-abc");
  clearKey();
  expect(getKey()).toBeNull();
});

test("upload sends a sanitised X-Filename and raw body for a File, none for a pasted string", async () => {
  const calls: RequestInit[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!);
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
  const file = new File(["hello"], "Ünïcode ✓.txt");
  await api.preview(file);
  const fileHeaders = calls[0].headers as Record<string, string>;
  expect(fileHeaders["X-Filename"]).toBe("_n_code _.txt");
  expect(fileHeaders["Content-Type"]).toBe("application/octet-stream");
  expect(calls[0].body).toBe(file);

  await api.preview("pasted text");
  const stringHeaders = calls[1].headers as Record<string, string>;
  expect(stringHeaders["X-Filename"]).toBeUndefined();
  expect(calls[1].body).toBe("pasted text");
});

test("session() throws ApiError when the create response is not ok", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "rate_limited", detail: {} }), { status: 429 }),
    ),
  );
  await expect(api.session()).rejects.toMatchObject({
    code: "rate_limited",
    status: 429,
  } satisfies Partial<ApiError>);
  expect(localStorage.getItem("sos.session")).toBeNull();
});

test("session recovery: no_session triggers a fresh session and one retry", async () => {
  let sessionCalls = 0;
  let worksCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/session")) {
        sessionCalls++;
        return new Response(JSON.stringify({ session_id: `s${sessionCalls}` }), { status: 201 });
      }
      worksCalls++;
      if (worksCalls === 1)
        return new Response(JSON.stringify({ error: "no_session", detail: {} }), { status: 401 });
      return new Response(JSON.stringify({ works: [] }), { status: 200 });
    }),
  );
  const result = await api.myWorks();
  expect(result).toEqual({ works: [] });
  expect(sessionCalls).toBe(2);
  expect(worksCalls).toBe(2);
  expect(localStorage.getItem("sos.session")).toBe("s2");
});

test("with site data blocked no key is found, none is kept, and calls still get a session", async () => {
  blockStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(url.endsWith("/api/session") ? { session_id: "s1" } : { works: [] }),
          { status: 200 },
        ),
    ),
  );
  expect(getKey()).toBeNull();
  expect(() => {
    setKey("sk-abc", true);
    clearKey();
  }).not.toThrow();
  expect(getKey()).toBeNull();
  await expect(api.myWorks()).resolves.toEqual({ works: [] });
});

test("calls made together before any session exists share one new session", async () => {
  let made = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/session"))
        return new Response(JSON.stringify({ session_id: `s${++made}` }), { status: 201 });
      return new Response(JSON.stringify({ works: [] }), { status: 200 });
    }),
  );
  await Promise.all([api.myWorks(), api.myWorks()]);
  expect(made).toBe(1);
  expect(localStorage.getItem("sos.session")).toBe("s1");
});

test("calls that both find their session gone make one new session between them", async () => {
  localStorage.setItem("sos.session", "old");
  let made = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/session"))
        return new Response(JSON.stringify({ session_id: `s${++made}` }), { status: 201 });
      const sent = (init!.headers as Record<string, string>)["X-Session"];
      return sent === "old"
        ? new Response(JSON.stringify({ error: "no_session", detail: {} }), { status: 401 })
        : new Response(JSON.stringify({ works: [] }), { status: 200 });
    }),
  );
  await Promise.all([api.myWorks(), api.myWorks()]);
  expect(made).toBe(1);
  expect(localStorage.getItem("sos.session")).toBe("s1");
});

test("reading a work sends the session this browser already has and never makes one", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }),
  );
  await expect(api.getWork("w1")).rejects.toMatchObject({ status: 404 });
  expect(calls.map((c) => c[0])).toEqual(["/api/works/w1"]);
  expect(localStorage.getItem("sos.session")).toBeNull();
  localStorage.setItem("sos.session", "s9");
  await api.getWork("w1").catch(() => {});
  expect((calls[1][1]?.headers as Record<string, string>)["X-Session"]).toBe("s9");
});

test("ids and tokens travel as one escaped path segment", async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ session_id: "s1", token: null }), { status: 200 });
    }),
  );
  localStorage.setItem("sos.session", "s1");
  await api.getWork("../shared/x");
  await api.shareLink("a/b?c");
  await api.shared("../works/w1");
  expect(urls).toEqual([
    "/api/works/..%2Fshared%2Fx",
    "/api/works/a%2Fb%3Fc/share",
    "/api/shared/..%2Fworks%2Fw1",
  ]);
});

test("too many new sessions from one connection has its own message", () => {
  expect(errorMessage(new ApiError(429, "rate_limited", { bucket: "sessions" }))).toMatch(
    /new visits today from this connection/,
  );
});
