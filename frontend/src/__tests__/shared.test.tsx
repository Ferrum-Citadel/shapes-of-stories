import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router";
import Shared from "../pages/Shared";
import { fakeAnalysis, fakeStructure, fakeWork, json, renderAt } from "./fixtures";

const TOKEN = "Abc_def-0123456789wxyz";
const sharedWork = fakeWork({
  title: "The River",
  word_count: 1000,
  structure: fakeStructure(),
  analysis: fakeAnalysis(),
  completed_at: "2026-10-04T00:00:00Z",
});

function open(token: string, answer: () => Response) {
  const fetch = vi.fn(async (_url: string) => answer());
  vi.stubGlobal("fetch", fetch);
  renderAt(
    <Routes>
      <Route path="/shared/:token" element={<Shared />} />
    </Routes>,
    `/shared/${encodeURIComponent(token)}`,
  );
  return fetch;
}

test("a shared work shows its chart, chapters and shape, a way to analyze one's own, and no owner actions", async () => {
  const fetch = open(TOKEN, () => json(sharedWork));
  expect(await screen.findByRole("heading", { level: 1, name: "The River" })).toBeInTheDocument();
  expect(document.title).toBe("The River · Shapes of Stories");
  expect(screen.getByRole("heading", { name: "Chapters" })).toBeInTheDocument();
  expect(screen.getAllByRole("complementary", { name: "Story shape" })[0]).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Analyze your own book" })).toHaveAttribute(
    "href",
    "/import",
  );
  for (const name of [/keep/i, /share/i, /export/i, /poster/i, /delete/i])
    expect(screen.queryByRole("button", { name })).toBeNull();
  // Only the share itself is asked for: never a work, its text or its answers.
  expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual([`/api/shared/${TOKEN}`]);
});

test("a share link's opening is marked seen under one key for every link, never under its token", async () => {
  let now = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb((now += 5000));
    return 1;
  });
  open(TOKEN, () => json(sharedWork));
  await screen.findByRole("heading", { level: 1, name: "The River" });
  expect(localStorage.getItem("sos.seen.shared")).toBe("1");
  expect(Object.keys(localStorage).filter((k) => k.includes(TOKEN))).toEqual([]);
});

test("a revoked, expired or deleted link says it no longer works", async () => {
  open(TOKEN, () => json({ error: "not_found" }, 404));
  expect(
    await screen.findByRole("heading", { level: 1, name: "This link no longer works" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(/stopped sharing it, or .* deleted/);
});

test("a server that does not answer is not mistaken for a dead link", async () => {
  open(TOKEN, () => {
    throw new TypeError("offline");
  });
  expect(
    await screen.findByRole("heading", { level: 1, name: "Could not load this link" }),
  ).toBeInTheDocument();
});

test.each(["nowhere", "../works/w1", "a b c d e f g h i j k l"])(
  "a malformed token such as %s is a 404 page and asks the server nothing",
  async (token) => {
    const fetch = open(token, () => json(sharedWork));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Nothing at this link" }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  },
);
