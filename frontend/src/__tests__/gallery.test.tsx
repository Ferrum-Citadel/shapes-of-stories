import "fake-indexeddb/auto";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Gallery from "../pages/Gallery";
import { byTitle, familyOf, fold, groupByFamily } from "../lib/gallery";
import ShapeCard from "../components/ShapeCard";
import Plate from "../components/Plate";
import { SHAPE_Z, templateSamples } from "../lib/definitions";
import { linear } from "../lib/scale";
import { deleteLocal, saveLocal } from "../lib/local";
import { fakeAnalysis, fakeStructure, renderAt, renderRoutes } from "./fixtures";

const wobble = Array.from({ length: 100 }, (_, i) => 1 + (i / 99) * 2 + (i % 7 === 0 ? 4 : 0));
const spark = (lo: number, hi: number) =>
  Array.from({ length: 100 }, (_, i) => lo + ((hi - lo) * i) / 99);
const entry = (
  slug: string,
  title: string,
  shape: string | null,
  state: "named" | "leans" | "none",
  r: number,
  sparkline = wobble,
) => ({
  slug,
  title,
  author: "A",
  word_count: 1000,
  content_hash: "",
  question_set_version: "q4",
  model_id: "m",
  archetype: { state, shape, caption: "", r, margin: 0.2 },
  sparkline,
});
const items = [
  entry("a", "The Zebra", "rise", "named", 0.6),
  entry("b", "Apple", "rise", "named", 0.8),
  entry("c", "Bat", "rise", "leans", 0.9),
  entry("d", "Cat", null, "none", 0.3),
  entry("e", "Dog", "fall", "named", 0.7),
  entry("f", "An Emu", "fall", "named", 0.5),
  entry("g", "A Fox", "fall", "leans", 0.4),
  entry("h", "Hole", "fall_rise", "named", 0.5),
];

function show(data: unknown) {
  vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => data } as Response);
  return renderAt(<Gallery />);
}
const tileHrefs = () =>
  screen
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"))
    .filter((h) => h?.startsWith("/gallery/"));
const fortune = (link: HTMLElement) => link.querySelector('path[stroke="var(--accent)"]')!;
const ghost = (link: HTMLElement) => link.querySelector('path[stroke-dasharray="4 3"]');
// Every path command here is made of x,y pairs, so the odd numbers are the ys.
const pairs = (d: string) => {
  const n = d.match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => n[2 * i + 1]);
};
const lineYs = (link: HTMLElement) =>
  fortune(link)
    .getAttribute("d")!
    .match(/-?\d+(\.\d+)?(e-?\d+)?/g)!
    .map(Number)
    .filter((_, i) => i % 2 === 1);

test("groups by family in Vonnegut's order, best first, leans after named, none last", () => {
  const g = groupByFamily(items as never);
  expect(g.map((f) => f.key)).toEqual(["fall_rise", "rise", "fall", "none"]);
  expect(g[1].items.map((i) => i.slug)).toEqual(["b", "a", "c"]);
  expect(g[2].items.map((i) => i.slug)).toEqual(["e", "f", "g"]);
});

test("a family is the shape unless the reading is none or the shape is unknown", () => {
  expect(familyOf(entry("x", "X", "rise", "named", 0.6) as never)).toBe("rise");
  expect(familyOf(entry("x", "X", "rise", "leans", 0.5) as never)).toBe("rise");
  expect(familyOf(entry("x", "X", "rise", "none", 0.2) as never)).toBe("none");
  expect(familyOf(entry("x", "X", null, "named", 0.6) as never)).toBe("none");
  expect(familyOf(entry("x", "X", "spiral", "named", 0.6) as never)).toBe("none");
});

test("titles sort ignoring a leading The, A or An", () => {
  expect(byTitle(items as never).map((i) => i.title)).toEqual([
    "Apple",
    "Bat",
    "Cat",
    "Dog",
    "An Emu",
    "A Fox",
    "Hole",
    "The Zebra",
  ]);
});

