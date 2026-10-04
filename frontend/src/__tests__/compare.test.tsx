import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { pearson } from "../lib/stats";
import { api } from "../api/client";
import { deleteLocal, saveLocal } from "../lib/local";
import Compare from "../pages/Compare";
import { INDEX, keptFile } from "../lib/gallery";
import { correlationWords } from "../components/Comparison";
import { version } from "../../public/questions.json";
import {
  blockIndexedDB,
  fakeAnalysis,
  fakeStructure,
  ramp,
  resultsFile,
  stubResize,
} from "./fixtures";
test("correlation wording", () => {
  expect(correlationWords(pearson([1, 2, 3, 4], [1, 2, 3, 4]))).toMatch(/nearly the same shape/);
  expect(correlationWords(0.3)).toMatch(/loosely/);
  expect(correlationWords(-0.7)).toMatch(/opposite/);
});

const work = (title: string, shape: number[], question_set_version = version) => {
  const analysis = fakeAnalysis();
  analysis.bins.fortune.shape = shape;
  return { work: { title, question_set_version }, analysis, structure: fakeStructure() };
};
const entry = (slug: string, author = "A") => ({
  slug,
  title: `Work ${slug.toUpperCase()}`,
  author,
  sparkline: ramp,
  archetype: { state: "none", shape: null, caption: "", r: 0, margin: 0 },
});
const shelf: Record<string, unknown> = {
  "/gallery/x.json": work("Work X", ramp),
  "/gallery/y.json": work(
    "Work Y",
    ramp.map((v) => 4 - v),
  ),
  "/gallery/z.json": work("Work Z", ramp),
  "/gallery/index.json": [entry("x"), entry("y"), entry("z", "Brontë")],
};
function Where() {
  return <span data-testid="where">{useLocation().search}</span>;
}
// Serves the shelf, except where a test hands in its own answer; undefined answers as a failed request.
function open(url: string, answer: (path: string) => unknown = (p) => shelf[p]) {
  const f = vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const body = await answer(String(u));
    return (
      body === undefined
        ? { ok: false, json: async () => ({}) }
        : { ok: true, json: async () => body }
    ) as Response;
  });
  render(
    <MemoryRouter initialEntries={[url]}>
      <Compare />
      <Where />
    </MemoryRouter>,
  );
  return f;
}
const param = (k: string) => new URLSearchParams(screen.getByTestId("where").textContent!).get(k);
const loaded = () => screen.findByRole("img", { name: /versus/ });
type Which = "first" | "second";
const picker = (side: Which) =>
  screen.getByRole("combobox", { name: new RegExp(`^${side} work$`, "i") });
const fileOf = (side: Which) => screen.getByLabelText(`Results file for the ${side} work`);
const pickIn = async (side: Which, query: string) => {
  const user = userEvent.setup();
  await user.clear(picker(side));
  await user.type(picker(side), query);
  await screen.findByRole("option", { name: new RegExp(`^${query}`, "i") });
  await user.keyboard("{Enter}");
};

test("two loaded works give the chart, the profile, the mixes and the two shapes, in that order", async () => {
  open("/compare?a=gallery:x&b=gallery:y");
  const chart = await loaded();
  expect(chart).toHaveAccessibleName("Fortune: Work X versus Work Y");
  const heads = screen.getAllByRole("heading", { level: 2 });
  expect(heads.map((h) => h.textContent)).toEqual([
    "Profile",
    "Events and writing",
    "The two shapes",
  ]);
  const sentence = screen.getByText(/^Fortune curves correlate -1\.00: roughly opposite\.$/);
  const chips = screen.getByRole("button", { name: "Fortune" });
  const order = [chips, chart, sentence, ...heads];
  for (let i = 1; i < order.length; i++)
    expect(order[i - 1].compareDocumentPosition(order[i])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  const cards = screen.getAllByRole("complementary", { name: "Story shape" });
  expect(cards).toHaveLength(2);
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  for (const name of ["Work X", "Work Y"])
    expect(within(screen.getByRole("region", { name })).getByRole("complementary")).toBeVisible();
  expect(screen.getByText(/how well things are going for the characters/i)).toBeInTheDocument();
  for (const table of screen.getAllByRole("table"))
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Work X", "Work Y"]);
  expect(screen.getAllByRole("table")).toHaveLength(2);
});

test("without two works the page asks for them", async () => {
  open("/compare?a=gallery:x");
  expect(
    await screen.findByText("Pick two works to compare, or open a results file you downloaded."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /versus/ })).toBeNull();
  expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
});

