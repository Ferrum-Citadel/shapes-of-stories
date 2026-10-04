import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pages } from "../App";
import { fakeAnalysis, fakeStructure, json, previewSvg, renderRoutes } from "./fixtures";
import { AXES, EVENT_TYPES } from "../types";

const work = {
  work: {
    title: "Work A",
    author: "A",
    word_count: 1,
    kind: "novel",
    format: "txt",
    content_hash: "",
  },
  structure: fakeStructure(),
  analysis: fakeAnalysis(),
};
// Twelve passages of 100 characters each, every one a single paragraph that names itself.
const book = Array.from({ length: 12 }, (_, i) => `Passage number ${i}.`.padEnd(100, ".")).join("");
const at = (path: string) => renderRoutes(pages, path);
// The wall's index is empty and the passages' own scores are missing unless a test says otherwise.
const file = (url: string) =>
  url.includes("/answers/")
    ? new Response("", { status: 404 })
    : json(url.endsWith("/index.json") ? [] : work);
const txtCalls = (f: ReturnType<typeof vi.fn>) =>
  f.mock.calls.filter(([u]) => String(u).endsWith(".txt"));
async function pinFirst() {
  const chart = screen.getByRole("group", { name: /Arc chart/ });
  act(() => chart.focus());
  await userEvent.keyboard("{ArrowRight}");
  return screen.getByRole("region", { name: "Passage" });
}

test("the work page draws from its data alone, and fetches the book's text once, when it is first wanted", async () => {
  let send: (r: Response) => void = () => {};
  const f = vi.fn((url: string) =>
    url.endsWith(".txt")
      ? new Promise<Response>((res) => {
          send = res;
        })
      : Promise.resolve(file(url)),
  );
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  expect(await screen.findByRole("heading", { level: 1, name: "Work A" })).toBeInTheDocument();
  expect(txtCalls(f)).toHaveLength(0);
  const drawer = await pinFirst();
  expect(txtCalls(f).map(([u]) => u)).toEqual(["/gallery/a.txt"]);
  expect(within(drawer).getByText("Loading the passage…")).toBeInTheDocument();
  send(new Response(book));
  expect(await within(drawer).findByText(/^Passage number 0\./)).toBeInTheDocument();
  await userEvent.keyboard("{ArrowRight}");
  expect(await screen.findByText(/^Passage number 1\./)).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Passage" })).toBeNull();
  await pinFirst();
  expect(await screen.findByText(/^Passage number 0\./)).toBeInTheDocument();
  expect(txtCalls(f)).toHaveLength(1);
});

test("leaving the page stops the text on its way", async () => {
  const f = vi.fn((url: string, _init?: RequestInit) =>
    url.endsWith(".txt") ? new Promise<Response>(() => {}) : Promise.resolve(file(url)),
  );
  vi.stubGlobal("fetch", f);
  const { unmount } = at("/gallery/a");
  await screen.findByRole("heading", { level: 1, name: "Work A" });
  await pinFirst();
  const signal = (txtCalls(f)[0][1] as RequestInit).signal!;
  expect(signal.aborted).toBe(false);
  unmount();
  expect(signal.aborted).toBe(true);
});

test("a text that fails to arrive says so quietly in the drawer and can be asked for again", async () => {
  let fail = true;
  const f = vi.fn(async (url: string) =>
    url.endsWith(".txt")
      ? fail
        ? new Response("", { status: 503 })
        : new Response(book)
      : file(url),
  );
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  await screen.findByRole("heading", { level: 1, name: "Work A" });
  const drawer = await pinFirst();
  expect(await within(drawer).findByText("The passage did not load.")).toBeInTheDocument();
  fail = false;
  await userEvent.click(within(drawer).getByRole("button", { name: "Try again" }));
  expect(await within(drawer).findByText(/^Passage number 0\./)).toBeInTheDocument();
  expect(txtCalls(f)).toHaveLength(2);
});