test("the wall has a labeled section per family, whole-tile links, and ends with the invitation", async () => {
  show(items);
  const rags = await screen.findByRole("region", { name: "Rags to Riches" });
  expect(
    within(rags)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href")),
  ).toEqual(["/gallery/b", "/gallery/a", "/gallery/c"]);
  expect(screen.getAllByRole("region")).toHaveLength(4);
  expect(
    screen.getByText(/Somebody gets into trouble.*In Vonnegut's own words\./),
  ).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Tragedy" })).getAllByRole("link")).toHaveLength(
    3,
  );
  expect(screen.getAllByText(/leans this way/, { selector: "i" })).toHaveLength(2);
  const last = within(screen.getByRole("region", { name: "No clear shape" }))
    .getAllByRole("link")
    .at(-1)!;
  expect(last).toHaveAccessibleName(/your book here/i);
  expect(last).toHaveAttribute("href", "/import");
  expect(last).not.toHaveTextContent("→");
  expect(last.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getAllByRole("link", { name: /your book here/i })).toHaveLength(1);
});

test("the lead counts the works once they arrive", async () => {
  show(items);
  const lead = await screen.findByText(/^8 public-domain classics, read passage by passage/);
  expect(lead).toHaveTextContent(/analyze your own book for about two cents\.$/);
});

test("a plate is a framed sketch with a museum label, named for screen readers", async () => {
  show(items);
  await screen.findByRole("region", { name: "Rags to Riches" });
  const apple = screen.getByRole("link", { name: "Apple by A, Rags to Riches, strong match" });
  expect(apple.querySelector("svg")).toHaveAttribute("viewBox", "0 0 300 84");
  expect(apple.querySelectorAll("line")).toHaveLength(3);
  expect(ghost(apple)).not.toBeNull();
  expect(fortune(apple)).toHaveAttribute("stroke-width", "1.8");
  expect(fortune(apple)).toHaveAttribute("vector-effect", "non-scaling-stroke");
  expect(within(apple).getByText("strong match", { selector: "i" })).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Bat by A, Rags to Riches, leans this way" }),
  ).toBeInTheDocument();
  const cat = screen.getByRole("link", { name: "Cat by A, No clear shape" });
  expect(ghost(cat)).toBeNull();
  expect(fortune(cat)).not.toBeNull();
  expect(cat.querySelector("i")).toBeNull();
});

test("the family's running head names it, and its description sits beside the heading, not in it", async () => {
  show(items);
  const head = await screen.findByRole("heading", { level: 2, name: "Rags to Riches" });
  expect(head.nextElementSibling).toHaveTextContent(/climb/);
});

test("sparklines are z-scored per work, so a narrow book fills its plate like a wide one", async () => {
  show([
    entry("n", "Narrow", "rise", "named", 0.9, spark(1.8, 2.6)),
    entry("w", "Wide", "rise", "named", 0.8, spark(1.0, 3.0)),
  ]);
  const wide = await screen.findByRole("link", { name: /^Wide/ });
  const narrow = screen.getByRole("link", { name: /^Narrow/ });
  expect(fortune(narrow).getAttribute("d")).toBe(fortune(wide).getAttribute("d"));
  expect(Math.min(...lineYs(wide))).toBeLessThan(20);
  expect(Math.max(...lineYs(wide))).toBeGreaterThan(64);
});

test("a flat line sits on the middle gridline", async () => {
  show([entry("f", "Flat", "rise", "named", 0.9, spark(2, 2))]);
  const ys = lineYs(await screen.findByRole("link", { name: /^Flat/ }));
  expect(ys.every((y) => y === 42)).toBe(true);
});

test("search folds accents on both sides", async () => {
  expect(fold("Charlotte Brontë")).toBe("charlotte bronte");
  show([{ ...items[1], title: "Jane Eyre", author: "Charlotte Brontë" }, items[4]]);
  const user = userEvent.setup();
  const box = await screen.findByRole("searchbox", { name: /find a title/i });
  await user.type(box, "bronte");
  expect(screen.getByText("Jane Eyre")).toBeInTheDocument();
  expect(screen.queryByText("Dog")).toBeNull();
  await user.clear(box);
  await user.type(box, "BRONTË");
  expect(screen.getByText("Jane Eyre")).toBeInTheDocument();
});

test("search trims the query, drops empty families and offers to analyze a missing title", async () => {
  show(items);
  const user = userEvent.setup();
  const box = await screen.findByRole("searchbox", { name: /find a title/i });
  await user.type(box, " zeb ");
  expect(screen.getByText("The Zebra")).toBeInTheDocument();
  expect(screen.queryByText("Apple")).toBeNull();
  expect(screen.queryByRole("region", { name: "Tragedy" })).toBeNull();
  await user.clear(box);
  await user.type(box, "qqq");
  expect(screen.getByRole("status")).toHaveTextContent(/nothing by that name/i);
  expect(
    within(screen.getByRole("status")).getByRole("link", { name: /analyze it/i }),
  ).toHaveAttribute("href", "/import");
  await user.clear(box);
  expect(screen.getByText("Apple")).toBeInTheDocument();
});

