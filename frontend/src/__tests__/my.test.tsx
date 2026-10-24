import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { api } from "../api/client";
import { loadLocal, saveLocal } from "../lib/local";
import My from "../pages/My";
import type { WorkSummary } from "../types";
import { blockIndexedDB, fakeAnalysis, fakeStructure, resultsFile } from "./fixtures";

const carol: WorkSummary = {
  id: "w1",
  title: "A Christmas Carol",
  author: "Charles Dickens",
  kind: "novel",
  state: "complete",
  kept: true,
  word_count: 1,
  created_at: "",
  completed_at: null,
  expires_at: null,
  caption: null,
};
const show = () =>
  render(
    <MemoryRouter>
      <My />
    </MemoryRouter>,
  );

test("my works still lists the server's works when this browser's store cannot be read", async () => {
  blockIndexedDB();
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [carol] });
  show();
  expect(await screen.findByRole("link", { name: "A Christmas Carol" })).toHaveAttribute(
    "href",
    "/works/w1",
  );
  expect(screen.getByText("kept")).toBeInTheDocument();
});

test("with nothing here yet, the page offers to analyze a book", async () => {
  blockIndexedDB();
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [] });
  show();
  expect(await screen.findByRole("link", { name: "Analyze a book" })).toHaveAttribute(
    "href",
    "/import",
  );
});

test("deleting a work removes this browser's copy too, so no tile is left behind", async () => {
  await saveLocal({
    id: "w1",
    title: "A Christmas Carol",
    author: null,
    text: "",
    structure: fakeStructure(),
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  let works = [carol];
  vi.spyOn(api, "myWorks").mockImplementation(async () => ({ works }));
  vi.spyOn(api, "remove").mockImplementation(async () => {
    works = [];
  });
  vi.stubGlobal("confirm", () => true);
  show();
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByText("A Christmas Carol")).toBeNull());
  expect(await loadLocal("w1")).toBeUndefined();
});

test("a delete that fails says so and keeps the work", async () => {
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [carol] });
  vi.spyOn(api, "remove").mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("confirm", () => true);
  show();
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Network error.");
  expect(screen.getByRole("link", { name: "A Christmas Carol" })).toBeInTheDocument();
});

test("a file that is not a results file is reported", async () => {
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [] });
  const { container } = show();
  await userEvent.upload(
    container.querySelector("input[type=file]") as HTMLInputElement,
    new File(["not json"], "notes.json", { type: "application/json" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This file could not be opened as a results file.",
  );
});

test("a work kept only in this browser links to its page when it has results", async () => {
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [] });
  await saveLocal({
    id: "f1",
    title: "From a file",
    author: null,
    text: "",
    structure: fakeStructure(),
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 2,
  });
  await saveLocal({
    id: "f2",
    title: "Never finished",
    author: null,
    text: "",
    structure: fakeStructure(),
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  show();
  expect(await screen.findByRole("link", { name: "From a file" })).toHaveAttribute(
    "href",
    "/works/f1",
  );
  expect(screen.getByText("Never finished")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Never finished" })).toBeNull();
});

test("a good results file this browser will not store is not called a bad file", async () => {
  blockIndexedDB();
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [] });
  const { container } = show();
  await userEvent.upload(
    container.querySelector("input[type=file]") as HTMLInputElement,
    resultsFile(),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The file is fine, but this browser would not store it.",
  );
});

test("a copy this browser will not remove says so, and a later removal clears the message", async () => {
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [] });
  await saveLocal({
    id: "r1",
    title: "To be removed",
    author: null,
    text: "",
    structure: fakeStructure(),
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 1,
  });
  const real = IDBDatabase.prototype.transaction;
  let blocked = true;
  vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
    this: IDBDatabase,
    names,
    mode,
  ) {
    if (blocked && mode === "readwrite") throw new DOMException("blocked", "InvalidStateError");
    return real.call(this, names, mode);
  });
  vi.stubGlobal("confirm", () => true);
  show();
  const remove = within(
    (await screen.findByRole("link", { name: "To be removed" })).closest("li")!,
  ).getByRole("button", { name: "Remove" });
  await userEvent.click(remove);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This browser would not remove its copy just now.",
  );
  blocked = false;
  await userEvent.click(remove);
  await waitFor(() => expect(screen.queryByRole("link", { name: "To be removed" })).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("when the server cannot be reached the page says so, lists this browser's copies, and does not call itself empty", async () => {
  vi.spyOn(api, "myWorks").mockRejectedValue(new TypeError("Failed to fetch"));
  await saveLocal({
    id: "d1",
    title: "Only here",
    author: null,
    text: "",
    structure: fakeStructure(),
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 1,
  });
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The server could not be reached; only this browser's copies are listed.",
  );
  expect(screen.getByRole("link", { name: "Only here" })).toBeInTheDocument();
  expect(screen.queryByText(/Nothing here yet/)).toBeNull();
});

test("a tile says a work's state and when it leaves in words", async () => {
  const expires = new Date(Date.now() + 23 * 3_600_000 + 60_000).toISOString();
  vi.spyOn(api, "myWorks").mockResolvedValue({
    works: [{ ...carol, state: "queued", kept: false, expires_at: expires }],
  });
  show();
  expect(await screen.findByText("waiting")).toBeInTheDocument();
  expect(screen.getByText("deleted in 23 hours")).toBeInTheDocument();
});

test("removing a copy kept only in this browser asks first", async () => {
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [] });
  await saveLocal({
    id: "k1",
    title: "Asked about",
    author: null,
    text: "",
    structure: fakeStructure(),
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 1,
  });
  const ask = vi.fn(() => false);
  vi.stubGlobal("confirm", ask);
  show();
  const tile = (await screen.findByRole("link", { name: "Asked about" })).closest("li")!;
  await userEvent.click(within(tile).getByRole("button", { name: "Remove" }));
  expect(ask).toHaveBeenCalledOnce();
  expect(await loadLocal("k1")).toBeDefined();
});

test("a copy without a title is called Untitled, never shown by its id", async () => {
  vi.spyOn(api, "myWorks").mockResolvedValue({ works: [] });
  await saveLocal({
    id: "CxOx5bFYWG8",
    title: null,
    author: null,
    text: "",
    structure: fakeStructure(),
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 1,
  });
  show();
  expect(await screen.findByRole("link", { name: "Untitled" })).toHaveAttribute(
    "href",
    "/works/CxOx5bFYWG8",
  );
  expect(screen.queryByText("CxOx5bFYWG8")).toBeNull();
});