test.each([
  [
    "a mouse coming over the chart",
    (el: HTMLElement) => fireEvent.pointerEnter(el, { pointerType: "mouse" }),
  ],
  ["the keyboard reaching the chart", (el: HTMLElement) => fireEvent.focus(el)],
  [
    "a finger pressing on the chart",
    (el: HTMLElement) => fireEvent.pointerDown(el, { pointerType: "touch" }),
  ],
])("%s starts the text on its way before any pin", async (_, sign) => {
  const f = vi.fn(async (url: string) => (url.endsWith(".txt") ? new Response(book) : file(url)));
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  await screen.findByRole("heading", { level: 1, name: "Work A" });
  sign(screen.getByRole("group", { name: /Arc chart/ }));
  expect(txtCalls(f)).toHaveLength(1);
  expect(screen.queryByRole("region", { name: "Passage" })).toBeNull();
  const drawer = await pinFirst();
  expect(await within(drawer).findByText(/^Passage number 0\./)).toBeInTheDocument();
  expect(txtCalls(f)).toHaveLength(1);
});

test("a finger passing over the chart fetches nothing until it presses, and every later sign fetches nothing more", async () => {
  const f = vi.fn(async (url: string) => (url.endsWith(".txt") ? new Response(book) : file(url)));
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  await screen.findByRole("heading", { level: 1, name: "Work A" });
  const chart = screen.getByRole("group", { name: /Arc chart/ });
  fireEvent.pointerEnter(chart, { pointerType: "touch" });
  expect(txtCalls(f)).toHaveLength(0);
  fireEvent.pointerDown(chart, { pointerType: "touch" });
  fireEvent.pointerEnter(chart, { pointerType: "mouse" });
  fireEvent.focus(chart);
  const drawer = await pinFirst();
  expect(await within(drawer).findByText(/^Passage number 0\./)).toBeInTheDocument();
  expect(txtCalls(f)).toHaveLength(1);
});

// Each passage's answers as the gallery build keeps them: a score and its spread per layer, the events and the writing.
const answers = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [
    i,
    {
      scores: Object.fromEntries(AXES.map((ax) => [ax, { score: 2.37, sd: 0.64 }])),
      events: Object.fromEntries(EVENT_TYPES.map((e) => [e, 0.1])),
      mode: { choice: "dialogue", confidence: 0.9 },
    },
  ]),
);
const spreads = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>("[data-range]")).map((r) => r.style.width);
const answerCalls = (f: ReturnType<typeof vi.fn>) =>
  f.mock.calls.filter(([u]) => String(u) === "/gallery/answers/a.json");

test("the passages' own scores are fetched once, on the first sign a passage will be opened, and the drawer shows them", async () => {
  const f = vi.fn(async (url: string) =>
    url.endsWith(".txt")
      ? new Response(book)
      : url === "/gallery/answers/a.json"
        ? json(answers)
        : file(url),
  );
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  await screen.findByRole("heading", { level: 1, name: "Work A" });
  expect(answerCalls(f)).toHaveLength(0);
  const drawer = await pinFirst();
  expect(answerCalls(f)).toHaveLength(1);
  // A spread of 0.64 around 2.37 spans 1.73 to 3.01 of the bar's 4, 15.3 of its 48 px, once the bars have moved there.
  await waitFor(() => {
    expect(spreads(drawer)).toEqual(AXES.map(() => "15.3px"));
    expect(within(drawer).getAllByText("2.4")).toHaveLength(AXES.length);
  });
  expect(within(drawer).getByText("dialogue")).toBeInTheDocument();
  expect(within(drawer).queryByText("From the curve")).toBeNull();
  expect(document.querySelector("[data-summary]")).toHaveTextContent(/Fortune 2\.4 · pinned$/);
  await userEvent.keyboard("{ArrowRight}");
  expect(answerCalls(f)).toHaveLength(1);
});

test.each([
  ["fail to arrive", () => new Response("", { status: 404 })],
  ["arrive as a page instead", () => new Response("<!doctype html><title>x</title>")],
])("when the passages' scores %s the drawer reads the curve as before", async (_, reply) => {
  const f = vi.fn(async (url: string) =>
    url.endsWith(".txt") ? new Response(book) : url.includes("/answers/") ? reply() : file(url),
  );
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  await screen.findByRole("heading", { level: 1, name: "Work A" });
  const drawer = await pinFirst();
  expect(await within(drawer).findByText(/^Passage number 0\./)).toBeInTheDocument();
  expect(answerCalls(f)).toHaveLength(1);
  expect(within(drawer).getByText("From the curve")).toBeInTheDocument();
  expect(spreads(drawer)).toEqual([]);
  expect(screen.getByRole("heading", { level: 1, name: "Work A" })).toBeInTheDocument();
});