test("the search counts the books in words once they arrive", async () => {
  show(Array.from({ length: 50 }, (_, i) => entry(`s${i}`, `T${i}`, "rise", "named", 0.5)));
  const box = screen.getByRole("searchbox", { name: /find a title/i });
  expect(box).toHaveAttribute("placeholder", "Search the books by title or author");
  await screen.findByText("T0");
  expect(box).toHaveAttribute("placeholder", "Search fifty books by title or author");
});

test("a slash anywhere on the wall goes to the search, but not from another field or with a modifier", async () => {
  show(items);
  const user = userEvent.setup();
  const box = await screen.findByRole("searchbox", { name: /find a title/i });
  await user.keyboard("{Control>}/{/Control}");
  expect(box).not.toHaveFocus();
  await user.keyboard("/");
  expect(box).toHaveFocus();
  expect(box).toHaveValue("");
  const other = document.body.appendChild(document.createElement("textarea"));
  other.focus();
  await user.keyboard("/");
  expect(other).toHaveFocus();
  expect(other).toHaveValue("/");
  other.remove();
});

test("the slash shortcut ignores a select, editable text, Meta, Alt, repeats and a removed listener", async () => {
  show(items);
  const user = userEvent.setup();
  const box = await screen.findByRole("searchbox", { name: /find a title/i });
  const select = document.body.appendChild(document.createElement("select"));
  select.focus();
  await user.keyboard("/");
  expect(box).not.toHaveFocus();
  select.remove();
  const editable = document.body.appendChild(document.createElement("div"));
  editable.tabIndex = 0;
  // jsdom does not compute isContentEditable.
  Object.defineProperty(editable, "isContentEditable", { value: true });
  editable.focus();
  await user.keyboard("/");
  expect(box).not.toHaveFocus();
  editable.remove();
  await user.keyboard("{Meta>}/{/Meta}");
  await user.keyboard("{Alt>}/{/Alt}");
  expect(box).not.toHaveFocus();
  box.dispatchEvent(new KeyboardEvent("keydown", { key: "/", repeat: true, bubbles: true }));
  expect(box).not.toHaveFocus();
});

test("the slash listener is removed when the wall unmounts", async () => {
  const { unmount } = show([]);
  const spy = vi.spyOn(window, "removeEventListener");
  unmount();
  expect(spy).toHaveBeenCalledWith("keydown", expect.any(Function));
});

test("Escape in the search returns focus to where the slash left it, or blurs, and keeps the text", async () => {
  show(items);
  const user = userEvent.setup();
  const box = await screen.findByRole("searchbox", { name: /find a title/i });
  const plate = (await screen.findAllByRole("link"))[0];
  plate.focus();
  await user.keyboard("/");
  expect(box).toHaveFocus();
  await user.keyboard("abc{Escape}");
  expect(plate).toHaveFocus();
  expect(box).toHaveValue("abc");
  await user.click(box);
  await user.keyboard("{Escape}");
  expect(box).not.toHaveFocus();
  expect(box).toHaveValue("abc");
});

test("by title is an index of rows, alphabetical, with family and length, and no family sections", async () => {
  show([{ ...items[1], word_count: 28435 }, ...items.filter((_, i) => i !== 1)]);
  const user = userEvent.setup();
  await screen.findByRole("region", { name: "Tragedy" });
  await user.click(screen.getByRole("radio", { name: "By title" }));
  expect(screen.queryByRole("region")).toBeNull();
  expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  expect(tileHrefs()).toEqual([
    "/gallery/b",
    "/gallery/c",
    "/gallery/d",
    "/gallery/e",
    "/gallery/f",
    "/gallery/g",
    "/gallery/h",
    "/gallery/a",
  ]);
  const tiles = screen
    .getAllByRole("link")
    .filter((a) => a.getAttribute("href")?.startsWith("/gallery/"));
  expect(within(tiles[0]).getByText("Rags to Riches · 28k words")).toBeInTheDocument();
  expect(within(tiles[2]).getByText("No clear shape · 1k words")).toBeInTheDocument();
  expect(within(tiles[5]).getByText("Tragedy · 1k words")).toBeInTheDocument();
  expect(within(tiles[6]).getByText("Man in a Hole · 1k words")).toBeInTheDocument();
  expect(tiles[0].querySelector("svg")).toHaveAttribute("viewBox", "0 0 170 34");
  expect(ghost(tiles[0])).not.toBeNull();
  expect(fortune(tiles[0])).not.toBeNull();
  expect(ghost(tiles[2])).toBeNull();
  const rows = screen.getAllByRole("listitem");
  expect(screen.getAllByRole("list")).toHaveLength(1);
  expect(within(rows.at(-1)!).getByRole("link")).toHaveAccessibleName(/your book here/i);
  expect(screen.getByRole("link", { name: /your book here/i })).toHaveAttribute("href", "/import");
  await user.type(screen.getByRole("searchbox", { name: /find a title/i }), "zeb");
  expect(tileHrefs()).toEqual(["/gallery/a"]);
});

