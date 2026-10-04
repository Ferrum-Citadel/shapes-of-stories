import { render, fireEvent } from "@testing-library/react";
import ArcChart, { type ArcChartProps } from "../chart/ArcChart";
import { PLOT, wordsW, xOf } from "../chart/ChartFrame";
import { chapterNumeral } from "../lib/bins";
import { LAYERS } from "../lib/layers";
import type { Analysis, Axis } from "../types";
import { fakeAnalysis, fakeStructure, openingProps } from "./fixtures";

const structure = fakeStructure(4, 2);

function bbox(container: HTMLElement) {
  // every drawn point of every path must be inside the plot frame; curve segments list several x,y pairs, so take every second number
  const paths = Array.from(container.querySelectorAll("path[data-layer], path[data-band]"));
  const ys = paths.flatMap((p) =>
    ((p.getAttribute("d") ?? "").match(/-?\d+(\.\d+)?/g) ?? [])
      .map(Number)
      .filter((_, i) => i % 2 === 1),
  );
  return { minY: Math.min(...ys), maxY: Math.max(...ys) };
}

test("curves are clamped into the frame even when the data leaves 0–4", () => {
  const a = fakeAnalysis();
  a.bins.fortune.shape = a.bins.fortune.shape.map((_, i) => (i < 50 ? -1 : 5));
  a.bins.fortune.band.shape[0] = a.bins.fortune.band.shape[0].map(() => -2);
  const { container } = render(
    <ArcChart
      analysis={a}
      structure={fakeStructure()}
      axes={["fortune"]}
      smoothing={1}
      showBand
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
    />,
  );
  const { minY, maxY } = bbox(container);
  expect(minY).toBeGreaterThanOrEqual(PLOT.t - 0.01);
  expect(maxY).toBeLessThanOrEqual(320 - PLOT.b + 0.01);
  expect(container.querySelector("clipPath")).toBeTruthy();
});

