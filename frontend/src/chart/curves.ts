import { area, curveMonotoneX, line } from "d3-shape";
import type { Analysis, Axis } from "../types";
import { templateOf } from "../lib/definitions";
import { curveAt } from "../lib/curves";
import { BINS } from "../lib/bins";

// Do not draw across a run of empty bins at either end: the smoother has no data there.
export function drawnRange(emptyBins: number[]) {
  const empty = new Set(emptyBins);
  let a = 0,
    z = BINS - 1;
  while (a < BINS - 1 && empty.has(a)) a++;
  while (z > a && empty.has(z)) z--;
  return [a, z] as const;
}

// The drawn layer whose line, at this smoothing and at a fractional bin between two drawn points, is nearest the pointer's height, if within 10 units.
export function lineNear(
  values: Record<Axis, number[]>,
  axes: Axis[],
  at: number,
  py: number,
  y: (v: number) => number,
) {
  const lo = Math.max(0, Math.min(BINS - 1, Math.floor(at))),
    hi = Math.min(BINS - 1, lo + 1),
    k = at - lo;
  let near: Axis | null = null,
    gap = 10;
  for (const ax of axes) {
    const c = values[ax];
    const d = Math.abs(y(c[lo] + (c[hi] - c[lo]) * k) - py);
    if (d <= gap) [near, gap] = [ax, d];
  }
  return near;
}

// The drawn paths of the fortune line, the shape's sketch the opening starts from, and every layer's curve (with the band's, when shown), and the smoothed values of fortune and each drawn layer.
export function curvePaths({
  analysis,
  axes,
  smoothing,
  band,
  x,
  y,
  range,
}: {
  analysis: Analysis;
  axes: Axis[];
  smoothing: number;
  band: [number[], number[]] | null;
  x: (bin: number) => number;
  y: (v: number) => number;
  range: readonly [number, number];
}) {
  const ln = line<number>()
    .x((_, i) => x(i))
    .y(y)
    .curve(curveMonotoneX);
  const straight = line<number>()
    .x((_, i) => x(i))
    .y(y);
  const ar = area<[number, number]>()
    .x((_, i) => x(i))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(curveMonotoneX);
  const slice = (vals: number[]) => vals.map((v, i) => (i < range[0] || i > range[1] ? NaN : v));
  const defined = (v: number) => !Number.isNaN(v);
  ln.defined(defined);
  straight.defined(defined);
  const values = {} as Record<Axis, number[]>;
  for (const ax of new Set<Axis>(["fortune", ...axes]))
    values[ax] = curveAt(analysis.bins[ax], smoothing);
  const fortuneD = straight(slice(values.fortune)) ?? "";
  const fs = analysis.bins.fortune.shape;
  const mean = fs.reduce((p, v) => p + v, 0) / BINS;
  const sd = Math.sqrt(fs.reduce((p, v) => p + (v - mean) ** 2, 0) / BINS) || 1;
  const tpl = templateOf(analysis.archetype);
  // The sketch keeps about a tenth of the plot's height either way, so a nearly flat book's shape is still legible before it settles into the line.
  const sketch = tpl
    ? (straight(
        slice(
          Array.from(
            { length: BINS },
            (_, i) => mean + Math.max(sd * 1.2, 0.35) * tpl((i + 0.5) / BINS),
          ),
        ),
      ) ?? null)
    : null;
  // Every smoothing is the same line smoothed more or less, so moving between them morphs every curve rather than swapping it.
  const curves: Record<string, string> = Object.fromEntries(
    axes.map((ax) => [ax, ax === "fortune" ? fortuneD : (ln(slice(values[ax])) ?? "")]),
  );
  if (band) curves.band = ar(band[0].map((lo, i) => [lo, band[1][i]] as [number, number])) ?? "";
  return { fortuneD, sketch, curves, values };
}