test("while the passages' scores are on their way the drawer keeps their place instead of reading the curve", async () => {
  let send: (r: Response) => void = () => {};
  const f = vi.fn((url: string) =>
    url.endsWith(".txt")
      ? Promise.resolve(new Response(book))
      : url === "/gallery/answers/a.json"
        ? new Promise<Response>((res) => {
            send = res;
          })
        : Promise.resolve(file(url)),
  );
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  await screen.findByRole("heading", { level: 1, name: "Work A" });
  const drawer = await pinFirst();
  expect(await within(drawer).findByText(/^Passage number 0\./)).toBeInTheDocument();
  expect(within(drawer).queryByText("From the curve")).toBeNull();
  expect(drawer.querySelectorAll("[data-bar]")).toHaveLength(AXES.length);
  expect(drawer.querySelector("[data-fill]")).toBeNull();
  expect(within(drawer).getAllByText("–")).toHaveLength(AXES.length + 1);
  expect(within(drawer).getByRole("button", { name: "What the range means" })).toBeInTheDocument();
  send(json(answers));
  // The bars move to their scores, so they are read once they have arrived.
  await waitFor(() => {
    expect(spreads(drawer)).toEqual(AXES.map(() => "15.3px"));
    expect(within(drawer).getAllByText("2.4")).toHaveLength(AXES.length);
  });
});

test("in this room links the works on either side in the family, by title, and the meta line offers a comparison", async () => {
  const entry = (slug: string, title: string, shape: string | null) => ({
    slug,
    title,
    author: "A",
    archetype: { state: shape ? "named" : "none", shape, caption: "", r: 0.8, margin: 0.2 },
  });
  const index = [
    entry("z", "Zuleika", null),
    entry("a", "Work A", null),
    entry("t", "Tragic", "fall"),
    entry("b", "The Bell", null),
  ];
  const f = vi.fn(async (url: string) =>
    url.endsWith(".txt") ? new Response(book) : json(url === "/gallery/index.json" ? index : work),
  );
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  const room = await screen.findByRole("navigation", { name: "In this room" });
  expect(
    within(room)
      .getAllByRole("link")
      .map((l) => l.getAttribute("href")),
  ).toEqual(["/gallery/b", "/gallery/z"]);
  expect(within(room).getByRole("link", { name: /The Bell/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Compare with another work/ })).toHaveAttribute(
    "href",
    "/compare?a=gallery:a",
  );
});

test("a gallery work offers its poster beside the compare link", async () => {
  // jsdom has no modal dialogs; opening one only needs to mark it open.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("/fonts/") ? new Response(new ArrayBuffer(8)) : file(url),
    ),
  );
  at("/gallery/a");
  const compare = await screen.findByRole("link", { name: /Compare with another work/ });
  const poster = within(compare.parentElement!).getByRole("button", { name: "Poster" });
  await userEvent.click(poster);
  const dialog = screen.getByRole("dialog", { name: "Poster" });
  expect(await previewSvg(dialog)).toContain(">Work A</text>");
});

test.each(["a%3Fx", "a%2Fb", "A", "a.b"])(
  "a slug outside the gallery's own form, such as %s, is not fetched and is not in the gallery",
  async (slug) => {
    const f = vi.fn(async (url: string) => file(url));
    vi.stubGlobal("fetch", f);
    at(`/gallery/${slug}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Not in the gallery" }),
    ).toBeInTheDocument();
    expect(f.mock.calls.map(([u]) => String(u))).not.toContainEqual(
      expect.stringMatching(/^\/gallery\/(?!index\.json)/),
    );
  },
);

test("without the gallery's index the page has no room row and still draws", async () => {
  const f = vi.fn(async (url: string) =>
    url === "/gallery/index.json" ? new Response("", { status: 500 }) : file(url),
  );
  vi.stubGlobal("fetch", f);
  at("/gallery/a");
  expect(await screen.findByRole("heading", { level: 1, name: "Work A" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "In this room" })).toBeNull();
});
