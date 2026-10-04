import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import Import from "../pages/Import";
import { ApiError, errorMessage } from "../api/client";
import { deleteLocal, listLocal, loadLocal, saveLocal } from "../lib/local";
import { version } from "../../public/questions.json";
import type { Preview } from "../types";
import "fake-indexeddb/auto";
import {
  blockIndexedDB,
  blockStorage,
  fakeAnalysis,
  fakePreview,
  fakeStructure,
  json,
  serve,
} from "./fixtures";

function mockApi({
  preview = () => json(fakePreview()),
  works = () => json({ work_id: "w1", structure: {} }),
}: { preview?: () => Response; works?: () => Response } = {}) {
  serve({ "/api/preview": preview, "/api/works": works });
}
async function previewOf(text = "some text") {
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), text);
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
}

// A copy one test's run saves would otherwise match the next test's text, since an unfinished run counts too.
beforeEach(async () => {
  for (const w of await listLocal()) await deleteLocal(w.id);
});

test("rate_limited copy branches on the bucket in detail; falls back to a neutral sentence otherwise", () => {
  expect(errorMessage(new ApiError(429, "rate_limited", { bucket: "uploads", max: 20 }))).toMatch(
    /upload/i,
  );
  expect(errorMessage(new ApiError(429, "rate_limited", { bucket: "analyses", max: 3 }))).toMatch(
    /analys/i,
  );
  expect(errorMessage(new ApiError(429, "rate_limited", { bucket: "keycheck", max: 30 }))).toMatch(
    /key check/i,
  );
  expect(errorMessage(new ApiError(429, "rate_limited", {}))).toBe(
    "Too many requests for now. Try again later.",
  );
});

test("preview shows estimate and blocks analyze without key", async () => {
  mockApi({
    preview: () => json(fakePreview({ stripped: [{ label: "front matter", word_count: 50 }] })),
  });
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.click(screen.getByText(/preview/i));
  await waitFor(() => expect(screen.getByText(/About 112 passages/)).toBeInTheDocument());
  expect(screen.getByText(/About 112 passages/)).toHaveTextContent(
    "About 112 passages, roughly $0.03 of your TypeSafe usage, about 18 seconds.",
  );
  expect(screen.getByText(/front matter/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^analyze$/i })).toBeDisabled();
});

test("editing the input after Preview clears the stale preview", async () => {
  mockApi();
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.click(screen.getByText(/preview/i));
  await waitFor(() => expect(screen.getByText(/About 112 passages/)).toBeInTheDocument());
  await userEvent.type(screen.getByLabelText(/paste text/i), " more");
  expect(screen.queryByText(/About 112 passages/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^analyze$/i })).toBeDisabled();
});

test("a preview that answers after the input changed is not shown for the new input", async () => {
  let answer: (r: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/api/preview")
        ? new Promise<Response>((r) => (answer = r))
        : Promise.resolve(json([])),
    ),
  );
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  await userEvent.type(screen.getByLabelText(/paste text/i), " more");
  answer(json(fakePreview()));
  await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled());
  expect(screen.queryByText(/About 112 passages/)).not.toBeInTheDocument();
});

test("the import page is one column with a drop zone, the estimate in words, and a single filled button", async () => {
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/analyze a book/i);
  expect(screen.getByText(/drop a book here, or paste/i)).toBeInTheDocument();
  expect(
    screen.getByText("txt, md, epub, docx, Fountain screenplay, srt or vtt subtitles"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^analyze$/i })).toBeInTheDocument();
});

test("the estimate counts seconds under ninety and rounds to minutes beyond", async () => {
  mockApi({
    preview: () => json(fakePreview({ estimate: { ...fakePreview().estimate, seconds: 150 } })),
  });
  await previewOf();
  expect(await screen.findByText(/About 112 passages/)).toHaveTextContent(
    /^About \d+ passages, roughly \$\d+\.\d\d of your TypeSafe usage, about 3 minutes\.$/,
  );
});