test("axes are worded: good/ill with fortune, high/low without", () => {
  const { container, rerender } = render(
    <ArcChart
      analysis={fakeAnalysis()}
      structure={fakeStructure()}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
    />,
  );
  expect(container.textContent).toMatch(/good/);
  expect(container.textContent).toMatch(/ill/);
  expect(container.textContent).toMatch(/beginning/);
  expect(container.textContent).toMatch(/end/);
  rerender(
    <ArcChart
      analysis={fakeAnalysis()}
      structure={fakeStructure()}
      axes={["tension"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
    />,
  );
  expect(container.textContent).toMatch(/gripping/);
  expect(container.textContent).toMatch(/calm/);
  expect(container.textContent).not.toMatch(/\bill\b/);
});

describe("axis words", () => {
  const frame = (p: Partial<ArcChartProps> = {}) =>
    render(
      <ArcChart
        analysis={fakeAnalysis()}
        structure={fakeStructure()}
        axes={["fortune"]}
        smoothing={1}
        showBand={false}
        showRaw={false}
        shown={null}
        pinned={null}
        onHover={() => {}}
        onPin={() => {}}
        {...p}
      />,
    ).container;
  const word = (c: HTMLElement, s: string) =>
    Array.from(c.querySelectorAll("text")).find((t) => t.textContent === s);

  test("the focus layer's words sit inside the plot at the top-left and bottom-left, in its color, under its name", () => {
    const c = frame({ axes: ["fortune", "tension", "mystery"], focusAxis: "tension" });
    const high = word(c, "gripping")!,
      low = word(c, "calm")!,
      name = word(c, "Tension")!;
    for (const el of [high, low]) {
      expect(el).toHaveAttribute("fill", LAYERS.tension.color);
      expect(Number(el.getAttribute("x"))).toBeGreaterThanOrEqual(PLOT.l);
      expect(el.getAttribute("text-anchor") ?? "start").toBe("start");
      expect(el).toHaveAttribute("stroke", "var(--bg)");
    }
    expect(Number(high.getAttribute("y"))).toBeGreaterThan(PLOT.t);
    expect(Number(low.getAttribute("y"))).toBeLessThan(320 - PLOT.b);
    expect(Number(high.getAttribute("y")) - Number(name.getAttribute("y"))).toBe(12);
    expect(word(c, "good")).toBeUndefined();
  });

  test("a focus layer that is not drawn gives the words to the first drawn layer", () => {
    const c = frame({ axes: ["mystery"], focusAxis: "tension" });
    expect(word(c, "deep puzzle")).toHaveAttribute("fill", LAYERS.mystery.color);
    expect(word(c, "gripping")).toBeUndefined();
  });

  test("with exactly two layers the one not in focus takes the right-hand corners", () => {
    const c = frame({ axes: ["fortune", "tension"] });
    for (const s of ["gripping", "calm"]) {
      const el = word(c, s)!;
      expect(el).toHaveAttribute("fill", LAYERS.tension.color);
      expect(el).toHaveAttribute("text-anchor", "end");
      expect(Number(el.getAttribute("x"))).toBeLessThanOrEqual(PLOT.width - PLOT.r);
    }
    expect(word(c, "good")).toHaveAttribute("fill", LAYERS.fortune.color);
    const swapped = frame({ axes: ["fortune", "tension"], focusAxis: "tension" });
    expect(word(swapped, "gripping")!.getAttribute("text-anchor") ?? "start").toBe("start");
    expect(word(swapped, "good")).toHaveAttribute("text-anchor", "end");
    const three = frame({ axes: ["fortune", "tension", "mystery"] });
    expect(word(three, "gripping")).toBeUndefined();
  });

  test("the mid tick goes and the three gridlines stay", () => {
    const c = frame({ analysis: { ...fakeAnalysis(), chapters: [] } });
    expect(word(c, "2")).toBeUndefined();
    expect(c.querySelectorAll('line[stroke-opacity="0.08"]')).toHaveLength(3);
  });

  test("the pinned note drops one line where it would run into the top-left words", () => {
    const s = fakeStructure(40, 4);
    const note = (pinned: number) =>
      frame({ structure: s, shown: pinned, pinned }).querySelector("[data-annotation]")!;
    expect(Number(note(0).getAttribute("x"))).toBeLessThan(PLOT.l + wordsW("good") + 8);
    expect(note(0)).toHaveAttribute("y", String(PLOT.t + 28));
    expect(note(20)).toHaveAttribute("y", String(PLOT.t + 14));
  });
});

test("hover reports a beat and click pins it; the pinned column is annotated", () => {
  const onHover = vi.fn();
  const onPin = vi.fn();
  const { container, rerender } = render(
    <ArcChart
      analysis={fakeAnalysis()}
      structure={fakeStructure()}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={onHover}
      onPin={onPin}
    />,
  );
  const overlay = container.querySelector("[data-overlay]")!;
  overlay.getBoundingClientRect = () =>
    ({
      left: 0,
      width: 900,
      top: 0,
      height: 320,
      right: 900,
      bottom: 320,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  fireEvent.mouseMove(overlay, { clientX: 450 });
  expect(onHover).toHaveBeenCalled();
  fireEvent.click(overlay, { clientX: 450 });
  expect(onPin).toHaveBeenCalledWith(onHover.mock.calls[0][0]);
  rerender(
    <ArcChart
      analysis={fakeAnalysis()}
      structure={fakeStructure()}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={2}
      pinned={2}
      onHover={onHover}
      onPin={onPin}
    />,
  );
  expect(container.querySelector("[data-pinned] circle")!.getAttribute("stroke")).toBe(
    "var(--mark)",
  );
  expect(container.textContent).toMatch(/passage 3/i);
});

test("on the phone drawing the pinned note stays inside the plot, dropping the chapter title where neither side has room", () => {
  const s = fakeStructure(12, 3);
  s.chapters = s.chapters.map((c) => ({
    ...c,
    title: "Stave Three: The Second of the Three Spirits",
  }));
  const notes = Array.from({ length: 12 }, (_, pinned) => {
    const { container, unmount } = render(
      <ArcChart
        analysis={fakeAnalysis()}
        structure={s}
        axes={["fortune"]}
        smoothing={1}
        showBand={false}
        showRaw={false}
        shown={pinned}
        pinned={pinned}
        onHover={() => {}}
        onPin={() => {}}
        width={450}
        height={300}
      />,
    );
    const el = container.querySelector("[data-annotation]")!;
    const x = Number(el.getAttribute("x")),
      w = (el.textContent ?? "").length * 6.5;
    const [from, to] = el.getAttribute("text-anchor") === "end" ? [x - w, x] : [x, x + w];
    expect(from).toBeGreaterThanOrEqual(PLOT.l);
    expect(to).toBeLessThanOrEqual(450 - PLOT.r);
    unmount();
    return el.textContent ?? "";
  });
  expect(notes[0]).toMatch(/^Stave Three/);
  expect(notes[11]).toMatch(/^Stave Three/);
  expect(notes[5]).toBe("passage 6 · pinned");
});

// The note held over the line, where neither side has room, is pinned down in chartParts.
test("on the narrowest phones the pinned note stays inside the plot, on whichever side of the line has room", () => {
  const s = fakeStructure(12, 3);
  const anchors = new Set<string>();
  for (const width of [280, 288, 296, 304, 312, 320])
    for (let pinned = 0; pinned < 12; pinned++) {
      const { container, unmount } = render(
        <ArcChart
          analysis={fakeAnalysis()}
          structure={s}
          axes={["fortune"]}
          smoothing={1}
          showBand={false}
          showRaw={false}
          shown={pinned}
          pinned={pinned}
          onHover={() => {}}
          onPin={() => {}}
          width={width}
          height={200}
        />,
      );
      const el = container.querySelector("[data-annotation]")!;
      const x = Number(el.getAttribute("x")),
        w = (el.textContent ?? "").length * 6.5,
        pinX = Number(container.querySelector("[data-pinned] line")!.getAttribute("x1"));
      const [from, to] = el.getAttribute("text-anchor") === "end" ? [x - w, x] : [x, x + w];
      expect(from).toBeGreaterThanOrEqual(PLOT.l);
      expect(to).toBeLessThanOrEqual(width - PLOT.r);
      anchors.add(from < pinX && to > pinX ? "over" : to <= pinX ? "left" : "right");
      unmount();
    }
  expect([...anchors].sort()).toEqual(["left", "right"]);
});

test("renders an 8-beat work and labels a 135-chapter one only where there is room", () => {
  const small = fakeStructure(8);
  const big = fakeStructure(300, 135);
  const a = fakeAnalysis();
  const r1 = render(
    <ArcChart
      analysis={a}
      structure={small}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
    />,
  );
  expect(r1.container.querySelector("path[data-layer=fortune]")).toBeTruthy();
  // Roman numerals run up to eight characters, so a label's own width, not the 28-unit floor, sets the spacing.
  const roman = (n: number) => {
    let s = "";
    for (const [v, r] of [
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ] as const)
      while (n >= v) {
        s += r;
        n -= v;
      }
    return s;
  };
  const bigA = {
    ...a,
    chapters: Array.from({ length: 135 }, (_, i) => ({
      ...a.chapters[0],
      idx: i,
      title: `CHAPTER ${roman(i + 1)}.`,
      start_bin: Math.floor((i / 135) * 100),
    })),
  };
  const r2 = render(
    <ArcChart
      analysis={bigA}
      structure={big}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
    />,
  );
  const labels = Array.from(r2.container.querySelectorAll("[data-chapter-label]"));
  const xs = labels.map((el) => Number(el.getAttribute("x")));
  expect(labels.length).toBeGreaterThan(10);
  xs.slice(1).forEach((v, i) =>
    expect(v - xs[i]).toBeGreaterThanOrEqual(
      Math.max(28, (labels[i].textContent ?? "").length * 6.6 + 4),
    ),
  );
  labels.forEach((el, i) =>
    expect(xs[i] + (el.textContent ?? "").length * 5.5).toBeLessThanOrEqual(PLOT.width - PLOT.r),
  );
  // On a 320 px phone the chart is drawn 288 wide, and its 12 px numerals keep the same distance, which leaves fewer of them.
  const r3 = render(
    <ArcChart
      analysis={bigA}
      structure={big}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
      width={288}
      height={198}
    />,
  );
  const narrow = Array.from(r3.container.querySelectorAll("[data-chapter-label]")),
    nx = narrow.map((el) => Number(el.getAttribute("x")));
  expect(narrow.length).toBeGreaterThan(3);
  expect(narrow.length).toBeLessThan(labels.length);
  nx.slice(1).forEach((v, i) =>
    expect(v - nx[i]).toBeGreaterThanOrEqual(
      Math.max(32, (narrow[i].textContent ?? "").length * 7.5 + 4),
    ),
  );
  narrow.forEach((el, i) => {
    expect(el.getAttribute("font-size")).toBe("12");
    expect(nx[i] + (el.textContent ?? "").length * 7.5).toBeLessThanOrEqual(288 - PLOT.r);
  });
});

test("the middle caption shortens, then goes, where it would run into the worded ends", () => {
  const at = (width: number) => {
    const { container, unmount } = render(
      <ArcChart
        analysis={fakeAnalysis()}
        structure={fakeStructure()}
        axes={["fortune"]}
        smoothing={1}
        showBand={false}
        showRaw={false}
        shown={null}
        pinned={null}
        onHover={() => {}}
        onPin={() => {}}
        width={width}
        height={200}
      />,
    );
    const t = container.textContent ?? "";
    unmount();
    return t;
  };
  expect(at(900)).toMatch(/percent of the book · chapter starts marked/);
  expect(at(358)).toMatch(/percent of the book/);
  expect(at(358)).not.toMatch(/chapter starts marked/);
  expect(at(280)).toMatch(/beginning/);
  expect(at(280)).toMatch(/end/);
});

test("tick labels carry the chapter's numeral, a decile's end, a one-word title, or else the chapter's place", () => {
  expect(chapterNumeral("CHAPTER XIX.", 18)).toBe("XIX");
  expect(chapterNumeral("Stave I: Marley's Ghost", 0)).toBe("I");
  expect(chapterNumeral("Chapter 1. Loomings.", 0)).toBe("1");
  expect(chapterNumeral("10–20%", 1)).toBe("20%");
  expect(chapterNumeral("Epilogue", 9)).toBe("Epilogue");
  expect(["PART ONE--The Old Buccaneer", "PART TWO--The Sea-cook"].map(chapterNumeral)).toEqual([
    "1",
    "2",
  ]);
  expect(chapterNumeral("INCIDENT OF THE LETTER", 2)).toBe("3");
});

test("an ordinary word spelt only with numeral letters is not taken for a numeral", () => {
  expect(chapterNumeral("A Mild Day", 3)).toBe("4");
  expect(chapterNumeral("The Civil War", 0)).toBe("1");
  expect(chapterNumeral("Did He?", 6)).toBe("7");
});

test("the fortune line is drawn in the theme's accent", () => {
  const { container } = render(
    <ArcChart
      analysis={fakeAnalysis()}
      structure={fakeStructure()}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
    />,
  );
  expect(container.querySelector("path[data-layer=fortune]")).toHaveAttribute(
    "stroke",
    "var(--accent)",
  );
});

test("a narrower width keeps the plot, the overlay and every label inside it", () => {
  const a = fakeAnalysis();
  const chapters = [0, 45, 90, 99].map((bin, i) => ({
    ...a.chapters[0],
    idx: i,
    title: `CHAPTER ${["I", "II", "III", "IV"][i]}.`,
    start_bin: bin,
  }));
  const { container } = render(
    <ArcChart
      analysis={{ ...a, chapters }}
      structure={fakeStructure()}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
      width={450}
      height={300}
    />,
  );
  expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 450 300");
  expect(Number(container.querySelector("rect[data-overlay]")!.getAttribute("width"))).toBe(
    450 - PLOT.l - PLOT.r,
  );
  const labels = Array.from(container.querySelectorAll("[data-chapter-label]"));
  expect(labels.length).toBeGreaterThan(1);
  labels.forEach((el) =>
    expect(Number(el.getAttribute("x")) + (el.textContent ?? "").length * 5.5).toBeLessThanOrEqual(
      450 - PLOT.r,
    ),
  );
});

test("with empty bins at both ends the fortune line starts at the first bin with data", () => {
  const { container } = render(<ArcChart {...openingProps()} />);
  const d = container.querySelector("path[data-layer=fortune]")!.getAttribute("d")!;
  expect(parseFloat(d.slice(1))).toBeCloseTo(xOf(2), 2);
});

test("the band takes the first drawn layer's color, and fortune's band stays the soft accent", () => {
  const band = (axes: Axis[]) => {
    const { container, unmount } = render(
      <ArcChart
        analysis={fakeAnalysis()}
        structure={structure}
        axes={axes}
        smoothing={1}
        showBand
        showRaw={false}
        shown={null}
        pinned={null}
        onHover={() => {}}
        onPin={() => {}}
      />,
    );
    const fill = container.querySelector("path[data-band]")!.getAttribute("fill");
    unmount();
    return fill;
  };
  expect(band(["warmth", "tension"])).toBe(
    "color-mix(in srgb, var(--ax-warmth) var(--band-mix), transparent)",
  );
  expect(band(["fortune", "warmth"])).toBe("var(--accent-soft)");
});

test("draws one path per active layer, band, empty bins, chapter ticks", () => {
  const { container } = render(
    <ArcChart
      analysis={{ ...fakeAnalysis(), empty_bins: [50] }}
      structure={structure}
      axes={["fortune", "tension"]}
      smoothing={1}
      showBand
      showRaw
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
    />,
  );
  expect(container.querySelectorAll("path[data-layer]").length).toBe(2);
  expect(container.querySelector("path[data-band]")).not.toBeNull();
  expect(container.querySelectorAll("g[clip-path] rect[data-empty]").length).toBe(1);
  expect(
    Array.from(container.querySelectorAll("[data-chapter-label]")).map((t) => t.textContent),
  ).toEqual(["One", "Two"]);
  expect(container.querySelectorAll("[data-chapter-tick]")).toHaveLength(2);
});

test("hover maps x to beat", () => {
  const seen: (number | null)[] = [];
  const { container } = render(
    <ArcChart
      analysis={fakeAnalysis()}
      structure={structure}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={(i) => seen.push(i)}
      onPin={() => {}}
    />,
  );
  const overlay = container.querySelector("rect[data-overlay]")!;
  overlay.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.mouseMove(overlay, { clientX: 790, clientY: 10 });
  expect(seen.at(-1)).toBe(3);
});

test("skips the tick for a chapter with null start_bin instead of crashing", () => {
  const analysis = fakeAnalysis();
  const chapters: Analysis["chapters"] = [
    ...analysis.chapters,
    {
      idx: 2,
      title: "Three",
      word_count: 1,
      beats: 0,
      means: {} as never,
      mode_share: {},
      event_count: 0,
      start_bin: null,
    },
  ];
  const { container } = render(
    <ArcChart
      analysis={{ ...analysis, chapters }}
      structure={structure}
      axes={["fortune"]}
      smoothing={1}
      showBand={false}
      showRaw={false}
      shown={null}
      pinned={null}
      onHover={() => {}}
      onPin={() => {}}
    />,
  );
  expect(container.querySelectorAll("[data-chapter-tick]").length).toBe(chapters.length - 1);
});