test("the arrange switch is a native radio group that the arrow keys move", async () => {
  show(items);
  const user = userEvent.setup();
  await screen.findByRole("region", { name: "Tragedy" });
  expect(
    within(screen.getByRole("radiogroup", { name: "Arrange" })).getAllByRole("radio"),
  ).toHaveLength(2);
  expect(screen.getByRole("radio", { name: "By shape" })).toBeChecked();
  screen.getByRole("radio", { name: "By shape" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "By title" })).toBeChecked();
  expect(screen.queryByRole("region")).toBeNull();
});

test("the arrangement and the filter live in the address, so a step back from a work finds them as left", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => items } as Response);
  const { router } = renderRoutes([
    { path: "/", element: <Gallery /> },
    { path: "/gallery/:slug", element: <p>A work</p> },
  ]);
  const user = userEvent.setup();
  await screen.findByRole("region", { name: "Tragedy" });
  await user.click(screen.getByRole("radio", { name: "By title" }));
  await user.type(screen.getByRole("searchbox", { name: /find a title/i }), "zeb");
  expect(router.state.location.search).toBe("?view=title&q=zeb");
  await user.click(screen.getByRole("link", { name: /The Zebra/ }));
  await screen.findByText("A work");
  await act(() => router.navigate(-1));
  expect(screen.getByRole("radio", { name: "By title" })).toBeChecked();
  expect(screen.getByRole("searchbox", { name: /find a title/i })).toHaveValue("zeb");
  expect(tileHrefs()).toEqual(["/gallery/a"]);
  expect(screen.queryByRole("region")).toBeNull();
  // A move to the bare wall, such as the bar's link, starts it afresh.
  await act(() => router.navigate("/"));
  expect(screen.getByRole("searchbox", { name: /find a title/i })).toHaveValue("");
  expect(screen.getByRole("radio", { name: "By shape" })).toBeChecked();
});

test("says so while the wall loads", () => {
  vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
  renderAt(<Gallery />);
  expect(screen.getByText("Loading the wall…")).toBeInTheDocument();
  expect(screen.getByText(/^Public-domain classics, read passage by passage/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /your book here/i })).toBeNull();
});

test.each([
  ["a rejected request", () => Promise.reject(new Error("offline"))],
  ["a non-ok response", () => Promise.resolve({ ok: false, json: async () => ({}) })],
])("says so when the wall cannot load (%s)", async (_, reply) => {
  vi.spyOn(global, "fetch").mockImplementation(reply as never);
  const user = userEvent.setup();
  renderAt(<Gallery />);
  expect(await screen.findByText("The gallery could not be loaded.")).toBeInTheDocument();
  expect(screen.queryByText("Loading the wall…")).toBeNull();
  expect(screen.queryByText(/nothing by that name/i)).toBeNull();
  await user.click(screen.getByRole("radio", { name: "By title" }));
  expect(screen.queryByRole("link", { name: /your book here/i })).toBeNull();
});

