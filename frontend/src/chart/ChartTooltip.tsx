import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Analysis, Axis, Structure } from "../types";
import { AXIS_INFO } from "../lib/definitions";
import { binsOfBeat, chapterAtBeat, chapterNumeral, passageMean } from "../lib/bins";
import { Swatch } from "../components/LayerChips";
import ScoreBar from "../components/ScoreBar";
import { LAYERS } from "../lib/layers";
import { PLOT, wordsW, xOf } from "./ChartFrame";
import { coarse } from "../lib/ui";

// The widest corner words of the drawn layers: a layer's name in the label style (about 9 px a letter) over its high word.
const cornerW = (axes: Axis[]) =>
  Math.max(...axes.map((a) => Math.max(wordsW(AXIS_INFO[a].high), AXIS_INFO[a].name.length * 9)));

// The hovered passage's numbers over the chart; it sits beside the svg, so it adds no redraw of the svg.
export default function ChartTooltip({
  shown,
  pinned,
  analysis,
  structure,
  axes,
  chartRef,
  drawnWidth,
}: {
  shown: number | null;
  pinned: number | null;
  analysis: Analysis;
  structure: Structure;
  axes: Axis[];
  chartRef: RefObject<HTMLElement | null>;
  drawnWidth: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  // The pinned passage's numbers are in the drawer already.
  const open = shown !== null && shown !== pinned && !coarse();
  // Inside the plot's top, beside the passage's column (right, else left), clear of the corner words; the drawing's units scale to the box it is shown in.
  useLayoutEffect(() => {
    const el = box.current,
      chart = chartRef.current;
    if (!el || !chart || shown === null) return;
    const W = drawnWidth,
      k = chart.getBoundingClientRect().width / W,
      [lo, hi] = binsOfBeat(structure, shown),
      half = (xOf(1, W) - xOf(0, W)) / 2,
      w = el.offsetWidth,
      words = cornerW(axes) + 4 + 16;
    const min = (PLOT.l + words) * k,
      max = (W - PLOT.r - (axes.length === 2 ? words : 0)) * k;
    const right = (xOf(hi, W) + half + 8) * k;
    const left = right + w <= max ? right : (xOf(lo, W) - half - 8) * k - w;
    el.style.left = `${Math.max(min, Math.min(left, max - w))}px`;
    el.style.top = `${PLOT.t * k + 6}px`;
  }, [open, shown, structure, axes, chartRef, drawnWidth]);
  if (!open) return null;
  const c = chapterAtBeat(structure, shown);
  return (
    <div
      ref={box}
      role="tooltip"
      className="panel low pointer-events-none absolute z-10 whitespace-nowrap rounded px-2.5 py-1.5 text-[13px]"
    >
      <div>{`Passage ${shown + 1}${c ? ` · ${chapterNumeral(c.title, c.idx)}` : ""}`}</div>
      {axes.map((ax) => {
        const m = passageMean(analysis.bins[ax].raw, shown, structure);
        return (
          <div key={ax} data-row className="flex items-center gap-1.5">
            <Swatch axis={ax} />
            {AXIS_INFO[ax].name}
            <span className="ml-auto pl-3">
              <ScoreBar score={m} color={LAYERS[ax].color} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
