import { useRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import ChartTooltip from "../chart/ChartTooltip";
import { PLOT, wordsW, xOf } from "../chart/ChartFrame";
import { AXIS_INFO } from "../lib/definitions";
import type { Axis } from "../types";
import { ROMAN, fakeAnalysis, fakeStructure, stubMedia } from "./fixtures";

const structure = fakeStructure(30, 5);
structure.chapters = structure.chapters.map((c) => ({ ...c, title: `Chapter ${ROMAN[c.idx]}` }));

// Passage 26 of 30 covers bins 83 to 86.
const analysis = fakeAnalysis();
analysis.bins.fortune.raw.splice(83, 4, 1, 2, null, 4);
analysis.bins.tension.raw.splice(83, 4, null, null, null, null);

function Tooltip(p: {
  shown: number | null;
  pinned: number | null;
  axes?: Axis[];
  drawnWidth?: number;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={chartRef}>
      <ChartTooltip
        analysis={analysis}
        structure={structure}
        axes={p.axes ?? ["fortune", "tension"]}
        shown={p.shown}
        pinned={p.pinned}
        chartRef={chartRef}
        drawnWidth={p.drawnWidth ?? 900}
      />
    </div>
  );
}

test("names the hovered passage and its chapter, with a row per drawn layer", () => {
  render(<Tooltip shown={25} pinned={null} />);
  const tip = screen.getByRole("tooltip");
  expect(tip).toHaveTextContent("Passage 26 · V");
  const rows = Array.from(tip.querySelectorAll("[data-row]")).map((r) => r.textContent);
  expect(rows).toEqual(["Fortune2.3", "Tension–"]);
  // Each number stands beside its bar out of 4; a layer with no reading keeps an empty track.
  const [fortune, tension] = Array.from(tip.querySelectorAll("[data-row]"));
  // The mean of 1, 2 and 4 is 7/3, which fills 28 of the 48 px.
  expect(fortune.querySelector<HTMLElement>("[data-fill]")!.style.width).toBe("28px");
  expect(fortune.querySelector<HTMLElement>("[data-fill]")!.style.background).toBe("var(--accent)");
  expect(tension.querySelector("[data-bar]")).toBeInTheDocument();
  expect(tension.querySelector("[data-fill]")).toBeNull();
});

test("is absent with nothing hovered, over the pinned passage, and on a touch screen", () => {
  const { rerender } = render(<Tooltip shown={null} pinned={null} />);
  expect(screen.queryByRole("tooltip")).toBeNull();
  rerender(<Tooltip shown={25} pinned={25} />);
  expect(screen.queryByRole("tooltip")).toBeNull();
  rerender(<Tooltip shown={25} pinned={3} />);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Passage 26 · V");
  stubMedia("(pointer: coarse)");
  rerender(<Tooltip shown={25} pinned={null} />);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

// The chart is on the page before anything is hovered, as it is in the viewer; the tooltip is 120 px wide.
function placed(shown: number, axes: Axis[], drawnWidth = 900) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 900,
  } as DOMRect);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(120);
  const { rerender } = render(<Tooltip shown={null} pinned={null} axes={axes} />);
  rerender(<Tooltip shown={shown} pinned={null} axes={axes} drawnWidth={drawnWidth} />);
  const { left, top } = screen.getByRole("tooltip").style;
  return { left: parseFloat(left), top: parseFloat(top) };
}

test("sits inside the plot's top, to the right of the passage's column", () => {
  // Passage 16 covers bins 50 to 53; its column ends half a bin past the last.
  const { left, top } = placed(15, ["fortune"]);
  expect(top).toBe(PLOT.t + 6);
  expect(left).toBeCloseTo(xOf(53.5) + 8, 3);
});

test("goes left of the column where the right has no room beside the second layer's words", () => {
  // Bins 83 to 86: the right side would run into the right-hand words, so it ends 8 short of bin 82.5.
  expect(placed(25, ["fortune", "tension"]).left).toBeCloseTo(xOf(82.5) - 8 - 120, 3);
});

test("never covers the top-left words, and follows a change of the drawn width", () => {
  const words = PLOT.l + 4 + Math.max(wordsW(AXIS_INFO.fortune.high), "Fortune".length * 9);
  expect(placed(0, ["fortune"]).left).toBeGreaterThanOrEqual(words + 16);
  cleanup();
  // A drawing half as wide is shown at twice its scale.
  expect(placed(15, ["fortune"], 450).left).toBeCloseTo((xOf(53.5, 450) + 8) * 2, 3);
});
