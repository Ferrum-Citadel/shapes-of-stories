export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

export function parseColor(s: string): Rgba {
  const hex = s.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const fn = s.trim().match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const [r, g, b, a = 1] = fn[1].split(",").map(Number);
    if ([r, g, b, a].every(Number.isFinite)) return [r, g, b, a];
  }
  throw new Error(`not a color: ${s}`);
}

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const gamma = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const luminance = (c: readonly number[]) =>
  0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);

// WCAG 2 contrast ratio, with a translucent foreground laid over the background first.
export function contrast(fg: string, bg: string): number {
  const [r, g, b, a] = parseColor(fg),
    back = parseColor(bg);
  const over = [r, g, b].map((c, i) => c * a + back[i] * (1 - a));
  const [hi, lo] = [luminance(over), luminance(back)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Machado, Oliveira and Fernandes 2009, severity 1, applied in linear RGB.
const CVD = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

export function simulateCvd(rgb: readonly number[], kind: keyof typeof CVD): Rgb {
  const lin = [0, 1, 2].map((i) => linear(rgb[i]));
  return CVD[kind].map((row) =>
    gamma(Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]))),
  ) as Rgb;
}

// CIELAB under D65, the space CIE76 measures distance in.
function lab(rgb: readonly number[]): Rgb {
  const [r, g, b] = [0, 1, 2].map((i) => linear(rgb[i]));
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((v) => (v > 216 / 24389 ? Math.cbrt(v) : (841 / 108) * v + 4 / 29));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

export function deltaE76(a: readonly number[], b: readonly number[]): number {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
