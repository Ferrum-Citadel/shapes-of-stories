import { render, screen, within } from "@testing-library/react";
import CompareChart, { CompareLegend } from "../chart/CompareChart";
import Profile, { differenceWords } from "../components/Profile";
import { meanScores } from "../lib/stats";
import Mixes, { eventRates } from "../components/Mixes";
import type { Analysis, ChapterStat, EventMarker } from "../types";
import { fakeAnalysis, fakeStructure, noMeans, ramp } from "./fixtures";

test("the chart draws both works on the 0 to 4 scale, the first solid wax and the second dashed ink, with the ribbon between", () => {
  const { container } = render(
    <CompareChart a={ramp} b={ramp.map((v) => 4 - v)} axis="warmth" names={["Work X", "Work Y"]} />,
  );
  const chart = screen.getByRole("img", { name: "Warmth: Work X versus Work Y" });
  expect(chart.getAttribute("viewBox")).toMatch(/ 260$/);
  const a = container.querySelector("[data-curve=a]")!,
    b = container.querySelector("[data-curve=b]")!;
  expect(a.getAttribute("stroke")).toBe("var(--accent)");
  expect(a.getAttribute("stroke-width")).toBe("2.2");
  expect(a.getAttribute("stroke-dasharray")).toBeNull();
  expect(b.getAttribute("stroke")).toBe("var(--ink)");
  expect(b.getAttribute("stroke-width")).toBe("2");
  expect(b.getAttribute("stroke-dasharray")).toBe("6 3");
  const ribbon = container.querySelector("[data-ribbon]")!;
  expect(ribbon.getAttribute("fill")).toBe("var(--select)");
  expect(ribbon.getAttribute("d")).toMatch(/^M.+Z$/);
  // Both works share the layer, so its words are set in ink rather than in one layer's color.
  for (const t of ["tender", "cold"])
    expect(within(chart).getByText(t)).toHaveAttribute("fill", "var(--ink)");
  for (const t of ["Warmth", "beginning", "end"]) expect(within(chart).getByText(t)).toBeVisible();
  expect(within(chart).queryByText(/average/)).toBeNull();
  expect(container.querySelector("[data-chapter-tick]")).toBeNull();
});

test("the legend names the two works beside a solid and a dashed swatch, without letters", () => {
  const { container } = render(<CompareLegend names={["Work X", "Work Y"]} />);
  expect(container).toHaveTextContent(/^Work X\s*Work Y$/);
  const lines = [...container.querySelectorAll("line")];
  expect(lines.map((l) => l.getAttribute("stroke"))).toEqual(["var(--accent)", "var(--ink)"]);
  expect(lines.map((l) => l.getAttribute("stroke-dasharray"))).toEqual([null, "6 3"]);
});

const chapter = (word_count: number, means: Partial<ChapterStat["means"]>): ChapterStat => ({
  idx: 0,
  title: "",
  word_count,
  beats: 1,
  means: { ...noMeans(), ...means },
  mode_share: {},
  event_count: 0,
  start_bin: 0,
});
const withChapters = (chapters: ChapterStat[]): Analysis => ({ ...fakeAnalysis(), chapters });

test("a work's mean on a layer is weighted by its chapters' words, and chapters without a mean are skipped", () => {
  const m = meanScores(
    withChapters([
      chapter(1000, { fortune: 1, warmth: 2, pace: null }),
      chapter(3000, { fortune: 3, warmth: null, pace: null }),
    ]),
  );
  expect(m.fortune).toBe(2.5);
  expect(m.warmth).toBe(2);
  expect(m.pace).toBeNull();
});

const names: [string, string] = ["Pride and Prejudice", "Work Y"];

test("a difference is put in words from half a point either way, naming the higher work", () => {
  expect(differenceWords("warmth", 2.6, 2.1, names)).toBe("Pride and Prejudice is warmer");
  expect(differenceWords("tension", 1.0, 1.5, names)).toBe("Work Y is more gripping");
  expect(differenceWords("sorrow", 1, 3, names)).toBe("Work Y is sadder");
  expect(differenceWords("fortune", 3, 1, names)).toBe("Pride and Prejudice is better off");
  expect(differenceWords("pace", 2.0, 2.49, names)).toBeNull();
  expect(differenceWords("pace", 2.49, 2.0, names)).toBeNull();
  expect(differenceWords("pace", null, 3, names)).toBeNull();
});

test("a long title is cut to 28 characters in the difference words", () => {
  const long: [string, string] = ["The Strange Case of Dr Jekyll and Mr Hyde", "Y"];
  expect(differenceWords("wonder", 3, 1, long)).toBe(
    "The Strange Case of Dr Jekyl… is more wondrous",
  );
});

