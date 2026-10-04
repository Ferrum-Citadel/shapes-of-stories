import { compact } from "../lib/ui";
import { EASE, MOTION, settle } from "../lib/motion";
import { LAYERS } from "../lib/layers";
import { cssTokens, indexCss as css } from "./fixtures";

const light = cssTokens(":root"),
  dark = cssTokens(':root[data-theme="dark"]');

test("every layer reads a token both themes define", () => {
  for (const { color } of Object.values(LAYERS)) {
    const token = color.match(/^var\((--[\w-]+)\)$/)![1];
    expect(light[token], token).toBeDefined();
    expect(dark[token], token).toBeDefined();
  }
});

test("the script's small-screen query is the compact variant's, word for word", () => {
  const variant = css.match(/@custom-variant compact \{([^]*?)\n\}/)![1];
  const queries = [...variant.matchAll(/@media ([^{]+?) \{/g)].map((m) => m[1]);
  expect(queries.join(", ")).toBe(compact);
});

test("the durations and easings in index.css and the ones script animates with are the same", () => {
  const ms = (name: string) => Number(css.match(new RegExp(`--motion-${name}:\\s*(\\d+)ms`))![1]);
  expect([ms("respond"), ms("reveal"), ms("draw"), ms("stroke")]).toEqual([
    MOTION.respond,
    MOTION.reveal,
    MOTION.draw,
    MOTION.stroke,
  ]);
  expect([MOTION.respond, MOTION.reveal, MOTION.draw, MOTION.stroke, MOTION.settle]).toEqual([
    150, 220, 400, 600, 700,
  ]);
  // A formatter writes .2 as 0.2, so the numbers are compared rather than the text.
  const numbers = (s: string) => s.replace(/[\d.]+/g, (n) => String(Number(n)));
  for (const k of ["settle", "draw"] as const)
    expect(numbers(css.match(new RegExp(`--ease-${k}:\\s*([^;]+);`))![1])).toBe(numbers(EASE[k]));
});

test("script's settle easing follows the same curve as CSS's, quick to start and resting at the end", () => {
  expect(settle(0)).toBeCloseTo(0, 5);
  expect(settle(1)).toBeCloseTo(1, 5);
  // The curve's point at t = 0.3: x = 0.153, y = 0.5688.
  expect(settle(0.153)).toBeCloseTo(0.5688, 3);
  const steps = Array.from({ length: 11 }, (_, i) => settle(i / 10));
  expect(steps).toEqual([...steps].sort((a, b) => a - b));
});
