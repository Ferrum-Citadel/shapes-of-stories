import { beatForBin, binsOfBeat, chapterName, passageMean } from "../lib/bins";
import type { Structure } from "../types";

const prose: Structure = {
  sections: [],
  chapters: [],
  chapter_source: "headings",
  preset: "prose",
  word_count: 400,
  beats: [0, 1, 2, 3].map((i) => ({
    idx: i,
    chapter_idx: i < 2 ? 0 : 1,
    start_cp: i * 100,
    end_cp: i * 100 + 100,
    word_count: 100,
    start_s: null,
    end_s: null,
  })),
};

const transcript: Structure = {
  sections: [],
  chapters: [],
  chapter_source: "headings",
  preset: "transcript",
  word_count: 0,
  beats: [
    { idx: 0, chapter_idx: 0, start_cp: 0, end_cp: 0, word_count: 0, start_s: 10, end_s: 30 },
    { idx: 1, chapter_idx: 0, start_cp: 0, end_cp: 0, word_count: 0, start_s: 30, end_s: 110 },
  ],
};

test("binsOfBeat mirrors the backend's word-count bin mapping", () => {
  expect(binsOfBeat(prose, 0)).toEqual([0, 24]);
  expect(binsOfBeat(prose, 1)).toEqual([25, 49]);
  expect(binsOfBeat(prose, 2)).toEqual([50, 74]);
  expect(binsOfBeat(prose, 3)).toEqual([75, 99]);
});

test("binsOfBeat mirrors the backend's transcript timestamp bin mapping", () => {
  expect(binsOfBeat(transcript, 0)).toEqual([0, 19]);
  expect(binsOfBeat(transcript, 1)).toEqual([20, 99]);
});

test("beatForBin picks the beat covering most of the bin, and the earlier one on a tie", () => {
  expect([0, 24, 25, 99].map((bin) => beatForBin(prose, bin))).toEqual([0, 0, 1, 3]);
  expect([19, 20].map((bin) => beatForBin(transcript, bin))).toEqual([0, 1]);
  // The boundary at word 102 cuts bin 25 (words 100 to 104) in half.
  const tie: Structure = {
    ...prose,
    beats: [
      { ...prose.beats[0], word_count: 102 },
      { ...prose.beats[1], word_count: 298 },
    ],
  };
  expect([25, 26].map((bin) => beatForBin(tie, bin))).toEqual([0, 1]);
});

test("passageMean averages the raw scores over the passage's bins, leaving empty bins out", () => {
  const raw: (number | null)[] = Array(100).fill(0);
  raw.splice(25, 25, ...Array(25).fill(null));
  raw[30] = 1;
  raw[40] = 2.5;
  expect(passageMean(raw, 1, prose)).toBe(1.75);
  expect(passageMean(Array(100).fill(null), 1, prose)).toBeNull();
});

test("chapterName is the chapter's numeral, its stretch of the book, or its title up to the first full stop", () => {
  expect(chapterName("Chapter 15. Number 34 and Number 27", 14)).toBe("chapter 15");
  expect(chapterName("XII", 11)).toBe("chapter XII");
  expect(chapterName("10–20 %", 1)).toBe("around 20%");
  expect(chapterName("Prologue. In which we begin", 0)).toBe("Prologue");
  expect(chapterName("The Interminable Account of How Everybody Arrived", 3)).toBe(
    "The Interminable Accoun…",
  );
});
