import { useRef } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import type { Axis } from "../types";
import { SCORE_MAX } from "../lib/layers";
import { AXIS_INFO } from "../lib/definitions";
import { linear } from "../lib/scale";
import { Swatch } from "../components/LayerChips";
import { AxisWords, Grid, PLOT, word, xOf } from "./ChartFrame";
import { useChartSize } from "./useChartSize";

// No chapter numerals sit under this plot, so "beginning" and "end" come up close under the baseline.
const HEIGHT = 260,
  BOTTOM = 24;
export const SIDES = [
  { color: "var(--accent)", width: 2.2 },
  { color: "var(--ink)", width: 2, dash: "6 3" },
] as const;

// Both works on the work page's own 0 to 4 scale, so a reader compares scores, not each book against itself.
export default function CompareChart({
  a,
  b,
  axis,
  names,
}: {
  a: number[];
  b: number[];
  axis: Axis;
  names: [string, string];
}) {
  const box = useRef<HTMLDivElement>(null);
  const { width } = useChartSize(box);
  const { l, r, t } = PLOT;
  const x = (i: number) => xOf(i, width),
    y = linear([0, SCORE_MAX], [HEIGHT - BOTTOM, t]);
  const ln = line<number>()
    .x((_, i) => x(i))
    .y(y)
    .curve(curveMonotoneX);
  const ribbon = area<number>()
    .x((_, i) => x(i))
    .y0(y)
    .y1((_, i) => y(b[i]))
    .curve(curveMonotoneX);
  return (
    <div ref={box}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        className="block"
        role="img"
        aria-label={`${AXIS_INFO[axis].name}: ${names[0]} versus ${names[1]}`}
      >
        <Grid width={width} y={y} />
        <path data-ribbon d={ribbon(a) ?? ""} fill="var(--select)" />
        {[a, b].map((s, i) => (
          <path
            key={i}
            data-curve={"ab"[i]}
            d={ln(s) ?? ""}
            fill="none"
            strokeLinecap="round"
            stroke={SIDES[i].color}
            strokeWidth={SIDES[i].width}
            strokeDasharray={i ? SIDES[1].dash : undefined}
          />
        ))}
        {/* Both works share the layer, so its words are set in ink rather than in one layer's color. */}
        <AxisWords axis={axis} x={l + 4} end={false} low={y(0) - 6} fill="var(--ink)" />
        <text x={l} y={HEIGHT - 4} {...word}>
          beginning
        </text>
        <text x={width - r} y={HEIGHT - 4} textAnchor="end" {...word}>
          end
        </text>
      </svg>
    </div>
  );
}

// Each work's swatch and full title; the tables below repeat the swatch over a shortened title.
export function CompareLegend({ names }: { names: [string, string] }) {
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
      {SIDES.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <Swatch {...s} />
          <span className="serif opsz-14 font-medium">{names[i]}</span>
        </span>
      ))}
    </p>
  );
}
