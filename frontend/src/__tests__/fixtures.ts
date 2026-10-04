/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, createElement, useContext, useState, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import type { Analysis, Preview, ScoredAnswers, Structure, WorkView } from "../types";
import type { ArcChartProps } from "../chart/ArcChart";
import { AXES, EVENT_TYPES } from "../types";
import type { Mock } from "vitest";

// A data router like the app's, so links and the traveling title behave as they do there; as in the app, the first page draws without waiting for its loader, and a page whose code is on its way draws nothing.
export function renderRoutes(routes: RouteObject[], path = "/") {
  const router = createMemoryRouter(
    routes.map((r) => ({ HydrateFallback: () => null, ...r })),
    { initialEntries: [path], hydrationData: { loaderData: { wall: null, work: null } } },
  );
  return { router, ...render(createElement(RouterProvider, { router })) };
}
export const renderAt = (element: ReactNode, path = "/") =>
  renderRoutes([{ path: "*", element }], path);
// As a `wrapper`, so a rerender draws its new page inside the same router.
const Slot = createContext<ReactNode>(null);
const Page = () => useContext(Slot);
export function DataRouter({ children }: { children: ReactNode }) {
  const [router] = useState(() => createMemoryRouter([{ path: "*", Component: Page }]));
  return createElement(
    Slot.Provider,
    { value: children },
    createElement(RouterProvider, { router }),
  );
}

export const indexCss = readFileSync(resolve(__dirname, "../index.css"), "utf8");

