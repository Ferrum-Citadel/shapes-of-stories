// d3's linear scale works from the lower end of the input, so this does too and a drawing comes out the same to the last digit.
const map = (d0: number, d1: number, r0: number, r1: number): ((v: number) => number) =>
  d1 < d0
    ? map(d1, d0, r1, r0)
    : (v: number) => {
        const t = (v - d0) / (d1 - d0);
        return r0 * (1 - t) + r1 * t;
      };

// A straight map from one interval onto another, with its inverse; a clamped map keeps to its ends.
interface Linear {
  (v: number): number;
  invert(p: number): number;
}
export function linear(
  [d0, d1]: [number, number],
  [r0, r1]: [number, number],
  clamp = false,
): Linear {
  const keep = (v: number) =>
    clamp ? Math.max(Math.min(d0, d1), Math.min(Math.max(d0, d1), v)) : v;
  const to = map(d0, d1, r0, r1),
    from = map(r0, r1, d0, d1);
  return Object.assign((v: number) => to(keep(v)), { invert: (p: number) => keep(from(p)) });
}