// The header row names both works; nowhere does a letter stand in for them.
function expectTitledColumns(table: HTMLElement) {
  const heads = within(table).getAllByRole("columnheader");
  expect(heads.map((h) => h.textContent)).toEqual(["Pride and Prejudice", "Work Y"]);
  expect(table.querySelector("thead td")).toBeEmptyDOMElement();
  for (const h of heads) {
    expect(h).toHaveAttribute("scope", "col");
    expect(h.querySelector("line")).not.toBeNull();
    expect(h.querySelector(".truncate")).toHaveAttribute("title", h.textContent);
  }
  const lines = heads.map((h) => h.querySelector("line")!);
  expect(lines.map((l) => l.getAttribute("stroke-dasharray"))).toEqual([null, "6 3"]);
  expect(table.textContent).not.toMatch(/\b[AB]\b/);
}

test("the profile is a table with the two titles over a row per layer and the difference in words", () => {
  const a = withChapters([chapter(1, { warmth: 3, tension: 1 })]),
    b = withChapters([chapter(1, { warmth: 1, tension: 1.2 })]);
  render(<Profile a={a} b={b} names={names} />);
  const table = screen.getByRole("table", { name: "Mean score on each layer" });
  expectTitledColumns(table);
  const rows = within(table).getAllByRole("rowheader");
  expect(rows).toHaveLength(10);
  rows.forEach((r) => expect(r).toHaveAttribute("scope", "row"));
  const warmth = rows.find((r) => r.textContent?.startsWith("Warmth"))!.closest("tr")!;
  expect(warmth).toHaveTextContent(/Warmth\s*Pride and Prejudice is warmer\s*3\.0\s*1\.0/);
  const fills = [...warmth.querySelectorAll<HTMLElement>("[data-fill]")];
  expect(fills.map((f) => f.style.background)).toEqual(["var(--accent)", "var(--ink)"]);
  const tension = rows.find((r) => r.textContent?.startsWith("Tension"))!.closest("tr")!;
  expect(tension).not.toHaveTextContent(/ is /);
});

const ev = (type: EventMarker["type"], strength: EventMarker["strength"]): EventMarker => ({
  type,
  strength,
  beat_idx: 0,
  bin: 0,
  probability: 0.9,
});

test("events are counted per 10,000 words, strong ones only", () => {
  const a = fakeAnalysis();
  a.events = [ev("reveal", "strong"), ev("reveal", "strong"), ev("reveal", "strong")];
  a.events.push(ev("reveal", "faint"), ev("death", "strong"));
  const rates = eventRates(a, 20000);
  expect(rates.reveal).toBe(1.5);
  expect(rates.death).toBe(0.5);
  expect(rates.betrayal).toBe(0);
});

test("the mixes are a table of the nine events by the larger rate, then the writing of each work", () => {
  const a = fakeAnalysis(),
    b = fakeAnalysis();
  a.events = [ev("death", "strong")];
  b.events = [ev("reveal", "strong"), ev("reveal", "strong")];
  a.mode_share = { dialogue: 0.6, action: 0.4 };
  b.mode_share = { exposition: 1 };
  render(
    <Mixes
      a={{ label: names[0], analysis: a, structure: { ...fakeStructure(), word_count: 10000 } }}
      b={{ label: names[1], analysis: b, structure: { ...fakeStructure(), word_count: 10000 } }}
    />,
  );
  const table = screen.getByRole("table", { name: "Events and writing" });
  expectTitledColumns(table);
  // The two label rows head their groups; the rows proper are headed by their event or work.
  const heads = within(table)
    .getAllByRole("rowheader")
    .filter((h) => h.getAttribute("scope") === "row");
  const text = (hs: HTMLElement[]) => hs.map((h) => h.textContent);
  expect(text(heads.slice(0, 2))).toEqual(["reveal", "death"]);
  expect(text(heads.slice(9))).toEqual(names);
  expect(heads).toHaveLength(11);
  const groups = [...table.querySelectorAll("th[scope=rowgroup]")];
  expect(groups.map((g) => [g.textContent, g.getAttribute("colspan")])).toEqual([
    ["Events per 10,000 words", "3"],
    ["Writing", "3"],
  ]);
  expect(heads[0].closest("tr")).toHaveTextContent(/reveal\s*0\.0\s*2\.0/);
  expect(heads[1].closest("tr")).toHaveTextContent(/death\s*1\.0\s*0\.0/);
  expect(heads[0].querySelector("svg")).not.toBeNull();
  expect(heads[9].querySelector("line")).not.toBeNull();
  const bars = within(table).getAllByRole("img", { name: /%/ });
  expect(bars.map((x) => x.getAttribute("aria-label"))).toEqual([
    "Pride and Prejudice: dialogue 60%, action 40%",
    "Work Y: exposition 100%",
  ]);
  expect(bars[0]).toHaveAttribute("tabindex", "0");
  expect(bars[0].closest("td")).toHaveAttribute("colspan", "2");
});
