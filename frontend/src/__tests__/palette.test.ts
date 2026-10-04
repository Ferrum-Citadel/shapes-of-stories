import { contrast, deltaE76, parseColor, simulateCvd } from "./color";
import { AXES } from "../types";
import { cssTokens, indexCss } from "./fixtures";

test("contrast runs from 1 to 21 and composites a translucent color over the background", () => {
  expect(contrast("#000", "#fff")).toBeCloseTo(21, 5);
  expect(contrast("#fff", "#fff")).toBe(1);
  expect(contrast("rgba(0, 0, 0, 0)", "#fff")).toBe(1);
  expect(parseColor("rgba(29,27,23,.15)")).toEqual([29, 27, 23, 0.15]);
  expect(parseColor("#2c5a3c")).toEqual([44, 90, 60, 1]);
  expect(() => parseColor("var(--ink)")).toThrow();
});

test("simulated red blindness takes most of the red out of pure red, and equal colors are 0 apart", () => {
  const [r, g] = simulateCvd([255, 0, 0], "protanopia");
  expect(r).toBeLessThan(128);
  expect(Math.abs(r - g)).toBeLessThan(64);
  expect(simulateCvd([255, 255, 255], "deuteranopia").map(Math.round)).toEqual([255, 255, 255]);
  expect(deltaE76([12, 34, 56], [12, 34, 56])).toBe(0);
  expect(deltaE76([0, 0, 0], [255, 255, 255])).toBeCloseTo(100, 0);
});

test("the mark is the ink in both themes, since the light theme's declaration resolves against either ink", () => {
  expect(cssTokens(":root")["--mark"]).toBe("var(--ink)");
  expect(cssTokens(':root[data-theme="dark"]')["--mark"]).toBeUndefined();
});

const LAYER_TOKENS = [
  ...AXES.filter((ax) => ax !== "fortune").map((ax) => `--ax-${ax}`),
  "--accent",
];

// The grain tile's opacity in each theme, as the html rules draw it.
const alpha = (rule: RegExp) => Number(indexCss.match(rule)![1]);
const GRAIN = {
  light: alpha(/\nhtml \{[^}]*?opacity='([\d.]+)'/),
  dark: alpha(/ :root\[data-theme="dark"\] \{\s*background-image[^}]*?opacity='([\d.]+)'/),
};
const softLightUp = (c: number) => (c <= 0.25 ? ((16 * c - 12) * c + 4) * c : Math.sqrt(c));

// The page colors the grain can reach at its extremes: multiply at grain 0 in light, soft-light at grain 0 and 1 in dark.
function grainExtremes(bg: string, theme: "light" | "dark"): string[] {
  const c = parseColor(bg)
    .slice(0, 3)
    .map((v) => v / 255);
  const over = (blend: (x: number) => number) =>
    `rgb(${c.map((x) => 255 * ((1 - GRAIN[theme]) * x + GRAIN[theme] * blend(x))).join(", ")})`;
  return theme === "light" ? [over(() => 0)] : [over((x) => x * x), over(softLightUp)];
}

test("the grain darkens the light page, and moves the dark page both ways", () => {
  expect(GRAIN).toEqual({ light: 0.06, dark: 0.07 });
  const [light] = grainExtremes("#f3efe5", "light").map(parseColor);
  expect(light[0]).toBeCloseTo(243 * 0.94, 5);
  const [down, up] = grainExtremes("#131211", "dark").map(parseColor);
  expect(down[0]).toBeLessThan(19);
  expect(up[0]).toBeGreaterThan(19);
});

describe.each([
  ["light", ":root"],
  ["dark", ':root[data-theme="dark"]'],
] as const)("the %s theme", (theme, selector) => {
  const t = cssTokens(selector);
  // Contrast on the page is taken at the grain pixel that costs the most.
  const onPage = (fg: string) =>
    Math.min(...grainExtremes(t["--bg"], theme).map((g) => contrast(fg, g)));

  test("fortune is drawn in the bronze with a band of the same color, and no line takes the wax", () => {
    expect(t["--accent"]).not.toBe(t["--ink"]);
    expect(parseColor(t["--accent-soft"])).toEqual([
      ...parseColor(t["--accent"]).slice(0, 3),
      theme === "light" ? 0.12 : 0.14,
    ]);
    expect(LAYER_TOKENS.map((ax) => t[ax])).not.toContain(t["--action"]);
  });

  test("the action's wax reads at 4.5:1 as text on its tint, resting and hovered, on the grained page", () => {
    const share = (token: string) =>
      Number(t[token].match(/^color-mix\(in srgb, var\(--action\) (\d+)%, transparent\)$/)![1]);
    expect([share("--action-tint"), share("--action-tint-hover")]).toEqual(
      theme === "light" ? [14, 22] : [22, 30],
    );
    const [r, g, b] = parseColor(t["--action"]);
    // The tint is the wax laid over the page at its share, as color-mix with transparent draws it.
    for (const token of ["--action-tint", "--action-tint-hover"])
      for (const page of grainExtremes(t["--bg"], theme)) {
        const a = share(token) / 100,
          under = parseColor(page)
            .slice(0, 3)
            .map((v, i) => [r, g, b][i] * a + v * (1 - a));
        expect(
          contrast(t["--action"], `rgb(${under.join(", ")})`),
          `${token} on ${page}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
  });

  test("text colors read at 4.5:1 on the grained page, and ink and muted on a flat card too", () => {
    for (const fg of ["--ink", "--muted", "--accent", "--bad"])
      expect(onPage(t[fg]), fg).toBeGreaterThanOrEqual(4.5);
    for (const fg of ["--ink", "--muted"])
      expect(contrast(t[fg], t["--paper"]), `${fg} on --paper`).toBeGreaterThanOrEqual(4.5);
  });

  test("every layer color reads as text at 4.5:1 on the grained page", () => {
    for (const ax of LAYER_TOKENS) expect(onPage(t[ax]), ax).toBeGreaterThanOrEqual(4.5);
  });

  test("every two layers stay 10 apart to a reader without red or green cones", () => {
    for (const kind of ["deuteranopia", "protanopia"] as const) {
      const seen = LAYER_TOKENS.map((ax) => simulateCvd(parseColor(t[ax]), kind));
      for (let i = 0; i < seen.length; i++)
        for (let j = i + 1; j < seen.length; j++)
          expect(
            deltaE76(seen[i], seen[j]),
            `${LAYER_TOKENS[i]} and ${LAYER_TOKENS[j]} under ${kind}`,
          ).toBeGreaterThanOrEqual(10);
    }
  });
});
