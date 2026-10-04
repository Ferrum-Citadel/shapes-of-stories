import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChapterTable from "../components/ChapterTable";
import { WRITING_STYLE } from "../lib/definitions";
import type { ChapterStat } from "../types";
import { fakeAnalysis, fakeStructure } from "./fixtures";

const chapter = (idx: number, title: string, over: Partial<ChapterStat> = {}): ChapterStat => ({
  ...fakeAnalysis().chapters[0],
  idx,
  title,
  ...over,
});
// A screen under 640 px gets the list instead of the table; the returned function widens it past that.
function phone() {
  const listeners = new Set<() => void>();
  const narrow = {
    matches: true,
    addEventListener: (_: string, f: () => void) => listeners.add(f),
    removeEventListener: (_: string, f: () => void) => listeners.delete(f),
  };
  vi.stubGlobal("matchMedia", (q: string) =>
    q === "(width < 40rem)"
      ? narrow
      : { matches: false, addEventListener() {}, removeEventListener() {} },
  );
  return () =>
    act(() => {
      narrow.matches = false;
      listeners.forEach((f) => f());
    });
}
const column = (i: number) =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[i].textContent);

test("names the writing bars, sorts, and pins a chapter's first passage on click", async () => {
  const user = userEvent.setup();
  const onPin = vi.fn();
  render(
    <ChapterTable
      chapters={fakeAnalysis().chapters}
      structure={fakeStructure(12, 3)}
      onPinBeat={onPin}
    />,
  );
  expect(screen.getByRole("heading", { name: "Chapters", level: 2 })).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Tension by chapter" })).toBeNull();
  expect(screen.getByText(/what kind of prose fills the chapter/)).toBeInTheDocument();
  expect(screen.queryByText(/^Mode$/)).toBeNull();
  await user.click(screen.getByRole("button", { name: /Tension/ }));
  expect(screen.getByRole("columnheader", { name: /Tension/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await user.click(screen.getAllByRole("row")[1]);
  expect(onPin).toHaveBeenCalledWith(expect.any(Number));
});

test("renders 135 chapters", () => {
  const a = fakeAnalysis();
  const many = Array.from({ length: 135 }, (_, i) => ({
    ...a.chapters[0],
    idx: i,
    title: `Chapter ${i + 1}`,
  }));
  const { container } = render(
    <ChapterTable chapters={many} structure={fakeStructure(300, 135)} onPinBeat={() => {}} />,
  );
  expect(container.querySelectorAll("tbody tr")).toHaveLength(135);
});

test("only #, Words, Pace, Tension headers are sortable; clicking Pace reorders rows by mean pace descending", async () => {
  const user = userEvent.setup();
  const chapters = [
    chapter(0, "Alpha", { means: { pace: 1 } as never }),
    chapter(1, "Beta", { means: { pace: 3 } as never }),
    chapter(2, "Gamma", { means: { pace: 2 } as never }),
  ];
  render(<ChapterTable chapters={chapters} structure={fakeStructure(6, 3)} onPinBeat={() => {}} />);
  for (const name of ["Chapter", "Writing", "Events", "Mode"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Pace" }));
  expect(column(1)).toEqual(["Beta", "Gamma", "Alpha"]);
});

test("# sorts ascending by chapter number, ties fall back to chapter number, and aria-sort tells the direction", async () => {
  const user = userEvent.setup();
  const chapters = [
    chapter(2, "Gamma", { means: { tension: 2 } as never }),
    chapter(0, "Alpha", { means: { tension: 2 } as never }),
    chapter(1, "Beta", { means: { tension: 3 } as never }),
  ];
  render(<ChapterTable chapters={chapters} structure={fakeStructure(6, 3)} onPinBeat={() => {}} />);
  const th = (name: string) => screen.getByRole("button", { name }).closest("th");
  expect(column(0)).toEqual(["1", "2", "3"]);
  expect(th("#")).toHaveAttribute("aria-sort", "ascending");
  expect(th("Tension")).not.toHaveAttribute("aria-sort");
  await user.click(screen.getByRole("button", { name: "Tension" }));
  expect(column(1)).toEqual(["Beta", "Alpha", "Gamma"]);
  expect(th("Tension")).toHaveAttribute("aria-sort", "descending");
  expect(th("#")).not.toHaveAttribute("aria-sort");
  await user.click(screen.getByRole("button", { name: "#" }));
  expect(column(0)).toEqual(["1", "2", "3"]);
});

test("a click pins the first passage of that chapter, and a chapter with no passages pins nothing", async () => {
  const user = userEvent.setup();
  const onPin = vi.fn();
  render(
    <ChapterTable
      chapters={[chapter(0, "One"), chapter(1, "Two"), chapter(7, "Lost")]}
      structure={fakeStructure(12, 3)}
      onPinBeat={onPin}
    />,
  );
  const table = within(screen.getByRole("table"));
  await user.click(table.getByText("Two"));
  expect(onPin).toHaveBeenCalledExactlyOnceWith(4);
  await user.click(table.getByText("Lost"));
  expect(onPin).toHaveBeenCalledTimes(1);
});

test("only one layout is drawn: the phone cards list the same chapters as the table and pin the same way", async () => {
  const user = userEvent.setup();
  const onPin = vi.fn();
  const { unmount } = render(
    <ChapterTable
      chapters={[chapter(0, "One"), chapter(1, "Two")]}
      structure={fakeStructure(12, 3)}
      onPinBeat={onPin}
    />,
  );
  const rows = column(0).length;
  expect(screen.queryByRole("list")).toBeNull();
  unmount();
  phone();
  render(
    <ChapterTable
      chapters={[chapter(0, "One"), chapter(1, "Two")]}
      structure={fakeStructure(12, 3)}
      onPinBeat={onPin}
    />,
  );
  expect(screen.queryByRole("table")).toBeNull();
  const cards = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(cards).toHaveLength(rows);
  await user.click(within(cards[1]).getByText("Two"));
  expect(onPin).toHaveBeenCalledExactlyOnceWith(4);
});

test("the legend names every kind of writing the bar can show, mixed included, each beside a piece of the bar", () => {
  const kinds = ["action", "dialogue", "description", "reflection", "exposition", "mixed"];
  render(
    <ChapterTable
      chapters={[
        chapter(0, "One", { mode_share: Object.fromEntries(kinds.map((k) => [k, 1 / 6])) }),
      ]}
      structure={fakeStructure(12, 3)}
      onPinBeat={() => {}}
    />,
  );
  const pieces = Array.from(
    within(screen.getByRole("table")).getByRole("img", { name: /^action/ }).children,
  ) as HTMLElement[];
  kinds.forEach((kind, i) =>
    expect(
      (screen.getByText(kind).querySelector("span[aria-hidden]") as HTMLElement).style.background,
    ).toBe(pieces[i].style.background),
  );
  const legend = screen.getByText(/what kind of prose fills the chapter/);
  expect(
    screen.getByRole("table").compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("each kind is drawn as its color under its pattern, in the bar and the legend alike", () => {
  render(
    <ChapterTable
      chapters={[chapter(0, "One", { mode_share: { exposition: 0.5, mixed: 0.5 } })]}
      structure={fakeStructure(12, 3)}
      onPinBeat={() => {}}
    />,
  );
  const [expo, mixed] = Array.from(
    within(screen.getByRole("table")).getByRole("img", { name: "exposition 50%, mixed 50%" })
      .children,
  ) as HTMLElement[];
  expect(mixed.style.background).toContain("repeating-linear-gradient(135deg");
  expect(mixed.style.background).toContain("var(--muted)");
  expect(expo.style.background).toContain(WRITING_STYLE.exposition.color);
  expect(expo.style.background).not.toMatch(/gradient/);
  const swatch = (kind: string) =>
    (screen.getByText(kind).querySelector("span[aria-hidden]") as HTMLElement).style.background;
  for (const kind of ["action", "dialogue", "description", "reflection", "exposition", "mixed"])
    expect(swatch(kind)).toContain(WRITING_STYLE[kind].color);
});

test("Pace and Tension cells are named by their number and draw a bar of value / 4 × 48 px", () => {
  render(
    <ChapterTable
      chapters={[
        chapter(0, "One", { means: { pace: 2.1, tension: 3 } as never }),
        chapter(1, "Two"),
      ]}
      structure={fakeStructure(12, 3)}
      onPinBeat={() => {}}
    />,
  );
  const table = within(screen.getByRole("table"));
  const bar = (name: string) =>
    table.getByRole("cell", { name }).querySelector("[aria-hidden]") as HTMLElement;
  expect(parseFloat(bar("2.1").style.width)).toBeCloseTo(25.2);
  expect(bar("2.1").style.background).toBe("var(--ax-pace)");
  expect(bar("3.0").style.width).toBe("36px");
  expect(bar("3.0").style.background).toBe("var(--ax-tension)");
  expect(column(3)).toEqual(["2.1", "–"]);
  expect(table.getAllByRole("cell", { name: "–" })[0].querySelector("[aria-hidden]")).toBeNull();
});

test("a focused writing bar's tooltip lists every kind; a hovered segment alone is ringed and named with its share", async () => {
  const user = userEvent.setup();
  render(
    <ChapterTable
      chapters={[chapter(0, "One", { mode_share: { dialogue: 0.57, action: 0.43 } })]}
      structure={fakeStructure(12, 3)}
      onPinBeat={() => {}}
    />,
  );
  const bar = within(screen.getByRole("table")).getByRole("img", {
    name: "dialogue 57%, action 43%",
  });
  const [dialogue, action] = Array.from(bar.children) as HTMLElement[];
  act(() => bar.focus());
  expect(screen.getByRole("tooltip")).toHaveTextContent("dialogue 57%action 43%");
  for (const s of [dialogue, action]) {
    expect(s.style.boxShadow).toBe("");
    expect(s.style.opacity).toBe("");
  }
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({ left: 100, width: 100 } as DOMRect);
  fireEvent.pointerMove(bar, { clientX: 180 });
  expect(screen.getByRole("tooltip")).toHaveTextContent(/^action · 43%$/);
  expect(action.style.boxShadow).toBe("inset 0 0 0 1.5px var(--ink)");
  expect(action.style.opacity).toBe("");
  expect(dialogue.style.boxShadow).toBe("");
  expect(dialogue.style.opacity).toBe("0.7");
  fireEvent.pointerMove(bar, { clientX: 120 });
  expect(screen.getByRole("tooltip")).toHaveTextContent(/^dialogue · 57%$/);
  expect(dialogue.style.boxShadow).toBe("inset 0 0 0 1.5px var(--ink)");
  expect(action.style.opacity).toBe("0.7");
  // The pointer leaving a focused bar brings the whole list back.
  fireEvent.pointerLeave(bar);
  expect(screen.getByRole("tooltip")).toHaveTextContent("dialogue 57%action 43%");
  expect(dialogue.style.boxShadow).toBe("");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("hovering a writing bar names the segment under the pointer, and nothing off the bar", () => {
  render(
    <ChapterTable
      chapters={[chapter(0, "One", { mode_share: { dialogue: 0.57, action: 0.43 } })]}
      structure={fakeStructure(12, 3)}
      onPinBeat={() => {}}
    />,
  );
  const bar = within(screen.getByRole("table")).getByRole("img", {
    name: "dialogue 57%, action 43%",
  });
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({ left: 100, width: 100 } as DOMRect);
  fireEvent.mouseEnter(bar);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.pointerEnter(bar, { clientX: 180 });
  expect(screen.getByRole("tooltip")).toHaveTextContent(/^action · 43%$/);
  // Off the bar but still inside the tooltip's wrapper, as on the way to the panel.
  fireEvent.pointerLeave(bar);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.pointerEnter(bar, { clientX: 120 });
  expect(screen.getByRole("tooltip")).toHaveTextContent(/^dialogue · 57%$/);
});

test("a chapter with no writing measured has a bar but nothing to focus", () => {
  render(
    <ChapterTable
      chapters={[chapter(0, "One")]}
      structure={fakeStructure(12, 3)}
      onPinBeat={() => {}}
    />,
  );
  expect(screen.getByRole("img", { name: "no writing measured" })).not.toHaveAttribute("tabindex");
});

test("Enter on a chapter title pins its first passage, in the table and on the cards", async () => {
  const user = userEvent.setup();
  const onPin = vi.fn();
  const { unmount } = render(
    <ChapterTable
      chapters={[chapter(0, "One"), chapter(1, "Two")]}
      structure={fakeStructure(12, 3)}
      onPinBeat={onPin}
    />,
  );
  within(screen.getByRole("table")).getByRole("button", { name: "Two" }).focus();
  await user.keyboard("{Enter}");
  expect(onPin).toHaveBeenCalledExactlyOnceWith(4);
  onPin.mockClear();
  unmount();
  phone();
  render(
    <ChapterTable
      chapters={[chapter(0, "One"), chapter(1, "Two")]}
      structure={fakeStructure(12, 3)}
      onPinBeat={onPin}
    />,
  );
  within(screen.getByRole("list")).getByRole("button", { name: "2 Two" }).focus();
  await user.keyboard("{Enter}");
  expect(onPin).toHaveBeenCalledExactlyOnceWith(4);
});

test("each writing bar names its kinds and shares for assistive technology", () => {
  render(
    <ChapterTable
      chapters={[
        chapter(0, "One", { mode_share: { dialogue: 0.6, action: 0.4 } }),
        chapter(1, "Two"),
      ]}
      structure={fakeStructure(12, 3)}
      onPinBeat={() => {}}
    />,
  );
  const table = within(screen.getByRole("table"));
  expect(table.getByRole("img", { name: "dialogue 60%, action 40%" })).toBeInTheDocument();
  expect(table.getByRole("img", { name: "no writing measured" })).toBeInTheDocument();
});

test("on a phone each chapter is one button named by its number and title, with its numbers and its whole writing as the description", () => {
  phone();
  render(
    <ChapterTable
      chapters={[
        chapter(0, "One", {
          word_count: 4210,
          means: { pace: 2.1, tension: 2.8 } as never,
          event_count: 3,
          mode_share: { dialogue: 0.54, action: 0.46 },
        }),
      ]}
      structure={fakeStructure(12, 3)}
      onPinBeat={() => {}}
    />,
  );
  const row = within(screen.getByRole("list")).getByRole("button", { name: "1 One" });
  expect(row).toHaveTextContent("mostly dialogue, 54%");
  expect(row.querySelector("[tabindex]")).toBeNull();
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(row).toHaveAccessibleDescription(
    "4,210 words · pace 2.1 · tension 2.8 · 3 events dialogue 54%, action 46%",
  );
});

test("the phone list sorts from its own control, and the table drawn when the screen widens keeps that order", async () => {
  const user = userEvent.setup();
  const widen = phone();
  const chapters = [
    chapter(0, "Alpha", { means: { pace: 1 } as never }),
    chapter(1, "Beta", { means: { pace: 3 } as never }),
    chapter(2, "Gamma", { means: { pace: 2 } as never }),
  ];
  render(<ChapterTable chapters={chapters} structure={fakeStructure(6, 3)} onPinBeat={() => {}} />);
  const titles = () =>
    within(screen.getByRole("list"))
      .getAllByRole("button")
      .map(
        (b) =>
          b.getAttribute("aria-labelledby") &&
          document.getElementById(b.getAttribute("aria-labelledby")!.split(" ").pop()!)!
            .textContent,
      );
  expect(titles()).toEqual(["Alpha", "Beta", "Gamma"]);
  await user.selectOptions(screen.getByRole("combobox", { name: "Sorted by" }), "pace");
  expect(titles()).toEqual(["Beta", "Gamma", "Alpha"]);
  await widen();
  expect(screen.getByRole("columnheader", { name: /Pace/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  expect(column(1)).toEqual(["Beta", "Gamma", "Alpha"]);
});