test("only the side scored under an earlier question set says so", async () => {
  open("/compare?a=gallery:x&b=gallery:y", (p) =>
    p === "/gallery/y.json" ? work("Work Y", ramp, "q0") : shelf[p],
  );
  await loaded();
  const lines = screen.getAllByText(/earlier set of questions \(q0\)/);
  expect(lines).toHaveLength(1);
  expect(lines[0].previousElementSibling).toHaveTextContent("Work Y");
});

test("choosing a layer replaces the compared one, and the chosen one stays chosen when pressed again", async () => {
  open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Warmth" }));
  expect(screen.getByRole("img", { name: "Warmth: Work X versus Work Y" })).toBeInTheDocument();
  expect(screen.getByText(/^Warmth curves correlate/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Warmth" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Fortune" })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Warmth" }));
  expect(screen.getByRole("button", { name: "Warmth" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/kindness, affection and fellow feeling/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /how to read this chart/i })).toBeNull();
});

test("on a phone the chart is drawn at the width it is given", async () => {
  const box = stubResize();
  open("/compare?a=gallery:x&b=gallery:y");
  const chart = await loaded();
  box.resize(358);
  expect(chart.getAttribute("viewBox")).toBe("0 0 358 260");
});

test("a picker shows the chosen title and opens on focus into rows of title, author and sketch", async () => {
  open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  const box = picker("first");
  expect(box).toHaveValue("Work X");
  expect(box).toHaveAttribute("aria-expanded", "false");
  expect(box).toHaveAttribute("aria-autocomplete", "list");
  await userEvent.setup().click(box);
  expect(box).toHaveAttribute("aria-expanded", "true");
  const list = document.getElementById(box.getAttribute("aria-controls")!)!;
  expect(list).toHaveAttribute("role", "listbox");
  const rows = within(list).getAllByRole("option");
  expect(rows.map((r) => r.textContent)).toEqual([
    "Work XA",
    "Work YA",
    "Work ZBrontë",
    "Open a results file…",
  ]);
  expect(rows[0].querySelector("svg")).not.toBeNull();
});

test("typing filters by title or author, accents aside, and the keys choose a row into the address", async () => {
  open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  const user = userEvent.setup();
  await user.clear(picker("second"));
  await user.type(picker("second"), "bronte");
  expect(screen.getAllByRole("option").map((r) => r.textContent)).toEqual([
    "Work ZBrontë",
    "Open a results file…",
  ]);
  await user.clear(picker("second"));
  await user.type(picker("second"), "work");
  await user.keyboard("{ArrowDown}");
  const active = picker("second").getAttribute("aria-activedescendant")!;
  expect(document.getElementById(active)).toHaveTextContent("Work Y");
  expect(document.getElementById(active)).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{ArrowDown}{ArrowUp}{ArrowDown}{Enter}");
  expect(picker("second")).toHaveAttribute("aria-expanded", "false");
  expect([param("a"), param("b")]).toEqual(["gallery:x", "gallery:z"]);
  await screen.findByRole("img", { name: "Fortune: Work X versus Work Z" });
  expect(picker("second")).toHaveValue("Work Z");
});