test("the preview card lists author, words, chapters, skipped parts, kind and language", async () => {
  mockApi({
    preview: () =>
      json(
        fakePreview({
          stripped: [{ label: "front matter", word_count: 50 }],
          chapters: [{}, {}] as Preview["chapters"],
        }),
      ),
  });
  await previewOf();
  await screen.findByText(/About 112 passages/);
  const terms = [...document.querySelectorAll("dt")].map((d) => [
    d.textContent,
    d.nextElementSibling?.textContent,
  ]);
  expect(terms).toEqual([
    ["Author", "A"],
    ["Words", (90000).toLocaleString()],
    ["Chapters detected", "2"],
    ["Skipped parts", "front matter (50 words)"],
    ["Kind", "prose (TXT)"],
    ["Language", "English"],
  ]);
});

test("the preview card leaves out rows that have no value", async () => {
  mockApi({ preview: () => json(fakePreview({ author: null, stripped: [] })) });
  await previewOf();
  await screen.findByText(/About 112 passages/);
  const terms = [...document.querySelectorAll("dt")].map((d) => d.textContent);
  expect(terms).toEqual(["Words", "Chapters detected", "Kind", "Language"]);
});

// Whether the empty region stays in the accessibility tree is CSS, which only a browser can show.
test("the preview card arrives inside a live region that was already in the page", async () => {
  mockApi();
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  const region = document.querySelector("[aria-live=polite]")!;
  expect(region).toBeEmptyDOMElement();
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  await waitFor(() => expect(region).toHaveTextContent(/About 112 passages/));
  expect(region).toContainElement(screen.getByRole("heading", { level: 2, name: "T" }));
  expect(document.querySelector("[aria-live=polite]")).toBe(region);
});

