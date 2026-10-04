import { AXES, type Analysis, type Axis } from "../types";

export function zscore(xs: number[]): number[] {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  return sd === 0 ? xs.map(() => 0) : xs.map((x) => (x - m) / sd);
}
export function pearson(a: number[], b: number[]): number {
  const za = zscore(a),
    zb = zscore(b);
  return za.reduce((s, x, i) => s + x * zb[i], 0) / a.length;
}
// A work's mean score on each layer, its chapters weighted by their words; a layer no chapter scored has none.
export function meanScores(analysis: Analysis): Record<Axis, number | null> {
  return Object.fromEntries(
    AXES.map((ax) => {
      let sum = 0;
      let words = 0;
      for (const c of analysis.chapters) {
        const m = c.means[ax];
        if (m === null) continue;
        sum += m * c.word_count;
        words += c.word_count;
      }
      return [ax, words ? sum / words : null];
    }),
  ) as Record<Axis, number | null>;
}