test("with nothing matching the field says so, points at no row and keeps the file row", async () => {
  open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  const user = userEvent.setup();
  await user.clear(picker("first"));
  await user.type(picker("first"), "w");
  expect(picker("first")).toHaveAttribute("aria-activedescendant");
  // The status is there before it has anything to say, so a screen reader hears it change.
  const status = within(picker("first").parentElement!).getByRole("status");
  expect(status).toBeEmptyDOMElement();
  expect(status).toHaveClass("sr-only");
  await user.type(picker("first"), "qq");
  expect(within(picker("first").parentElement!).getByRole("status")).toBe(status);
  expect(status).toHaveTextContent("No work by that title or author.");
  expect(
    screen.getByText("No work by that title or author.", { ignore: "[role=status]" }),
  ).toBeVisible();
  expect(screen.getAllByRole("option").map((r) => r.textContent)).toEqual(["Open a results file…"]);
  expect(picker("first")).not.toHaveAttribute("aria-activedescendant");
  const click = vi.spyOn(HTMLInputElement.prototype, "click");
  await user.keyboard("{Enter}");
  expect(param("a")).toBe("gallery:x");
  expect(click).not.toHaveBeenCalled();
});

test("the file row ends each list and opens a results file into that side", async () => {
  open("/compare?a=gallery:x");
  const user = userEvent.setup();
  const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  await user.click(picker("second"));
  await user.click(screen.getByRole("option", { name: "Open a results file…" }));
  expect(click.mock.contexts).toEqual([fileOf("second")]);
  // The field kept its focus, so the keys open the list again and walk past the three works.
  await user.keyboard("{ArrowDown}".repeat(6));
  const active = picker("second").getAttribute("aria-activedescendant")!;
  expect(document.getElementById(active)).toHaveTextContent("Open a results file…");
  await user.keyboard("{Enter}");
  expect(click.mock.contexts).toEqual([fileOf("second"), fileOf("second")]);
  await user.upload(fileOf("second"), resultsFile("f8"));
  await screen.findByRole("img", { name: "Fortune: Work X versus From a File" });
  expect([param("a"), param("b")]).toEqual(["gallery:x", "work:f8"]);
  expect((fileOf("second") as HTMLInputElement).value).toBe("");
  onTestFinished(() => deleteLocal("f8"));
});

test("the field's focus coming back from the file dialog leaves the list closed", async () => {
  open("/compare?a=gallery:x");
  const user = userEvent.setup();
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  await user.click(picker("second"));
  await user.click(screen.getByRole("option", { name: "Open a results file…" }));
  // The dialog takes the window's focus away from the page, then gives it back.
  const away = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  act(() => picker("second").blur());
  away.mockRestore();
  act(() => picker("second").focus());
  expect(picker("second")).toHaveAttribute("aria-expanded", "false");
  // A move to another control and back opens it as usual.
  await user.click(picker("first"));
  await user.click(picker("second"));
  expect(picker("second")).toHaveAttribute("aria-expanded", "true");
});

test("a press anywhere in the list leaves the field focused and the list open", async () => {
  open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  await userEvent.setup().click(picker("first"));
  const list = screen.getByRole("listbox");
  expect(fireEvent.mouseDown(list)).toBe(false);
  expect(picker("first")).toHaveFocus();
});

test("Escape closes the list and an emptied field keeps the chosen work", async () => {
  open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  const user = userEvent.setup();
  await user.clear(picker("first"));
  expect(picker("first")).toHaveAttribute("aria-expanded", "true");
  await user.keyboard("{Escape}");
  expect(picker("first")).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(picker("first")).toHaveValue("Work X");
  expect(param("a")).toBe("gallery:x");
});

test("a click on a row chooses it", async () => {
  open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  const user = userEvent.setup();
  await user.click(picker("first"));
  await user.click(screen.getByRole("option", { name: /^Work Z/ }));
  await screen.findByRole("img", { name: "Fortune: Work Z versus Work Y" });
  expect(picker("first")).toHaveValue("Work Z");
});

test("own works follow the gallery under their own label", async () => {
  await saveLocal({
    id: "m1",
    title: "My Novel",
    author: null,
    text: "",
    structure: fakeStructure(),
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 1,
  });
  onTestFinished(() => deleteLocal("m1"));
  open("/compare");
  await userEvent.setup().click(picker("first"));
  const group = await screen.findByRole("group", { name: "Your works" });
  expect(within(group).getByRole("option")).toHaveTextContent("My NovelWhich Way Is Up?");
  const rows = screen.getAllByRole("option");
  expect(rows.at(-2)).toHaveTextContent("My Novel");
});