test("the key field, its link and the privacy choice are labeled controls", async () => {
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  expect(screen.getByLabelText("TypeSafe API key")).toHaveAttribute("type", "password");
  expect(
    screen.getByText(/goes to TypeSafe once per analysis and is held only while the analysis runs/),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "your TypeSafe console" })).toHaveAttribute(
    "href",
    "https://console.typesafe.ai",
  );
  expect(screen.queryByRole("checkbox", { name: /remember/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Forget the key" })).toBeNull();
  const choice = screen.getByRole("group", { name: /after the analysis/i });
  const [keep, discard] = within(choice).getAllByRole("radio");
  expect(keep).toHaveAccessibleName(/save the text in this browser/i);
  expect(keep).toBeChecked();
  expect(discard).toHaveAccessibleName(/discard the text/i);
  expect(discard).not.toBeChecked();
  await userEvent.click(discard);
  expect(keep).not.toBeChecked();
  expect(discard).toBeChecked();
});

test.each([
  [/save the text/i, "x"],
  [/discard the text/i, ""],
])(
  "analyzing with the choice %s saves the passage text %j on this device",
  async (choice, saved) => {
    mockApi();
    await previewOf();
    await screen.findByText(/About 112 passages/);
    await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
    await userEvent.click(screen.getByRole("radio", { name: choice }));
    await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    await waitFor(async () => expect((await loadLocal("w1"))?.text).toBe(saved));
  },
);

test("a preview error sits under the input, an analysis error under the key, both in the existing wording", async () => {
  mockApi({ preview: () => json({ error: "not_english", detail: {} }, 422) });
  await previewOf();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This looks like it isn't in English. Only English texts can be analyzed.",
  );
  expect(
    screen.getByLabelText(/paste text/i).compareDocumentPosition(screen.getByRole("alert")),
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  cleanup();

  mockApi({ works: () => json({ error: "limit_session_running", detail: {} }, 429) });
  await previewOf();
  await screen.findByText(/About 112 passages/);
  const key = screen.getByLabelText("TypeSafe API key");
  await userEvent.type(key, "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "Two analyses are already running for you. Wait for one to finish.",
  );
  expect(key.compareDocumentPosition(alert)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

test("with site data blocked the page still draws, with the key field empty", () => {
  blockStorage();
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/analyze a book/i);
  expect(screen.getByLabelText("TypeSafe API key")).toHaveValue("");
});

test("when this device's store fails after the analysis has started, the page still goes on to the work and offers no second run", async () => {
  mockApi();
  render(
    <MemoryRouter initialEntries={["/import"]}>
      <Routes>
        <Route path="/import" element={<Import />} />
        <Route path="/works/:id" element={<p>the work page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  await screen.findByText(/About 112 passages/);
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  blockIndexedDB();
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  expect(await screen.findByText("the work page")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the device copy saved when the analysis starts names the current question set", async () => {
  mockApi();
  render(
    <MemoryRouter initialEntries={["/import"]}>
      <Routes>
        <Route path="/import" element={<Import />} />
        <Route path="/works/:id" element={<p>the work page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  await screen.findByText(/About 112 passages/);
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  expect(await screen.findByText("the work page")).toBeInTheDocument();
  expect((await loadLocal("w1"))?.question_set_version).toBe(version);
});

test("choosing a file clears the pasted text and names the file, and the same file can be chosen again after an edit", async () => {
  mockApi();
  const user = userEvent.setup();
  const { container } = render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  const box = screen.getByLabelText(/paste text/i),
    picker = container.querySelector("input[type=file]") as HTMLInputElement;
  const file = new File(["a book"], "book.txt", { type: "text/plain" });
  await user.type(box, "pasted");
  await user.upload(picker, file);
  expect(box).toHaveValue("");
  expect(screen.getByText("book.txt")).toBeInTheDocument();
  await user.type(box, "x");
  expect(screen.queryByText("book.txt")).toBeNull();
  await user.upload(picker, file);
  expect(screen.getByText("book.txt")).toBeInTheDocument();
  expect(box).toHaveValue("");
});

test.each([
  [{ ok: true, last4: "1234" }, "Key works (…1234)"],
  [{ ok: false, error: "key_rejected" }, "Key rejected"],
  [{ ok: false, error: "rate_limited" }, "TypeSafe is rate-limiting this key; try again shortly"],
  [{ ok: false, error: "unavailable" }, "Could not check"],
])("testing the key with the answer %j says %j", async (reply, said) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => json(url.endsWith("/api/key/check") ? reply : [])),
  );
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: "Test key" }));
  expect(await screen.findByText(said)).toBeInTheDocument();
});

test("a key check that answers after the key was edited says nothing under the new key", async () => {
  let answer: (r: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/api/key/check")
        ? new Promise<Response>((r) => (answer = r))
        : Promise.resolve(json([])),
    ),
  );
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  const field = screen.getByLabelText("TypeSafe API key");
  await userEvent.type(field, "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: "Test key" }));
  await userEvent.type(field, "9");
  await act(async () => answer(json({ ok: true, last4: "5678" })));
  expect(screen.queryByText(/Key works/)).toBeNull();
});

test("the key is never written to this browser's storage, and a new page starts without it", async () => {
  mockApi();
  await previewOf();
  await screen.findByText(/About 112 passages/);
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  await waitFor(async () => expect(await loadLocal("w1")).toBeDefined());
  for (const store of [localStorage, sessionStorage])
    for (let i = 0; i < store.length; i++)
      expect(store.getItem(store.key(i)!)).not.toContain("sk-12345678");
  cleanup();
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  expect(screen.getByLabelText("TypeSafe API key")).toHaveValue("");
});

describe("a text analyzed on this device before", () => {
  const saved = (over: object) =>
    saveLocal({
      id: "old",
      title: "T",
      author: "A",
      text: "",
      structure: fakeStructure(),
      analysis: fakeAnalysis(),
      answers: {},
      savedAt: new Date(2026, 8, 14).getTime(),
      ...over,
    });

  test("opens the newest copy from the preview card as the main action, with no Analyze to press", async () => {
    await saved({ content_hash: "h" });
    await saved({ id: "newer", content_hash: "h", savedAt: new Date(2026, 8, 20).getTime() });
    mockApi();
    await previewOf();
    expect(await screen.findByText(/You analyzed this text on/)).toHaveTextContent(
      `You analyzed this text on ${new Date(2026, 8, 20).toLocaleDateString(undefined, { dateStyle: "long" })}.`,
    );
    const open = screen.getByRole("link", { name: "Open your analysis →" });
    expect(open).toHaveAttribute("href", "/works/newer");
    expect(screen.getByText(/To analyze it afresh, delete this copy in/)).toContainElement(
      screen.getByRole("link", { name: "My works" }),
    );
    expect(screen.getByRole("link", { name: "My works" })).toHaveAttribute("href", "/my");
    await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
    expect(screen.queryByRole("button", { name: /analyze/i })).toBeNull();
    // A preview asked for by its own button leaves focus where the reader put it.
    expect(open).not.toHaveFocus();
  });

  test("changing the text clears the card and brings Analyze back", async () => {
    await saved({ content_hash: "h" });
    mockApi();
    await previewOf();
    await screen.findByRole("link", { name: "Open your analysis →" });
    await userEvent.type(screen.getByLabelText(/paste text/i), " more");
    expect(screen.queryByRole("link", { name: "Open your analysis →" })).toBeNull();
    expect(screen.getByRole("button", { name: /^analyze$/i })).toBeInTheDocument();
  });

  test("is found by the hash of its stored text when it was saved without one", async () => {
    await saved({ text: "x" });
    // sha256 of "x".
    mockApi({
      preview: () =>
        json(
          fakePreview({
            content_hash: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
          }),
        ),
    });
    await previewOf();
    expect(await screen.findByText(/You analyzed this text on/)).toBeInTheDocument();
  });

  test("is not claimed for another text", async () => {
    await saved({ content_hash: "other" });
    mockApi();
    await previewOf();
    await screen.findByText(/About 112 passages/);
    expect(screen.queryByText(/You analyzed this text/)).toBeNull();
    expect(screen.getByRole("button", { name: /^analyze$/i })).toBeInTheDocument();
  });

  test("counts a run without results yet, which the card offers to open", async () => {
    await saved({ content_hash: "h", analysis: null });
    mockApi();
    await previewOf();
    expect(await screen.findByText(/You started an analysis of this text on/)).toHaveTextContent(
      `You started an analysis of this text on ${new Date(2026, 8, 14).toLocaleDateString(undefined, { dateStyle: "long" })}.`,
    );
    expect(screen.getByRole("link", { name: "Open it →" })).toHaveAttribute("href", "/works/old");
    expect(screen.getByText(/To analyze it afresh/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
    expect(screen.queryByRole("button", { name: /analyze/i })).toBeNull();
  });

  test("keeps the hash it worked out, so the stored text is hashed only once", async () => {
    await saved({ text: "x" });
    mockApi();
    await previewOf();
    await screen.findByText(/About 112 passages/);
    expect((await loadLocal("old"))?.content_hash).toBe(
      "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
    );
  });

  test("without crypto.subtle, older copies are skipped and a hashed one is still found", async () => {
    await saved({ content_hash: "h" });
    await saveLocal({
      ...(await loadLocal("old"))!,
      id: "older",
      text: "x",
      content_hash: undefined,
      savedAt: 2e12,
    });
    vi.stubGlobal("crypto", {});
    mockApi();
    await previewOf();
    expect(await screen.findByText(/You analyzed this text on/)).toBeInTheDocument();
    expect((await loadLocal("older"))?.content_hash).toBeUndefined();
  });

  test("Analyze taking its own preview stops at the card and runs nothing", async () => {
    await saved({ content_hash: "h" });
    mockApi();
    render(
      <MemoryRouter>
        <Import />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
    await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
    await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    const open = await screen.findByRole("link", { name: "Open your analysis →" });
    await waitFor(() => expect(open).toHaveFocus());
    expect(
      screen.getByText(/You analyzed this text on/).closest("[aria-live=polite]"),
    ).not.toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).endsWith("/api/works"))).toBe(false);
    expect(screen.queryByRole("button", { name: /analyze/i })).toBeNull();
  });
});

test("Analyze taking its own preview of a gallery book stops at a link to the gallery work", async () => {
  const works = vi.fn(() => json({ work_id: "w1", structure: {} }));
  serve({
    "/api/preview": () => json(fakePreview()),
    "/api/works": works,
    "/gallery/index.json": () => json([{ slug: "t", content_hash: "h" }]),
  });
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  expect(await screen.findByText("This book already hangs in the gallery.")).toBeInTheDocument();
  const open = screen.getByRole("link", { name: "Open it in the gallery →" });
  expect(open).toHaveAttribute("href", "/gallery/t");
  await waitFor(() => expect(open).toHaveFocus());
  expect(
    screen.getByText("This book already hangs in the gallery.").closest("[aria-live=polite]"),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: /analyze/i })).toBeNull();
  expect(screen.queryByText(/To analyze it afresh/)).toBeNull();
  expect(works).not.toHaveBeenCalled();
});

