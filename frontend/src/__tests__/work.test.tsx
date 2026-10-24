import { act, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router";
import "fake-indexeddb/auto";
import Work from "../pages/Work";
import { metaOf } from "../lib/definitions";
import { xOf, yOf } from "../chart/ChartFrame";
import { beatSpans } from "../lib/bins";
import { ERRORS } from "../api/client";
import { loadLocal, saveLocal } from "../lib/local";
import type { Analysis, WorkView } from "../types";
import {
  blockIndexedDB,
  catchDownloads,
  fakeAnalysis,
  fakeAnswers,
  fakeStructure,
  fakeWork,
  json,
  readBlob,
  renderAt,
  serve,
} from "./fixtures";

test("a share call rejecting with not_kept shows its mapped message inline", async () => {
  serve({
    "/api/works/w1/share": () => json({ error: "not_kept", detail: {} }, 409),
    "/api/works/w1": () => json(fakeWork()),
  });
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  await userEvent.click(await screen.findByRole("button", { name: "Share link" }));
  await waitFor(() => expect(screen.getByText(ERRORS.not_kept)).toBeInTheDocument());
});

test("a work that cannot be loaded gets a heading, the reason in an alert, and a way back", async () => {
  serve({ "/api/works/w1": () => json({ error: "not_found" }, 404) });
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  expect(
    await screen.findByRole("heading", { level: 1, name: "Could not load this work" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toContainElement(screen.getByRole("heading", { level: 1 }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "It may have expired, been deleted, or not have loaded. Try again in a moment.",
  );
  expect(screen.getByRole("link", { name: "Back to the gallery" })).toHaveAttribute("href", "/");
});

const structure = fakeStructure(4, 2);

// Renders the page with the given analysis (text comes from the local store), selects passage 1, and
// reports the paragraphs that carry the driver highlight.
async function highlighted(analysis: Analysis): Promise<(string | null | undefined)[]> {
  serve({ "/api/works/w1": () => json(fakeWork({ structure, analysis })) });
  const { unmount } = renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  fireEvent.keyDown(await screen.findByLabelText(/arrow keys to move between passages/i), {
    key: "ArrowRight",
  });
  await screen.findByText("Second one.");
  expect(screen.getByRole("region", { name: "Passage" })).toBeInTheDocument();
  const lit = Array.from(document.querySelectorAll("[data-driver]")).map(
    (el) => el.lastChild?.textContent,
  );
  unmount();
  return lit;
}

// The gate itself is covered with the viewer; here the text comes from this device's store.
test("Work opens the passage text saved on this device and underlines its driver", async () => {
  await saveLocal({
    id: "w1",
    title: "T",
    author: "A",
    text: "First para.\n\nSecond one.\n\nThird here.",
    structure,
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  expect(
    await highlighted({
      ...fakeAnalysis(),
      drivers: { fortune: { "0": { paragraph_idx: 1, paragraph_end_idx: 1, confidence: 0.7 } } },
      driver_gate: 0.7,
    }),
  ).toEqual(["Second one."]);
});

test("a work whose text was discarded says so when a passage opens", async () => {
  await saveLocal({
    id: "w1",
    title: "T",
    author: "A",
    text: "",
    structure,
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  serve({ "/api/works/w1": () => json(fakeWork({ structure, analysis: fakeAnalysis() })) });
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  const chart = await screen.findByLabelText(/arrow keys to move between passages/i);
  await waitFor(() => {
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByText(/The text was not saved/)).toBeInTheDocument();
  });
});

test("a finished private work shows its shape card and a quiet row of actions, Keep first and Delete last", async () => {
  await saveLocal({
    id: "w1",
    title: "T",
    author: "A",
    text: "the whole book",
    structure,
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  serve({
    "/api/works/w1": () =>
      json(
        fakeWork({
          kept: false,
          expires_at: "2099-01-01T00:00:00Z",
          structure,
          analysis: fakeAnalysis(),
        }),
      ),
  });
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  expect(
    (await screen.findAllByRole("complementary", { name: "Story shape" }))[0],
  ).toBeInTheDocument();
  expect(
    screen.getByText(/^Private, and deleted in [\d,]+ days unless you keep it\.$/),
  ).toBeInTheDocument();
  const row = screen.getByRole("button", { name: "Keep" }).parentElement!;
  expect(
    within(row)
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["Keep", "Export results", "Export with text", "Poster", "Delete"]);
});

test("the meta line names a transcript, the kind warning, the model and the question set", () => {
  const w = fakeWork({
    structure: { ...structure, preset: "transcript" },
    kind_warning: "poetry_or_lyrics",
  });
  expect(metaOf(w)).toBe(
    "100 words · 2 chapters · analyzed in 4 passages · transcript · poetry or lyrics: arcs may be less meaningful · m · v1",
  );
  expect(metaOf({ word_count: 100, structure })).toBe(
    "100 words · 2 chapters · analyzed in 4 passages",
  );
});

test("an own work's meta line says what it cost after the passages, and a copy without the figure says nothing", () => {
  const w = { word_count: 100, structure };
  expect(metaOf({ ...w, cost_usd: 0.02, model_id: "m" }, true)).toBe(
    "100 words · 2 chapters · analyzed in 4 passages · about $0.02 · m",
  );
  expect(metaOf({ ...w, cost_usd: 1.5 }, true)).toMatch(/passages · about \$1\.50$/);
  expect(metaOf(w, true)).not.toMatch(/\$/);
  expect(metaOf({ ...w, cost_usd: 0.02 })).not.toMatch(/\$/);
});

// Mounts a work that is not finished; the event stream is stubbed so nothing connects.
async function mountUnfinished(over: Partial<WorkView>) {
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
  serve({
    "/api/works/w1": () =>
      json(fakeWork({ kept: false, structure: fakeStructure(12, 3), ...over })),
  });
  return renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
}

test("while running, the frame shows the axes and the progress sentence", async () => {
  const st = fakeStructure(12, 3);
  await saveLocal({
    id: "w1",
    title: "T",
    author: "A",
    text: "",
    structure: st,
    analysis: null,
    answers: { 0: fakeAnswers(), 1: fakeAnswers(), 2: fakeAnswers() },
    savedAt: 1,
  });
  const { container } = await mountUnfinished({ state: "running", done: 3, total: 12 });
  expect(await screen.findByText("Passage 3 of 12")).toBeInTheDocument();
  expect(screen.getByText(/beginning/)).toBeInTheDocument();
  expect(screen.getByText("good")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  // Nothing to export until there are results.
  expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
  const bar = screen.getByRole("progressbar", { name: "Analysis progress" });
  expect([
    bar.getAttribute("aria-valuenow"),
    bar.getAttribute("aria-valuemin"),
    bar.getAttribute("aria-valuemax"),
  ]).toEqual(["3", "0", "12"]);
  expect(container.querySelectorAll("[data-chapter-tick]").length).toBe(3);
  await waitFor(() =>
    expect(
      container.querySelectorAll("svg[aria-label='Fortune so far'] circle:not([data-ring])").length,
    ).toBe(3),
  );
  // The first dot sits at the middle of the first passage on the chart's own x and y mapping.
  const spans = beatSpans(st),
    dot = container.querySelector("svg[aria-label='Fortune so far'] circle")!;
  expect(Number(dot.getAttribute("cx"))).toBeCloseTo(
    xOf(((spans[0][0] + spans[0][1]) / 2 / spans[11][1]) * 100 - 0.5),
  );
  expect(Number(dot.getAttribute("cy"))).toBeCloseTo(yOf(2.1));
});

test("a queued work names its place in the queue and hides the passage count", async () => {
  await mountUnfinished({ state: "queued", done: 0, total: 12, queue_position: 2 });
  expect(await screen.findByText("Position 2 in the queue")).toBeInTheDocument();
  expect(screen.queryByText(/of 12/)).not.toBeInTheDocument();
});

test("a paused work drops the time estimate and names the rate limit", async () => {
  await mountUnfinished({ state: "paused", done: 3, total: 12 });
  expect(
    await screen.findByText("Passage 3 of 12 · waiting for your TypeSafe rate limit"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/s left/)).not.toBeInTheDocument();
});

test("a paused work with nothing done yet starts its note with a capital", async () => {
  await mountUnfinished({ state: "paused", done: 0, total: 12 });
  expect(await screen.findByText("Waiting for your TypeSafe rate limit")).toBeInTheDocument();
});

test("a work with passages left unscored says Resume tries them again", async () => {
  await mountUnfinished({ state: "failed", error: "unscored_passages", done: 12, total: 12 });
  expect(
    await screen.findByText(
      "Some passages could not be scored. Resume tries them once more and, if they fail again, finishes without them.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
});

test("the Resume key field starts empty and asks the browser not to save it", async () => {
  sessionStorage.setItem("sos.key", "sk-old-1234");
  localStorage.setItem("sos.key", "sk-old-1234");
  await mountUnfinished({ state: "failed", error: "key_rejected", done: 3, total: 12 });
  const field = await screen.findByLabelText("TypeSafe key");
  expect(field).toHaveValue("");
  expect(field).toHaveAttribute("type", "password");
  expect(field).toHaveAttribute("autocomplete", "off");
});

test.each(["internal", "text_or_key_missing", "constructor", "__proto__"])(
  "a failure code without words of its own, such as %s, says the server failed and keeps the code out of the copy",
  async (code) => {
    await mountUnfinished({ state: "failed", error: code, done: 3, total: 12 });
    expect(
      await screen.findByText("Something went wrong on the server; Resume or start again."),
    ).toHaveAttribute("data-code", code);
  },
);

test("a run still waiting for its model shows an ellipsis in the model's place", async () => {
  await mountUnfinished({ state: "queued", model_id: null, done: 0, total: 12 });
  expect(await screen.findByText(/ · … · /)).toBeInTheDocument();
});

test("a work the server does not have opens from this browser's copy and says where it lives", async () => {
  await saveLocal({
    id: "w1",
    title: "Kept Here",
    author: "A",
    text: "First para.",
    structure,
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 1,
    cost_usd: 0.04,
  });
  serve({ "/api/works/w1": () => json({ error: "not_found" }, 404) });
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  expect(await screen.findByRole("heading", { level: 1, name: "Kept Here" })).toBeInTheDocument();
  expect(screen.getByText("This copy lives only in this browser.")).toBeInTheDocument();
  // The copy is the reader's own, so it shows its cost, and waits for no model.
  expect(screen.getByText(/passages · about \$0\.04$/)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  // A copy saved before results carried their question set counts as earlier.
  expect(
    screen.getByText(
      "Scored with an earlier set of questions; uploading the text again scores it with the current set.",
    ),
  ).toBeInTheDocument();
});

// Serves one finished work, and answers a delete with 204.
function serveWork(over: Partial<WorkView> = {}) {
  serve({
    "/api/works/w1": (init) =>
      init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : json(fakeWork({ structure, analysis: fakeAnalysis(), ...over })),
  });
  return renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
      <Route path="/my" element={<p>my works page</p>} />
    </Routes>,
    "/works/w1",
  );
}

test("the two export buttons save the results without and with the text, under a safe file name", async () => {
  await saveLocal({
    id: "w1",
    title: "T",
    author: "A",
    text: "the whole book",
    structure,
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  const downloads = catchDownloads();
  serveWork({ title: "Act I/II" });
  await userEvent.click(await screen.findByRole("button", { name: "Export results" }));
  await userEvent.click(screen.getByRole("button", { name: "Export with text" }));
  expect(downloads.map((d) => d.name)).toEqual(["Act I_II.shapes.json", "Act I_II.shapes.json"]);
  expect(JSON.parse(await readBlob(downloads[0].blob)).text).toBe("");
  expect(JSON.parse(await readBlob(downloads[1].blob)).text).toBe("the whole book");
});

test("without the text on this device there is nothing to export with it", async () => {
  await saveLocal({
    id: "w1",
    title: "T",
    author: "A",
    text: "",
    structure,
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  serveWork();
  expect(await screen.findByRole("button", { name: "Export results" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Export with text" })).toBeNull();
});

test("deleting a work removes this browser's copy and goes on to my works", async () => {
  await saveLocal({
    id: "w1",
    title: "T",
    author: "A",
    text: "",
    structure,
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  vi.stubGlobal("confirm", () => true);
  serveWork();
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  expect(await screen.findByText("my works page")).toBeInTheDocument();
  expect(await loadLocal("w1")).toBeUndefined();
});

test("a delete the server took is not reported as failed when this browser's copy cannot be removed", async () => {
  blockIndexedDB();
  vi.stubGlobal("confirm", () => true);
  serveWork();
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  expect(await screen.findByText("my works page")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

// Serves one kept, finished work whose live share link (or none) the server holds, recording every call.
function serveShared(initial: string | null) {
  let token = initial;
  const fetch = serve({
    "/api/works/w1/share": (init) => {
      if (init?.method === "DELETE") {
        token = null;
        return new Response(null, { status: 204 });
      }
      if (init?.method === "POST") token ??= "NEWtoken_0123456789abcd";
      return json({ token });
    },
    "/api/works/w1": () => json(fakeWork({ structure, analysis: fakeAnalysis() })),
  });
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  return () => fetch.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
}

test("a private work says in plain words when it is deleted unless kept", async () => {
  serve({
    "/api/works/w1": () =>
      json(
        fakeWork({
          kept: false,
          expires_at: new Date(Date.now() + 23 * 3600_000 + 60_000).toISOString(),
          structure,
          analysis: fakeAnalysis(),
        }),
      ),
  });
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  expect(
    await screen.findByText("Private, and deleted in 23 hours unless you keep it."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Share link" })).toBeNull();
});

test("the time left is said again every minute, and the clock stops when the page goes", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-04T06:00:00Z"));
  serve({
    "/api/works/w1": () =>
      json(
        fakeWork({
          kept: false,
          expires_at: "2026-10-05T05:00:00Z",
          structure,
          analysis: fakeAnalysis(),
        }),
      ),
  });
  const { unmount } = renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
    </Routes>,
    "/works/w1",
  );
  expect(
    await screen.findByText("Private, and deleted in 23 hours unless you keep it."),
  ).toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(61 * 60_000));
  expect(screen.getByText("Private, and deleted in 22 hours unless you keep it.")).toBeVisible();
  await act(() => vi.advanceTimersByTimeAsync((21 * 60 + 29) * 60_000));
  expect(screen.getByText("Private, and deleted in 30 minutes unless you keep it.")).toBeVisible();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test("each action shows its icon", async () => {
  serveShared(null);
  for (const name of ["Share link", "Export results", "Poster"])
    expect((await screen.findByRole("button", { name })).querySelector("svg")).toHaveAttribute(
      "viewBox",
      "0 0 24 24",
    );
});

test("a kept work offers a share link; sharing shows the link with Copy and Stop sharing", async () => {
  const calls = serveShared(null);
  expect(await screen.findByText("Kept on this server until you delete it.")).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: "Share link" }));
  const field = await screen.findByRole("textbox", { name: "Share link" });
  expect(field).toHaveValue(`${location.origin}/shared/NEWtoken_0123456789abcd`);
  expect(field).toHaveAttribute("readonly");
  expect(
    screen.getByText(/^Shared: anyone with the link .* never your text\.$/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Share link" })).toBeNull();
  expect(calls()).toContain("POST /api/works/w1/share");
});

test("a reload shows the link already shared instead of offering a new one", async () => {
  const calls = serveShared("LIVEtoken_0123456789abc");
  expect(await screen.findByRole("textbox", { name: "Share link" })).toHaveValue(
    `${location.origin}/shared/LIVEtoken_0123456789abc`,
  );
  expect(calls()).not.toContain("POST /api/works/w1/share");
});

test("Copy writes the link to the clipboard and says so politely", async () => {
  serveShared("LIVEtoken_0123456789abc");
  const writeText = vi.fn(async () => {});
  // user-event installs its own clipboard on setup, so the stub goes in after it.
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  await user.click(await screen.findByRole("button", { name: "Copy" }));
  expect(writeText).toHaveBeenCalledWith(`${location.origin}/shared/LIVEtoken_0123456789abc`);
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");
});

test("without the Clipboard API, Copy selects the link for the keyboard", async () => {
  serveShared("LIVEtoken_0123456789abc");
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  const field = (await screen.findByRole("textbox", { name: "Share link" })) as HTMLInputElement;
  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
  expect(screen.getByRole("status")).toHaveTextContent("Link selected");
});

test("Stop sharing asks first, then kills the link and offers a new one", async () => {
  const calls = serveShared("LIVEtoken_0123456789abc");
  const ask = vi.fn(() => false);
  vi.stubGlobal("confirm", ask);
  await userEvent.click(await screen.findByRole("button", { name: "Stop sharing" }));
  expect(ask).toHaveBeenCalled();
  expect(calls().some((c) => c.startsWith("DELETE"))).toBe(false);
  ask.mockReturnValue(true);
  await userEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
  expect(await screen.findByRole("button", { name: "Share link" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Share link" })).toBeNull();
  expect(calls()).toContain("DELETE /api/works/w1/share");
});

test("a work still running offers neither Keep nor Share", async () => {
  await mountUnfinished({ state: "running", done: 3, total: 12 });
  expect(await screen.findByText("Private.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Keep" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Share link" })).toBeNull();
});

test("a canceled run says how far it got and Start again deletes it on the way to a fresh one", async () => {
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
  const methods: string[] = [];
  serve({
    "/api/works/w1": (init) => {
      methods.push(init?.method ?? "GET");
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : json(
            fakeWork({
              kept: false,
              state: "cancelled",
              done: 3,
              total: 12,
              analysis: null,
              structure: fakeStructure(12, 3),
            }),
          );
    },
  });
  renderAt(
    <Routes>
      <Route path="/works/:id" element={<Work />} />
      <Route path="/import" element={<h1>Analyze a book</h1>} />
    </Routes>,
    "/works/w1",
  );
  expect(
    await screen.findByText("Canceled after 3 of 12 passages; nothing was kept."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /export|cancel/i })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Start again" }));
  expect(await screen.findByRole("heading", { name: "Analyze a book" })).toBeInTheDocument();
  expect(methods).toContain("DELETE");
});