// The custom properties of the first rule in index.css for one selector, such as `:root`.
export function cssTokens(selector: string): Record<string, string> {
  const start = indexCss.indexOf(`${selector} {\n`);
  if (start < 0) throw new Error(`no ${selector} block in index.css`);
  const body = indexCss.slice(start, indexCss.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
}

// A chapter's means before any passage of it was scored.
export const noMeans = () =>
  Object.fromEntries(AXES.map((ax) => [ax, null])) as Record<(typeof AXES)[number], null>;

export function fakeAnalysis(): Analysis {
  const bins = Object.fromEntries(
    AXES.map((ax) => [
      ax,
      {
        raw: Array(100).fill(2),
        sd: Array(100).fill(0.3),
        shape: Array(100).fill(2),
        detail: Array(100).fill(2),
        band: {
          shape: [Array(100).fill(1.7), Array(100).fill(2.3)],
          detail: [Array(100).fill(1.8), Array(100).fill(2.2)],
        },
      },
    ]),
  ) as Analysis["bins"];
  return {
    version: 1,
    axes: [...AXES],
    bins,
    empty_bins: [],
    missing_beats: [],
    archetype: {
      state: "none",
      shape: null,
      caption: "Which Way Is Up?",
      r: 0.1,
      margin: 0,
    },
    events: [],
    chapters: [
      {
        idx: 0,
        title: "One",
        word_count: 1,
        beats: 2,
        means: noMeans(),
        mode_share: {},
        event_count: 1,
        start_bin: 0,
      },
      {
        idx: 1,
        title: "Two",
        word_count: 1,
        beats: 2,
        means: noMeans(),
        mode_share: {},
        event_count: 0,
        start_bin: 50,
      },
    ],
    mode_share: {},
    drivers: {},
    driver_gate: 0.6,
  };
}

// The opening needs an archetype to sketch from; the empty end bins trim both the sketch and the line.
export function openingProps(): ArcChartProps {
  const a = fakeAnalysis();
  a.archetype = { ...a.archetype, state: "named", shape: "fall_rise" };
  a.empty_bins = [0, 1, 98, 99];
  return {
    analysis: a,
    structure: fakeStructure(),
    axes: ["fortune"],
    smoothing: 1,
    showBand: false,
    showRaw: false,
    shown: null,
    pinned: null,
    onHover: () => {},
    onPin: () => {},
  };
}
// The detail curve differs from the shape here, so a morph between them has somewhere to go.
export function morphProps(p: Partial<ArcChartProps> = {}): ArcChartProps {
  const a = fakeAnalysis();
  a.bins.tension.detail = Array.from({ length: 100 }, (_, i) => 2 + Math.sin(i / 5));
  a.bins.tension.band.detail = [
    a.bins.tension.detail.map((v) => v - 0.3),
    a.bins.tension.detail.map((v) => v + 0.3),
  ];
  return {
    analysis: a,
    structure: fakeStructure(),
    axes: ["tension"],
    smoothing: 1,
    showBand: true,
    showRaw: false,
    shown: null,
    pinned: null,
    onHover: () => {},
    onPin: () => {},
    ...p,
  };
}

export function fakeStructure(beats = 12, chapters = 3): Structure {
  const bs = Array.from({ length: beats }, (_, i) => ({
    idx: i,
    chapter_idx: Math.floor((i * chapters) / beats),
    start_cp: i * 100,
    end_cp: i * 100 + 100,
    word_count: 800,
    start_s: null,
    end_s: null,
  }));
  const cs = Array.from({ length: chapters }, (_, c) => {
    const mine = bs.filter((b) => b.chapter_idx === c);
    return {
      idx: c,
      title: `Chapter ${c + 1}`,
      start_cp: mine[0].start_cp,
      end_cp: mine[mine.length - 1].end_cp,
    };
  });
  return {
    sections: [],
    chapter_source: "headings",
    preset: "prose",
    word_count: beats * 800,
    chapters: cs,
    beats: bs,
  };
}

export function fakeAnswers(): ScoredAnswers {
  return {
    scores: Object.fromEntries(
      AXES.map((ax) => [
        ax,
        { score: 2.1, p: [0.1, 0.2, 0.4, 0.2, 0.1], confidence: 0.8, sd: 0.6 },
      ]),
    ) as ScoredAnswers["scores"],
    events: Object.fromEntries(EVENT_TYPES.map((e) => [e, 0.1])) as ScoredAnswers["events"],
    mode: { choice: "dialogue", confidence: 0.9 },
  };
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// A fetch stand-in that grants a session and answers each request whose URL ends with one of the paths; anything else gets an empty list.
export function serve(
  routes: Record<string, (init?: RequestInit) => Response | Promise<Response>> = {},
) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/session")) return json({ session_id: "s1" }, 201);
    const path = Object.keys(routes).find((p) => url.endsWith(p));
    return path ? routes[path](init) : json([]);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

// A finished, kept work as the server sends it to its owner.
export const fakeWork = (over: Partial<WorkView> = {}): WorkView => ({
  id: "w1",
  title: "T",
  author: "A",
  kind: "novel",
  format: "txt",
  state: "complete",
  error: null,
  kept: true,
  word_count: 100,
  structure: {
    sections: [],
    chapters: [],
    beats: [],
    chapter_source: "headings",
    preset: "prose",
    word_count: 100,
  },
  analysis: null,
  done: 0,
  total: 0,
  created_at: "2024-01-01T00:00:00Z",
  completed_at: "2024-01-01T00:00:00Z",
  expires_at: null,
  model_id: "m",
  question_set_version: "v1",
  kind_warning: null,
  queue_position: null,
  cost_usd: 0.02,
  events_ticket: "t",
  ...over,
});

// A preview of a 90,000-word text in 112 passages.
export const fakePreview = (over: Partial<Preview> = {}): Preview => ({
  title: "T",
  author: "A",
  format: "txt",
  word_count: 90000,
  chapters: [],
  sections: [],
  beats: Array(112).fill({}),
  preset: "prose",
  chapter_source: "headings",
  stripped: [],
  warnings: [],
  estimate: {
    words: 90000,
    beats: 112,
    requests: 152,
    tokens: 510000,
    cost_usd: 0.03,
    seconds: 18,
  },
  content_hash: "h",
  english: true,
  normalized_text: "x",
  ...over,
});

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
// A line rising evenly from 1 to 3 across the book.
export const ramp = Array.from({ length: 100 }, (_, i) => 1 + (i / 99) * 2);

// A stand-in EventSource that records every stream opened, so a test can emit server events into it.
export class FakeES {
  static instances: FakeES[] = [];
  static get last() {
    return FakeES.instances[FakeES.instances.length - 1];
  }
  static readonly CLOSED = 2;
  url: string;
  listeners: Record<string, (e: MessageEvent) => void> = {};
  closed = false;
  readyState = 1;
  constructor(url: string) {
    this.url = url;
    FakeES.instances.push(this);
  }
  addEventListener(n: string, f: (e: MessageEvent) => void) {
    this.listeners[n] = f;
  }
  close() {
    this.closed = true;
  }
  emit(n: string, data: unknown) {
    this.listeners[n]?.(new MessageEvent(n, { data: JSON.stringify(data) }));
  }
}

// The panel a popover's button names while it is open, or null while it is closed.
export function popoverOf(label: string | RegExp): HTMLElement | null {
  const id = screen.getByRole("button", { name: label }).getAttribute("aria-controls");
  return id ? document.getElementById(id) : null;
}

// jsdom lays nothing out, so this stands in for ResizeObserver and lets a test say how wide every watched box has become.
export function stubResize() {
  const watchers = new Set<ResizeObserverCallback>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe() {
        watchers.add(this.cb);
      }
      unobserve() {}
      disconnect() {
        watchers.delete(this.cb);
      }
    },
  );
  return {
    resize: (width: number) =>
      act(() =>
        watchers.forEach((cb) =>
          cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver),
        ),
      ),
    get watching() {
      return watchers.size;
    },
  };
}

