import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router/dom";
import { browserRouter } from "../App";
import type { GalleryEntry } from "../types";
import { deleteLocal, saveLocal } from "../lib/local";
import { fakeAnalysis, fakeStructure, indexCss as css, json } from "./fixtures";

const entry = (slug: string, title: string): GalleryEntry => ({
  slug,
  title,
  author: "A",
  word_count: 1000,
  content_hash: "",
  question_set_version: "q",
  model_id: "m",
  archetype: { state: "named", shape: "rise", caption: "", r: 0.6, margin: 0.2 },
  sparkline: Array.from({ length: 100 }, (_, i) => i),
});
const work = (title: string) => ({
  work: { title, author: "A", word_count: 1, kind: "novel", format: "txt", content_hash: "" },
  structure: fakeStructure(),
  analysis: fakeAnalysis(),
});

// What holds the traveling title's name, as "TAG:text", when the browser snapshots each side.
const named = () =>
  [...document.querySelectorAll<HTMLElement>("*")]
    .filter((e) => e.style.viewTransitionName === "work-title")
    .map((e) => `${e.tagName}:${e.textContent}`);
type Snap = { old: string[]; new: string[] };
function stubTransitions() {
  const snaps: Snap[] = [];
  document.startViewTransition = vi.fn((update?: unknown) => {
    const snap: Snap = { old: named(), new: [] };
    snaps.push(snap);
    const done = Promise.resolve((update as () => Promise<void>)()).then(() => {
      snap.new = named();
    });
    return {
      finished: done,
      ready: done,
      updateCallbackDone: done,
      skipTransition: () => {},
      types: new Set<string>(),
    } as unknown as ViewTransition;
  }) as typeof document.startViewTransition;
  return snaps;
}

test("the title travels from its plate to the work and back, and stepping between works fades only the page", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/index.json")
        ? json([entry("a", "Alpha"), entry("b", "Beta")])
        : url.endsWith("/questions.json")
          ? json({ version: "q", axes: [], events: [] })
          : json(work(url.includes("/b.") ? "Beta" : "Alpha")),
    ),
  );
  const snaps = stubTransitions();
  window.history.replaceState(null, "", "/");
  render(<RouterProvider router={browserRouter()} />);
  // The bar is named apart from the page, so it holds still.
  expect(screen.getByRole("banner")).toHaveStyle({ viewTransitionName: "nav" });

  await userEvent.click(await screen.findByRole("link", { name: /^Alpha by A/ }));
  await screen.findByRole("heading", { level: 1, name: "Alpha" });
  await waitFor(() => expect(snaps).toEqual([{ old: ["DIV:Alpha"], new: ["H1:Alpha"] }]));

  const room = await screen.findByRole("navigation", { name: "In this room" });
  await userEvent.click(within(room).getByRole("link", { name: /Beta/ }));
  await screen.findByRole("heading", { level: 1, name: "Beta" });
  await waitFor(() => expect(snaps[1]).toEqual({ old: [], new: [] }));

  window.history.back();
  await screen.findByRole("heading", { level: 1, name: "Alpha" });
  window.history.back();
  await screen.findByRole("link", { name: /^Beta by A/ });
  await waitFor(() => expect(snaps).toHaveLength(4));
  expect(snaps[3]).toEqual({ old: ["H1:Alpha"], new: ["DIV:Alpha"] });
});