test("a plate and the shape card draw the template from the same samples on the same scale", () => {
  const a = { state: "named", shape: "fall_rise", caption: "", r: 0.8, margin: 0.2 } as const;
  const want = templateSamples(a)!;
  const card = render(<ShapeCard archetype={a} fortuneShape={wobble} />);
  const cardYs = pairs(
    card.container.querySelector('path[stroke-dasharray="3 3"]')!.getAttribute("d")!,
  );
  const toCard = linear([...SHAPE_Z], [56, 4]);
  expect(cardYs.map((y) => toCard.invert(y))).toEqual(want.map((v) => expect.closeTo(v, 3)));
  card.unmount();
  renderAt(
    <ul>
      <Plate g={entry("p", "P", "fall_rise", "named", 0.8)} />
    </ul>,
  );
  // Paths are written to three decimals; a monotone curve ends each cubic segment on a sample.
  const plateYs = pairs(ghost(screen.getByRole("link"))!.getAttribute("d")!).filter(
    (_, i) => i % 3 === 0,
  );
  const toPlate = linear([...SHAPE_Z], [78, 6]);
  expect(plateYs.map((y) => toPlate.invert(y))).toEqual(want.map((v) => expect.closeTo(v, 3)));
});

// A work analyzed on this device, saved as the import page and the work page leave it.
async function saveMine(id: string, title: string, analyzed = true) {
  await saveLocal({
    id,
    title,
    author: "Me",
    text: "",
    structure: fakeStructure(),
    analysis: analyzed
      ? {
          ...fakeAnalysis(),
          archetype: { ...fakeAnalysis().archetype, state: "named", shape: "rise", r: 0.7 },
        }
      : null,
    answers: {},
    savedAt: Date.now(),
  });
}

describe("works analyzed on this device", () => {
  afterEach(async () => {
    for (const id of ["m1", "m2", "m3"]) await deleteLocal(id);
  });

  test("hang first under Your works as plates linking to their pages, with the invite still last", async () => {
    await saveMine("m1", "My Novel");
    await saveMine("m2", "Half Done", false);
    const fetch = vi.spyOn(global, "fetch");
    show(items);
    const mine = await screen.findByRole("region", { name: "Your works" });
    expect(screen.getAllByRole("region")[0]).toBe(mine);
    const plate = within(mine).getByRole("link");
    expect(plate).toHaveAttribute("href", "/works/m1");
    expect(plate).toHaveAccessibleName(/^My Novel by Me, Rags to Riches/);
    expect(plate.querySelector('path[stroke="var(--accent)"]')).not.toBeNull();
    expect(within(mine).queryByRole("link", { name: /your book here/i })).toBeNull();
    const last = within(screen.getAllByRole("region").at(-1)!).getAllByRole("link").at(-1)!;
    expect(last).toHaveAccessibleName(/your book here/i);
    // Only the wall itself is fetched; the reader's works never leave the device.
    expect(fetch.mock.calls.map(([u]) => String(u))).toEqual(["/gallery/index.json"]);
  });

  test("are found by the search, which can leave them alone on the wall with the invite", async () => {
    await saveMine("m1", "My Novel");
    const user = userEvent.setup();
    show(items);
    await screen.findByRole("region", { name: "Your works" });
    await user.type(screen.getByRole("searchbox", { name: /find a title/i }), "novel");
    const regions = screen.getAllByRole("region");
    expect(regions).toEqual([screen.getByRole("region", { name: "Your works" })]);
    expect(
      within(regions[0])
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/works/m1", "/import"]);
    expect(screen.queryByText(/Nothing by that name/)).toBeNull();
    await user.clear(screen.getByRole("searchbox", { name: /find a title/i }));
    await user.type(screen.getByRole("searchbox", { name: /find a title/i }), "zebra");
    expect(screen.queryByRole("region", { name: "Your works" })).toBeNull();
    expect(tileHrefs()).toEqual(["/gallery/a"]);
  });

  test("head the index by title too, ahead of the gallery", async () => {
    await saveMine("m1", "Zed");
    await saveMine("m3", "Able");
    const user = userEvent.setup();
    show(items);
    await screen.findByRole("region", { name: "Your works" });
    await user.click(screen.getByRole("radio", { name: "By title" }));
    const mine = screen.getByRole("region", { name: "Your works" });
    expect(
      within(mine)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/works/m3", "/works/m1"]);
    expect(screen.getByRole("heading", { name: /The gallery/ })).toBeInTheDocument();
    expect(mine.compareDocumentPosition(screen.getByRole("link", { name: /Apple/ }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getAllByRole("link").at(-1)).toHaveAccessibleName(/your book here/i);
    // A search that leaves the gallery no rows leaves it no head either.
    await user.type(screen.getByRole("searchbox", { name: /find a title/i }), "zed");
    expect(screen.queryByRole("heading", { name: /The gallery/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Your works" })).toBeInTheDocument();
  });
});
