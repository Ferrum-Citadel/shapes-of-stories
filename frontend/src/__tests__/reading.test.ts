import { readingSentence } from "../lib/reading";
import type { Analysis, Archetype, Chapter } from "../types";
import { ROMAN, fakeAnalysis, fakeStructure } from "./fixtures";

// One chapter per entry, titled by `title`, with the given fortune and tension means.
function work(
  titles: string[],
  fortune: (number | null)[],
  tension: (number | null)[],
  archetype: Partial<Archetype> = { state: "named", shape: "fall" },
): [Analysis, Chapter[]] {
  const a = fakeAnalysis();
  const s = fakeStructure(titles.length * 2, titles.length);
  s.chapters = s.chapters.map((c) => ({ ...c, title: titles[c.idx] }));
  a.archetype = { ...a.archetype, ...archetype };
  a.chapters = titles.map((title, idx) => ({
    ...fakeAnalysis().chapters[0],
    idx,
    title,
    means: { fortune: fortune[idx], tension: tension[idx] } as Analysis["chapters"][0]["means"],
  }));
  return [a, s.chapters];
}

const gatsby = () =>
  work(
    ROMAN.map((r) => `Chapter ${r}`),
    [2.1, 2.3, 2.4, 2.6, 3.1, 2.5, 2.0, 1.4, 0.9],
    [1.2, 1.5, 1.6, 1.8, 1.7, 2.4, 3.2, 2.9, 2.2],
  );

test("names the shape, where fortune peaks and bottoms out, and where tension is highest", () => {
  expect(readingSentence(...gatsby())).toBe(
    "A tragedy: fortune peaks in chapter V and falls to its lowest in IX; tension highest in VII.",
  );
});

test("a low before the peak climbs to its height, and a work that only leans says so", () => {
  const [a, s] = work(["Chapter 1", "Chapter 2", "Chapter 3"], [1, 0.5, 3], [2, 1, 1], {
    state: "leans",
    shape: "fall_rise",
  });
  expect(readingSentence(a, s)).toBe(
    "Leans toward a man in a hole: fortune is lowest in chapter 2 and climbs to its height in 3; tension highest in 1.",
  );
});

test("a work with no clear shape says so, and a name of a person keeps its capital", () => {
  const [a, s] = gatsby();
  a.archetype = { ...a.archetype, state: "none", shape: null };
  expect(readingSentence(a, s)).toMatch(/^No clear shape: fortune peaks in chapter V/);
  a.archetype = { ...a.archetype, state: "named", shape: "rise_fall" };
  expect(readingSentence(a, s)).toMatch(/^An Icarus: /);
});

test("one chapter has no fortune clause", () => {
  const [a, s] = work(["The Whole Book"], [2.5], [1.5]);
  expect(readingSentence(a, s)).toBe("A tragedy.");
});

test("deciles are named by where they end, and titles without a numeral by their words up to a full stop", () => {
  const deciles = Array.from({ length: 10 }, (_, i) => `${i * 10}–${i * 10 + 10}%`);
  const [a, s] = work(deciles, [2, 3.5, 2, 2, 2, 2, 2, 2, 1, 2], [1, 1, 1, 1, 1, 1, 1, 3, 1, 1]);
  expect(readingSentence(a, s)).toBe(
    "A tragedy: fortune peaks around 20% and falls to its lowest around 90%; tension highest around 80%.",
  );
  const [b, t] = work(["Prologue", "The Long Night Before", "Epilogue"], [1, 2, 3], [3, 1, 1]);
  expect(readingSentence(b, t)).toBe(
    "A tragedy: fortune is lowest in Prologue and climbs to its height in Epilogue; tension highest in Prologue.",
  );
  const [c, u] = work(
    ["Prologue. Before the storm", "Middle", "Epilogue. After"],
    [1, 2, 3],
    [1, 1, 3],
  );
  expect(readingSentence(c, u)).toBe(
    "A tragedy: fortune is lowest in Prologue and climbs to its height in Epilogue; tension highest in Epilogue.",
  );
});

test("chapters that all read the same have no fortune clause", () => {
  const [a, s] = work(["I", "II", "III"], [2, 2, 2], [1, 3, 1]);
  expect(readingSentence(a, s)).toBe("A tragedy: tension highest in chapter II.");
});

test("chapters without means are left out", () => {
  const [a, s] = work(["I", "II", "III"], [null, 2, 3], [null, null, 2]);
  expect(readingSentence(a, s)).toBe(
    "A tragedy: fortune is lowest in chapter II and climbs to its height in III.",
  );
});
