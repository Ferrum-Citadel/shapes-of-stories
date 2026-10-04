import { makeSlicer, paragraphsOf } from "../lib/text";
import { zscore, pearson } from "../lib/stats";
import { linear } from "../lib/scale";
import { bandAt, blend, curveAt } from "../lib/curves";
import { fakeAnalysis } from "./fixtures";
import {
  saveLocal,
  loadLocal,
  listLocal,
  deleteLocal,
  exportFile,
  importFile,
  importAndSave,
  analyzedBefore,
  keptMine,
  setKeptMine,
} from "../lib/local";
import "fake-indexeddb/auto";

test("code point slicing handles astral characters", () => {
  const t = "a😀b\n\nc";
  expect(makeSlicer(t)(1, 3)).toBe("😀b");
  expect(makeSlicer(t)(3, 6)).toBe("\n\nc");
  expect(paragraphsOf(makeSlicer(t), 0, 6)).toEqual(["a😀b", "c"]);
  expect(makeSlicer("plain")(1, 3)).toBe("la");
});

test("one slicer serves every passage of a book", () => {
  const f = makeSlicer("a😀b\n\nc\n\nd");
  expect(paragraphsOf(f, 0, 6)).toEqual(["a😀b", "c"]);
  expect(paragraphsOf(f, 6, 9)).toEqual(["d"]);
});

test("paragraphsOf falls back to the whole beat when no paragraph break survives filtering", () => {
  const t = "   \n\n  ";
  expect(paragraphsOf(makeSlicer(t), 0, t.length)).toEqual([t]);
});

test("a linear map runs both ways, and a clamped one keeps to its ends", () => {
  const x = linear([0, 99], [44, 888], true);
  expect([x(0), x(99), x(-5), x(120), x.invert(466), x.invert(0)]).toEqual([
    44, 888, 44, 888, 49.5, 0,
  ]);
  const y = linear([-2.2, 2.2], [56, 4]);
  expect(y(0)).toBeCloseTo(30);
  expect(y(3)).toBeLessThan(4);
  expect(y.invert(4)).toBeCloseTo(2.2);
});

test("smoothing blends the stored detail and shape curves, keeping the stored arrays at the ends", () => {
  expect(blend([0, 2], [4, 6], 0)).toEqual([0, 2]);
  expect(blend([0, 2], [4, 6], 1)).toEqual([4, 6]);
  expect(blend([0, 2], [4, 6], 0.5)).toEqual([2, 4]);
  const bins = fakeAnalysis().bins.fortune;
  bins.detail = bins.shape.map((v) => v + 1);
  expect(curveAt(bins, 1)).toBe(bins.shape);
  expect(curveAt(bins, 0)).toBe(bins.detail);
  expect(curveAt(bins, 0.5)[3]).toBeCloseTo(bins.shape[3] + 0.5);
  expect(bandAt(bins, 1)).toBe(bins.band.shape);
  expect(bandAt(bins, 0)).toBe(bins.band.detail);
  bins.band.detail = [bins.band.shape[0].map((v) => v - 1), bins.band.shape[1].map((v) => v + 1)];
  const [lo, hi] = bandAt(bins, 0.5);
  expect(lo[7]).toBeCloseTo(bins.band.shape[0][7] - 0.5);
  expect(hi[7]).toBeCloseTo(bins.band.shape[1][7] + 0.5);
});

test("stats", () => {
  expect(zscore([5, 5, 5])).toEqual([0, 0, 0]);
  expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
});

test("local store roundtrip and file export/import", async () => {
  const w = {
    id: "w1",
    title: "T",
    author: null,
    text: "hello",
    structure: {
      sections: [],
      chapters: [],
      beats: [],
      chapter_source: "deciles",
      preset: "prose" as const,
      word_count: 1,
    },
    analysis: null,
    answers: {},
    savedAt: 1,
    question_set_version: "q4",
    model_id: "jev-1.13.0",
  };
  await saveLocal(w);
  expect((await loadLocal("w1"))?.text).toBe("hello");
  expect((await listLocal()).map((x) => x.id)).toEqual(["w1"]);
  const blob = exportFile(w, false);
  const back = await importFile(new File([blob], "t.shapes.json"));
  expect(back.text).toBe("");
  expect(back.structure.preset).toBe("prose");
  expect([back.question_set_version, back.model_id]).toEqual(["q4", "jev-1.13.0"]);
  const older = exportFile({ ...w, question_set_version: undefined, model_id: undefined }, false);
  const olderBack = await importFile(new File([older], "t.shapes.json"));
  expect([olderBack.question_set_version, olderBack.model_id]).toEqual([undefined, undefined]);
  const hashed = await importFile(new File([exportFile({ ...w, content_hash: "h1" }, false)], "t"));
  expect([hashed.content_hash, olderBack.content_hash]).toEqual(["h1", undefined]);
  const costed = await importFile(new File([exportFile({ ...w, cost_usd: 0.03 }, false)], "t"));
  expect(costed.cost_usd).toBe(0.03);
  await deleteLocal("w1");
  expect(await loadLocal("w1")).toBeUndefined();
});

test("importAndSave keeps existing text and answers when the imported file has neither", async () => {
  const structure = {
    sections: [],
    chapters: [],
    beats: [],
    chapter_source: "deciles",
    preset: "prose" as const,
    word_count: 1,
  };
  const existingAnswers = { 0: { missing: true, error: "x" } as const };
  const existing = {
    id: "w2",
    title: "T",
    author: null,
    text: "hello",
    structure,
    analysis: null,
    answers: existingAnswers,
    savedAt: 1,
    content_hash: "h2",
  };
  await saveLocal(existing);
  const payload = {
    version: 1,
    id: "w2",
    title: "T2",
    author: null,
    structure,
    analysis: null,
    answers: {},
    text: "",
  };
  const imported = await importAndSave(new File([JSON.stringify(payload)], "t.shapes.json"));
  expect(imported.text).toBe("hello");
  expect(imported.answers).toEqual(existingAnswers);
  expect((await loadLocal("w2"))?.text).toBe("hello");
  expect((await loadLocal("w2"))?.content_hash).toBe("h2");
  await deleteLocal("w2");
});

test("any save or delete drops the wall's kept list of the reader's works", async () => {
  const w = {
    id: "k1",
    title: "T",
    author: null,
    text: "",
    structure: {
      sections: [],
      chapters: [],
      beats: [],
      chapter_source: "deciles",
      preset: "prose" as const,
      word_count: 1,
    },
    analysis: null,
    answers: {},
    savedAt: 1,
  };
  setKeptMine([]);
  await saveLocal(w);
  expect(keptMine()).toBeUndefined();
  setKeptMine([]);
  await deleteLocal("k1");
  expect(keptMine()).toBeUndefined();
});

test("the search for a text seen before stops at the newest match, hashing nothing older", async () => {
  const base = {
    title: "T",
    author: null,
    structure: {
      sections: [],
      chapters: [],
      beats: [],
      chapter_source: "deciles",
      preset: "prose" as const,
      word_count: 1,
    },
    analysis: fakeAnalysis(),
    answers: {},
  };
  await saveLocal({ ...base, id: "new", text: "x", savedAt: 2 });
  await saveLocal({ ...base, id: "old", text: "y", savedAt: 1 });
  const sha = "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881";
  expect((await analyzedBefore(sha))?.id).toBe("new");
  expect((await loadLocal("new"))?.content_hash).toBe(sha);
  expect((await loadLocal("old"))?.content_hash).toBeUndefined();
  await deleteLocal("new");
  await deleteLocal("old");
});