// jsdom answers no media query; this answers the ones given as matching and every other as not.
export function stubMedia(...on: string[]) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: on.includes(media),
    addEventListener() {},
    removeEventListener() {},
  }));
}
export const stubReducedMotion = () => stubMedia("(prefers-reduced-motion: reduce)");

// jsdom measures no path, so every path has this length until the test ends.
export function stubPathLength(length = 1000) {
  const proto = SVGElement.prototype as unknown as { getTotalLength?: () => number };
  proto.getTotalLength = () => length;
  onTestFinished(() => {
    delete proto.getTotalLength;
  });
}

// jsdom plays no animation; this records each one started, so a test can check it, cut it short or end it.
export function stubAnimate() {
  const calls: {
    el: Element;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions & { duration: number };
    anim: { onfinish: (() => void) | null; cancel: Mock };
  }[] = [];
  vi.spyOn(Element.prototype, "animate").mockImplementation(function (
    this: Element,
    keyframes,
    options,
  ) {
    const anim = { onfinish: null, cancel: vi.fn() };
    calls.push({ el: this, keyframes, options, anim } as (typeof calls)[number]);
    return anim as unknown as Animation;
  });
  return calls;
}

// Moves fake timers on and lets React draw what they set off.
export const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

// What a browser with site data blocked does: touching either storage throws.
export function blockStorage() {
  for (const area of ["localStorage", "sessionStorage"] as const)
    vi.spyOn(window, area, "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
}
// IndexedDB blocked or full: every read and write of this device's store fails, though opening it works, since its upgrade runs in a versionchange transaction.
export function blockIndexedDB() {
  const real = IDBDatabase.prototype.transaction;
  vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
    this: IDBDatabase,
    names,
    mode,
  ) {
    if (mode === "versionchange") return real.call(this, names, mode);
    throw new DOMException("blocked", "InvalidStateError");
  });
}

// jsdom has no object URLs, so each test starts with stand-ins (setupTests) that keep every blob here under its address.
export const objectUrls = new Map<string, Blob>();
export const blobText = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsText(b);
  });
// The SVG text the open poster dialog's preview image shows.
export const previewSvg = (within: HTMLElement = document.body) => {
  const img = within.querySelector<HTMLImageElement>('img[alt*="poster preview"]')!;
  return blobText(objectUrls.get(img.getAttribute("src")!)!);
};

// jsdom has no object URLs; this records each download a page starts instead, and puts URL back as it was after the test.
export function catchDownloads() {
  const got: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  const { createObjectURL, revokeObjectURL } = URL;
  onTestFinished(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });
  URL.createObjectURL = (b: Blob) => {
    const url = `blob:${blobs.size}`;
    blobs.set(url, b);
    return url;
  };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    got.push({ name: this.download, blob: blobs.get(this.getAttribute("href")!)! });
  });
  return got;
}
export const readBlob = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsText(b);
  });
// What Firefox does with site data blocked: opening the store throws at once, on every try.
export function refuseIndexedDB() {
  vi.stubGlobal("indexedDB", {
    open: () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
}
// A well-formed results file, as Export writes it.
export const resultsFile = (id = "f9") =>
  new File(
    [
      JSON.stringify({
        version: 1,
        id,
        title: "From a File",
        author: null,
        structure: fakeStructure(),
        analysis: fakeAnalysis(),
        answers: {},
        text: "",
      }),
    ],
    `${id}.shapes.json`,
    { type: "application/json" },
  );

export class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  voice: { name: string } | null = null;
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}
// A speech engine whose voices are given; every spoken utterance is kept for the test to end or fail.
export function stubSpeech(
  voices = [{ name: "Local", lang: "en-US", localService: true, default: true }] as {
    name: string;
    lang: string;
    localService: boolean;
    default: boolean;
  }[],
) {
  const spoken: FakeUtterance[] = [];
  const listeners: (() => void)[] = [];
  const synth = {
    voices,
    speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
    cancel: vi.fn(),
    speaking: false,
    getVoices: () => synth.voices,
    addEventListener: (_: string, f: () => void) => listeners.push(f),
    removeEventListener: (_: string, f: () => void) => listeners.splice(listeners.indexOf(f), 1),
    fireVoicesChanged: () => listeners.forEach((f) => f()),
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  return { synth, spoken };
}
