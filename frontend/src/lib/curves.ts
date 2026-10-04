import type { AxisBins } from "../types";

// Both stored curves smooth the same readings linearly, so a weighted mean of them is a smoothing too.
export function blend(detail: number[], shape: number[], t: number): number[] {
  return shape.map((v, i) => detail[i] + (v - detail[i]) * t);
}

// The ends hand back the stored arrays themselves, so a chart at either end draws exactly what was stored.
export function curveAt(bins: AxisBins, t: number): number[] {
  return t >= 1 ? bins.shape : t <= 0 ? bins.detail : blend(bins.detail, bins.shape, t);
}

export function bandAt(bins: AxisBins, t: number): [number[], number[]] {
  const { shape, detail } = bins.band;
  return t >= 1
    ? shape
    : t <= 0
      ? detail
      : [blend(detail[0], shape[0], t), blend(detail[1], shape[1], t)];
}