test("Analyze taking its own preview waits briefly for a gallery index still on its way", async () => {
  const works = vi.fn(() => json({ work_id: "w1", structure: {} }));
  let arrive = (_: Response) => {};
  serve({
    "/api/preview": () => json(fakePreview()),
    "/api/works": works,
    "/gallery/index.json": () => new Promise<Response>((r) => (arrive = r)),
  });
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  arrive(json([{ slug: "t", content_hash: "h" }]));
  expect(await screen.findByText("This book already hangs in the gallery.")).toBeInTheDocument();
  expect(works).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /analyze/i })).toBeNull();
});

test("a pasted key loses the spaces around it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json([])),
  );
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  const field = screen.getByLabelText("TypeSafe API key");
  await userEvent.click(field);
  await userEvent.paste("  sk-12345678\n");
  expect(field).toHaveValue("sk-12345678");
  expect(screen.getByRole("button", { name: "Test key" })).toBeEnabled();
});

test("the device copy keeps the preview's hash of the text", async () => {
  mockApi();
  await previewOf();
  await screen.findByText(/About 112 passages/);
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  await waitFor(async () => expect((await loadLocal("w1"))?.content_hash).toBe("h"));
});

test("Analyze without a preview takes the preview itself, shows the cost line and starts the run", async () => {
  mockApi();
  render(
    <MemoryRouter initialEntries={["/import"]}>
      <Routes>
        <Route path="/import" element={<Import />} />
        <Route path="/works/:id" element={<p>the work page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  const analyze = screen.getByRole("button", { name: /^analyze$/i });
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  expect(analyze).toBeDisabled();
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  expect(analyze).toBeEnabled();
  await userEvent.click(analyze);
  expect(await screen.findByText("the work page")).toBeInTheDocument();
  const calls = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
  expect(calls.findIndex((u) => u.endsWith("/api/preview"))).toBeLessThan(
    calls.findIndex((u) => u.endsWith("/api/works")),
  );
  expect((await loadLocal("w1"))?.content_hash).toBe("h");
});

test("a failed preview taken by Analyze stops there and says why under the input", async () => {
  mockApi({ preview: () => json({ error: "not_english", detail: {} }, 422) });
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/paste text/i), "some text");
  await userEvent.type(screen.getByLabelText("TypeSafe API key"), "sk-12345678");
  await userEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/isn't in English/);
  expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).endsWith("/api/works"))).toBe(false);
});

