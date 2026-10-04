import { PLOT, noteY, pinMark, pinNote, tickLabels, wordsW } from "../chart/ChartFrame";
import { drawnRange } from "../chart/curves";
import { fakeStructure } from "./fixtures";

// "chapter XXIV · passage 87 · pinned" is 34 characters, about 221 units; "passage 87 · pinned" is 19, about 124.
describe("pinNote", () => {
  test("on a wide chart the note sits right of the line", () => {
    expect(pinNote(200, "chapter XXIV", 86, 900)).toEqual({
      text: "chapter XXIV · passage 87 · pinned",
      at: 208,
      anchor: "start",
    });
  });

  test("near the right edge it flips to the left of the line", () => {
    expect(pinNote(800, "chapter XXIV", 86, 900)).toEqual({
      text: "chapter XXIV · passage 87 · pinned",
      at: 792,
      anchor: "end",
    });
    expect(pinNote(400, "chapter XXIV", 86, 450)).toEqual({
      text: "chapter XXIV · passage 87 · pinned",
      at: 392,
      anchor: "end",
    });
  });

  test("the pinned passage's chapter is named as the ribbon names it", () => {
    const s = fakeStructure(4, 2);
    const note = () =>
      pinMark(
        s,
        0,
        (b) => b * 9,
        () => 100,
        900,
        "fortune",
        null,
      ).text;
    s.chapters[0].title = "CHAPTER VI. Pig and Pepper";
    expect(note()).toBe("chapter VI · passage 1 · pinned");
    s.chapters[0].title = "The Very Long Title Of This Chapter";
    expect(note()).toBe("The Very Long Title Of… · passage 1 · pinned");
  });

  test("where neither side has room for the title it is dropped", () => {
    expect(pinNote(225, "chapter XXIV", 86, 450)).toEqual({
      text: "passage 87 · pinned",
      at: 233,
      anchor: "start",
    });
  });

  test("a first pin says how to let go, the hint outranking the chapter's name where both do not fit", () => {
    expect(pinNote(200, "chapter XXIV", 86, 900, true).text).toBe(
      "chapter XXIV · passage 87 · pinned · Esc releases",
    );
    expect(pinNote(200, "chapter XXIV", 86, 500, true).text).toBe(
      "passage 87 · pinned · Esc releases",
    );
    expect(pinNote(225, "chapter XXIV", 86, 450, true).text).toBe("passage 87 · pinned");
  });

  test("on a chart too narrow for either side the note is held inside the plot, over the line", () => {
    expect(pinNote(140, "chapter XXIV", 86, 280)).toEqual({
      text: "passage 87 · pinned",
      at: 140 - (19 * 6.5) / 2,
      anchor: "start",
    });
  });
});

describe("noteY", () => {
  const note = (at: number, anchor: "start" | "end", text = "passage 87 · pinned") => ({
    text,
    at,
    anchor,
  });
  const end = 900 - PLOT.r - 4 - wordsW("gripping") - 8;

  test("a note running into the top-left words drops one line, end-anchored ones by their left edge", () => {
    expect(noteY(note(PLOT.l + 20, "start"), "fortune", null, 900)).toBe(PLOT.t + 28);
    expect(noteY(note(150, "end"), "fortune", null, 900)).toBe(PLOT.t + 28);
    expect(noteY(note(400, "start"), "fortune", null, 900)).toBe(PLOT.t + 14);
  });

  test("a note running into the right-hand words drops only when a second layer has words there", () => {
    const near = note(end - 19 * 6.5 + 1, "start");
    expect(noteY(near, "fortune", "tension", 900)).toBe(PLOT.t + 28);
    expect(noteY(near, "fortune", null, 900)).toBe(PLOT.t + 14);
    expect(noteY(note(end - 19 * 6.5 - 1, "start"), "fortune", "tension", 900)).toBe(PLOT.t + 14);
  });
});

describe("tickLabels", () => {
  const ch = (idx: number, title: string, start_bin: number | null) => ({ idx, title, start_bin });

  test("a tick is labeled only once the last label has room, and never past the right edge", () => {
    const labels = tickLabels(
      [
        ch(0, "Chapter I", 0),
        ch(1, "Chapter II", 1),
        ch(2, "Chapter III", 2),
        ch(3, "Chapter IV", null),
        ch(4, "Chapter V", 50),
        ch(5, "Chapter VI", 99),
      ],
      900,
    );
    expect(labels.map((l) => l.text)).toEqual(["I", "V"]);
    expect(labels.map((l) => l.idx)).toEqual([0, 4]);
    expect(labels[0].x).toBe(12);
  });

  test("a narrower chart thins the same ticks further", () => {
    const chapters = Array.from({ length: 10 }, (_, i) => ch(i, `Chapter ${i + 1}`, i * 10));
    expect(tickLabels(chapters, 900)).toHaveLength(10);
    expect(tickLabels(chapters, 280).map((l) => l.text)).toEqual(["1", "3", "5", "7", "9"]);
  });

  test("a title of several words without a numeral is labeled with its place in the book", () => {
    expect(tickLabels([ch(6, "The Last Word", 40)], 900)[0].text).toBe("7");
  });
});

describe("drawnRange", () => {
  test("empty runs at either end are left out, empty bins between are not", () => {
    expect(drawnRange([])).toEqual([0, 99]);
    expect(drawnRange([0, 1, 2, 50, 97, 98, 99])).toEqual([3, 96]);
  });

  test("a work with every bin empty draws nothing past its last bin", () => {
    expect(drawnRange(Array.from({ length: 100 }, (_, i) => i))).toEqual([99, 99]);
  });
});