test("choosing work B loads only B, not work A again", async () => {
  const f = open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  await pickIn("second", "Work Z");
  await screen.findByRole("img", { name: "Fortune: Work X versus Work Z" });
  expect(f.mock.calls.filter(([u]) => String(u) === "/gallery/x.json")).toHaveLength(1);
});

test("a gallery file is fetched once a visit, and kept for the rest of the site", async () => {
  const f = open("/compare?a=gallery:x&b=gallery:y");
  await loaded();
  await pickIn("second", "Work Z");
  await screen.findByRole("img", { name: "Fortune: Work X versus Work Z" });
  await pickIn("second", "Work Y");
  await screen.findByRole("img", { name: "Fortune: Work X versus Work Y" });
  const asked = (p: string) => f.mock.calls.filter(([u]) => String(u) === p).length;
  expect([asked("/gallery/y.json"), asked(INDEX)]).toEqual([1, 1]);
  expect(keptFile(INDEX)).toBeDefined();
});

test("a slow answer for an earlier choice does not replace a later one", async () => {
  let release!: () => void;
  const slow = new Promise((r) => {
    release = () => r(shelf["/gallery/x.json"]);
  });
  open("/compare?b=gallery:y", (p) => (p === "/gallery/x.json" ? slow : shelf[p]));
  await pickIn("first", "Work X");
  await pickIn("first", "Work Z");
  await screen.findByRole("img", { name: "Fortune: Work Z versus Work Y" });
  await act(async () => {
    release();
    await slow;
  });
  expect(screen.getByRole("img", { name: "Fortune: Work Z versus Work Y" })).toBeInTheDocument();
});

test("a work that cannot be loaded says so under its picker", async () => {
  open("/compare?a=gallery:x&b=gallery:gone");
  expect(await screen.findByRole("alert")).toHaveTextContent("This work could not be loaded.");
  expect(picker("second").compareDocumentPosition(screen.getByRole("alert"))).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(screen.getByText(/Pick two works/)).toBeInTheDocument();
});

test("with this browser's store blocked the gallery is still there to choose from", async () => {
  blockIndexedDB();
  open("/compare");
  await userEvent.setup().click(picker("first"));
  expect(await screen.findAllByRole("option")).toHaveLength(4);
});

test("a file that is not a results file is reported", async () => {
  open("/compare");
  await userEvent.upload(
    fileOf("first"),
    new File(["not json"], "notes.json", { type: "application/json" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This file could not be opened as a results file.",
  );
});

test("with this browser's store blocked a work of mine is still fetched from the server", async () => {
  blockIndexedDB();
  vi.spyOn(api, "getWork").mockResolvedValue({
    title: "Mine",
    analysis: fakeAnalysis(),
    structure: fakeStructure(),
  } as never);
  open("/compare?a=work:w1&b=gallery:y");
  expect(await screen.findByRole("img", { name: "Fortune: Mine versus Work Y" })).toBeVisible();
  await waitFor(() => expect(picker("first")).toHaveValue("Mine"));
});

test("while a chosen work is still loading the page says so instead of asking for two works", async () => {
  open("/compare?a=gallery:x&b=gallery:y", (p) =>
    p === "/gallery/y.json" ? new Promise(() => {}) : shelf[p],
  );
  expect(await screen.findByText("Loading…")).toHaveAttribute("role", "status");
  expect(screen.queryByText(/Pick two works/)).toBeNull();
});

test("a results file opened joins the list of own works", async () => {
  open("/compare?b=gallery:y");
  await userEvent.upload(fileOf("first"), resultsFile("f7"));
  await screen.findByRole("img", { name: "Fortune: From a File versus Work Y" });
  expect(param("a")).toBe("work:f7");
  await userEvent.setup().click(picker("second"));
  const group = await screen.findByRole("group", { name: "Your works" });
  expect(within(group).getByRole("option", { name: /^From a File/ })).toBeVisible();
  onTestFinished(() => deleteLocal("f7"));
});

test("a good results file this browser will not store is not called a bad file", async () => {
  blockIndexedDB();
  open("/compare");
  await userEvent.upload(fileOf("first"), resultsFile());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The file is fine, but this browser would not store it.",
  );
});