test("the wall reached straight from a work centers that work's plate after restoring its scroll, and only then", async () => {
  const moves: string[] = [];
  vi.stubGlobal(
    "scrollTo",
    vi.fn(() => moves.push("restore")),
  );
  Element.prototype.scrollIntoView = vi.fn(function (this: Element, o?: unknown) {
    moves.push(`${this.getAttribute("href")} ${JSON.stringify(o)}`);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/index.json")
        ? json([entry("a", "Alpha"), entry("b", "Beta")])
        : url.endsWith("/questions.json")
          ? json({ version: "q", axes: [], events: [] })
          : json(work("Beta")),
    ),
  );
  stubTransitions();
  window.history.replaceState(null, "", "/");
  render(<RouterProvider router={browserRouter()} />);
  await screen.findByRole("link", { name: /^Beta by A/ });
  expect(moves).toEqual([]);
  const site = screen.getByRole("navigation", { name: "Site" });
  const plate = '{"block":"center"}';

  // Back, and the bar's link to the wall, both land on the plate.
  await userEvent.click(screen.getByRole("link", { name: /^Beta by A/ }));
  await screen.findByRole("heading", { level: 1, name: "Beta" });
  window.history.back();
  await screen.findByRole("link", { name: /^Beta by A/ });
  await waitFor(() => expect(moves.at(-1)).toBe(`/gallery/b ${plate}`));
  expect(moves.at(-2)).toBe("restore");
  await userEvent.click(screen.getByRole("link", { name: /^Beta by A/ }));
  await screen.findByRole("heading", { level: 1, name: "Beta" });
  await userEvent.click(within(site).getByRole("link", { name: "Gallery" }));
  await screen.findByRole("link", { name: /^Beta by A/ });
  await waitFor(() => expect(moves.at(-1)).toBe(`/gallery/b ${plate}`));

  // A work, then another page, then the wall keeps plain restoration.
  await userEvent.click(screen.getByRole("link", { name: /^Beta by A/ }));
  await screen.findByRole("heading", { level: 1, name: "Beta" });
  await userEvent.click(within(site).getByRole("link", { name: "About" }));
  await screen.findByRole("heading", { level: 1, name: "About" });
  moves.length = 0;
  await userEvent.click(within(site).getByRole("link", { name: "Gallery" }));
  await screen.findByRole("link", { name: /^Beta by A/ });
  expect(moves).toEqual(["restore"]);
});

test("a step back from one of the reader's own works draws Your works at once and centers its plate", async () => {
  await saveLocal({
    id: "m1",
    title: "Mine",
    author: "Me",
    text: "",
    structure: fakeStructure(),
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 1,
  });
  const moves: string[] = [];
  vi.stubGlobal("scrollTo", vi.fn());
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    moves.push(this.getAttribute("href") ?? "");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/index.json")
        ? json([entry("a", "Alpha")])
        : url.endsWith("/questions.json")
          ? json({ version: "q", axes: [], events: [] })
          : new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
    ),
  );
  stubTransitions();
  window.history.replaceState(null, "", "/");
  render(<RouterProvider router={browserRouter()} />);
  await userEvent.click(await screen.findByRole("link", { name: /^Mine by Me/ }));
  await screen.findByRole("heading", { level: 1, name: "Mine" });
  window.history.back();
  await screen.findByRole("link", { name: /^Alpha by A/ });
  expect(moves).toEqual(["/works/m1"]);
  await deleteLocal("m1");
});

test("a link in the bar asks for a transition, and a page without a work names no title", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json([])),
  );
  const snaps = stubTransitions();
  window.history.replaceState(null, "", "/");
  render(<RouterProvider router={browserRouter()} />);
  const site = screen.getByRole("navigation", { name: "Site" });
  await userEvent.click(within(site).getByRole("link", { name: "About" }));
  await screen.findByRole("heading", { level: 1, name: "About" });
  expect(snaps).toEqual([{ old: [], new: [] }]);
});

test("a work whose file fails, reached from its plate, says so on its own page after one request", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const f = vi.fn(async (url: string) =>
    url.endsWith("/index.json") ? json([entry("a", "Alpha")]) : new Response("", { status: 500 }),
  );
  vi.stubGlobal("fetch", f);
  stubTransitions();
  window.history.replaceState(null, "", "/");
  render(<RouterProvider router={browserRouter()} />);
  await userEvent.click(await screen.findByRole("link", { name: /^Alpha by A/ }));
  expect(
    await screen.findByRole("heading", { level: 1, name: "Not in the gallery" }),
  ).toBeVisible();
  expect(f.mock.calls.filter(([u]) => u === "/gallery/a.json")).toHaveLength(1);
});

test("index.css times the page change, holds the bar still, and stills it all for reduced motion", () => {
  const flat = css.replace(/\s+/g, " ");
  expect(flat).toMatch(
    /::view-transition-old\(root\) \{ animation: page-out var\(--motion-leave\) var\(--ease-settle\) both; \}/,
  );
  expect(flat).toMatch(
    /::view-transition-new\(root\) \{ animation: page-in var\(--motion-reveal\) var\(--ease-settle\) both; \}/,
  );
  expect(flat).toMatch(/@keyframes page-in \{ from \{ opacity: 0; translate: 0 6px; \} \}/);
  expect(flat).toMatch(/::view-transition-group\(nav\) \{ animation: none; \}/);
  const reduced = flat.slice(flat.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  expect(reduced).toMatch(
    /::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation: none !important; \}/,
  );
});