test.each([
  ["", false, false],
  ["short", false, true],
  ["sk 123456789", false, true],
  ["sk-12345678", true, false],
])(
  "with the key %j, Test key is enabled: %s, and the field says what a key looks like: %s",
  async (typed, enabled, hint) => {
    render(
      <MemoryRouter>
        <Import />
      </MemoryRouter>,
    );
    const field = screen.getByLabelText("TypeSafe API key");
    // Pasted, as keys are; a space typed at the end is trimmed away at once.
    await userEvent.click(field);
    if (typed) await userEvent.paste(typed);
    const test = screen.getByRole("button", { name: "Test key" });
    if (enabled) expect(test).toBeEnabled();
    else expect(test).toBeDisabled();
    expect(screen.getByRole("button", { name: /^analyze$/i })).toBeDisabled();
    const said = screen.queryByText("A key has no spaces and at least 8 characters.");
    expect(!!said).toBe(hint);
    expect(field).toHaveAttribute("aria-invalid", String(hint));
    if (said) expect(field).toHaveAccessibleDescription(said.textContent!);
  },
);

test("Test key sits in the key field's row, right of the input, and its answer shows under the field", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      json(url.endsWith("/api/key/check") ? { ok: true, last4: "5678" } : []),
    ),
  );
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>,
  );
  const field = screen.getByLabelText("TypeSafe API key"),
    test = screen.getByRole("button", { name: "Test key" });
  expect(test.parentElement).toBe(field.parentElement);
  expect(field.compareDocumentPosition(test)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  await userEvent.type(field, "sk-12345678");
  await userEvent.click(test);
  const said = await screen.findByText("Key works (…5678)");
  expect(said).toHaveAttribute("role", "status");
  expect(field.parentElement!.compareDocumentPosition(said)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(field.parentElement).not.toContainElement(said);
  // A changed key drops the answer about the old one.
  await userEvent.type(field, "9");
  expect(screen.queryByText("Key works (…5678)")).toBeNull();
});
