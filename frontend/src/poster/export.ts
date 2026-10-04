import { linear } from "../lib/scale";
import type { Analysis, Archetype, Axis, EventMarker, EventType } from "../types";
import { AXES } from "../types";
import { LAYERS, SCORE_MAX } from "../lib/layers";
import { EVENT_PATHS } from "../components/icons";
import { AXIS_INFO, COLOPHON, EVENT_NAMES, SHAPE_INFO, shapeInfo } from "../lib/definitions";
import { readingSentence } from "../lib/reading";
import { bandAt } from "../lib/curves";
import { curvePaths, drawnRange } from "../chart/curves";
import { meanScores } from "../lib/stats";
import { esc, label, lines, text, wrap } from "./svg";

export const SIZES = {
  portrait: [1080, 1350],
  landscape: [1600, 900],
  square: [1080, 1080],
} as const;
export type Size = keyof typeof SIZES;
// A standalone file cannot read the page's CSS variables, so each palette carries the theme's hex values.
const PALETTES = {
  paper: {
    bg: "#f3efe5",
    paper: "#faf7f0",
    ink: "#1b1917",
    muted: "#5a5650",
    accent: "#815e1e",
    warmth: "#822d01",
    humor: "#636833",
    romance: "#983861",
    wonder: "#35609f",
    dread: "#503a80",
    sorrow: "#466780",
    tension: "#2b6a6b",
    mystery: "#603e1d",
    pace: "#6d6150",
  },
  ink: {
    bg: "#131211",
    paper: "#1a1917",
    ink: "#ece7dd",
    muted: "#a6a097",
    accent: "#d1b05a",
    warmth: "#d0874d",
    humor: "#cabd47",
    romance: "#c57ba6",
    wonder: "#93b1e0",
    dread: "#9f8bd3",
    sorrow: "#97bad4",
    tension: "#7fc2c0",
    mystery: "#ca996a",
    pace: "#9d9a96",
  },
};
export type Palette = keyof typeof PALETTES;
export type Fonts = { title: string; text: string; italic: string };

// The inline preview passes no files and so embeds no faces (its <style> would be page-global); the downloads pass them.
const fontFace = (uri: string, weight: string, style = "normal") =>
  uri
    ? `@font-face{font-family:"Fraunces";font-weight:${weight};font-style:${style};src:url(${uri}) format("woff2");}`
    : "";
// Fraunces sets about this many ems per character, upright, bold and italic, so lines are broken without measuring.
const EM = { regular: 0.5, bold: 0.53, italic: 0.46 };

function shapeTitle(a: Archetype): string {
  const info = shapeInfo(a);
  return info ? `${a.state === "leans" ? "Leans toward " : ""}${info.name}` : SHAPE_INFO.none.name;
}
// Dashes scale with the poster's thicker strokes.
const dash = (ax: Axis, k = 2) =>
  LAYERS[ax].dash
    ? `stroke-dasharray="${LAYERS[ax].dash
        .split(" ")
        .map((n) => +n * k)
        .join(" ")}"`
    : "";

// The likeliest strong events, at most eight, each a bead's width clear of the others.
function mainEvents(events: EventMarker[], x: (bin: number) => number, gap: number) {
  const kept: EventMarker[] = [];
  for (const e of events
    .filter((e) => e.strength === "strong")
    .sort((a, b) => b.probability - a.probability || a.bin - b.bin)) {
    if (kept.length === 8) break;
    if (kept.every((k) => Math.abs(x(k.bin) - x(e.bin)) >= gap)) kept.push(e);
  }
  return kept.sort((a, b) => a.bin - b.bin);
}

// The legend's type size, glyph size, gap between items and line spacing.
export const LEGEND = { size: 15, glyph: 18, gap: 26, lead: 24 };
// An item's width, its name at half an em a character, which overstates Fraunces italic.
export const legendWidth = (name: string) => LEGEND.glyph + 7 + name.length * LEGEND.size * 0.5;

// A bead's radius and its glyph's drawn size, the site's 22-unit bead and 16-unit glyph scaled up together.
const R = 26;
const GLYPH = 28;
const GLYPH_STROKE = 1.75;

// Each size's margin, type sizes, row height, whether the shape and scores stand beside the chart, and how far the plot's top drops.
const LAYOUT = {
  portrait: { m: 88, title: 66, sentenceLines: 3, rowH: 21, beside: false, lift: 0 },
  square: { m: 80, title: 58, sentenceLines: 2, rowH: 17, beside: false, lift: 0 },
  landscape: { m: 80, title: 60, sentenceLines: 2, rowH: 20, beside: true, lift: 70 },
} as const;

export function posterSvg(o: {
  title: string;
  subtitle: string;
  analysis: Analysis;
  axes: Axis[];
  size: Size;
  palette: Palette;
  fonts: Fonts;
  date?: Date;
}): string {
  const [W, H] = SIZES[o.size];
  const L = LAYOUT[o.size];
  const p = PALETTES[o.palette];
  const a = o.analysis;
  const M = L.m;
  const inner = W - 2 * M;
  const colorOf = (ax: Axis) => (ax === "fortune" ? p.accent : p[ax]);
  const out: string[] = [];

  // The title, the author and the reading sentence, each set from the top down.
  let size = L.title;
  let title = wrap(o.title, inner, size, EM.bold, 9);
  while (title.length > 2 && size > 40) title = wrap(o.title, inner, (size -= 4), EM.bold, 9);
  title = wrap(o.title, inner, size, EM.bold, 2);
  let y = M + size * 0.8;
  out.push(lines(title, M, y, size, size * 1.04, p.ink, 'font-weight="600"'));
  y += (title.length - 1) * size * 1.04 + 46;
  if (o.subtitle) {
    out.push(text(M, y, 28, p.muted, esc(o.subtitle)));
    y += 52;
  } else y += 10;
  // Without the structure's chapters the sentence names them from the chapter stats.
  const sentence = readingSentence(a);
  const sl = wrap(sentence, inner, 25, EM.italic, L.sentenceLines);
  out.push(lines(sl, M, y, 25, 35, p.ink, 'font-style="italic" fill-opacity="0.86"'));
  const chartTop = y + (sl.length - 1) * 35 + 70;

  // The footer, then the scores and the shape above it, set from the bottom up.
  const footer = H - M - 24;
  const scoresH = 30 + 10 * L.rowH;
  const infoTop = L.beside ? chartTop - 22 : footer - 46 - scoresH;
  const baseline = L.beside ? footer - 172 : infoTop - 146;
  const chartR = L.beside ? M + inner * 0.64 : W - M;

  // The chart: the fortune band, the shape's ghost, every drawn layer, chapter ticks, then the beads under the baseline.
  const x = linear([0, 99], [M, chartR]);
  const plotTop = chartTop + L.lift;
  const yv = linear([0, SCORE_MAX], [baseline - 14, plotTop + 30]);
  const drawn: Axis[] = ["fortune", ...o.axes.filter((ax) => ax !== "fortune")];
  const c = curvePaths({
    analysis: a,
    axes: drawn,
    smoothing: 1,
    band: bandAt(a.bins.fortune, 1),
    x,
    y: yv,
    range: drawnRange(a.empty_bins),
  });
  out.push(
    `<line x1="${M}" x2="${chartR}" y1="${baseline}" y2="${baseline}" stroke="${p.ink}" stroke-opacity="0.22"/>`,
    text(M, plotTop + 12, 15, p.muted, `${AXIS_INFO.fortune.high} fortune`, 'font-style="italic"'),
    text(M, baseline - 22, 15, p.muted, `${AXIS_INFO.fortune.low}`, 'font-style="italic"'),
    `<path d="${c.curves.band}" fill="${p.accent}" fill-opacity="${o.palette === "paper" ? 0.13 : 0.16}"/>`,
  );
  for (const ch of a.chapters)
    if (ch.start_bin)
      out.push(
        `<line x1="${x(ch.start_bin)}" x2="${x(ch.start_bin)}" y1="${baseline}" y2="${baseline - 7}" stroke="${p.ink}" stroke-opacity="0.3"/>`,
      );
  if (c.sketch)
    out.push(
      `<path data-ghost="" d="${c.sketch}" fill="none" stroke="${p.ink}" stroke-opacity="0.32" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"/>`,
    );
  for (const ax of drawn.slice(1).reverse())
    out.push(
      `<path data-layer="${ax}" d="${c.curves[ax]}" fill="none" stroke="${colorOf(ax)}" stroke-width="2.6" stroke-linecap="round" ${dash(ax)}/>`,
    );
  out.push(
    `<path data-layer="fortune" d="${c.curves.fortune}" fill="none" stroke="${p.accent}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  // Each bead hangs from the line by a thread and carries its glyph alone; the legend names them.
  const beads = mainEvents(a.events, x, 2 * R + 14);
  const beadY = baseline + R + 18;
  const glyph = (type: EventType, gx: number, gy: number, size: number, extra = "") =>
    `<path ${extra}transform="translate(${gx},${gy}) scale(${size / 24})" d="${EVENT_PATHS[type]}" fill="none" stroke="${p.ink}" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const e of beads) {
    const bx = x(e.bin);
    const fy = yv(a.bins.fortune.shape[e.bin]);
    out.push(
      `<line x1="${bx}" x2="${bx}" y1="${fy + 8}" y2="${beadY - R - 4}" stroke="${p.ink}" stroke-opacity="0.3" stroke-width="1.5" stroke-dasharray="0.1 6" stroke-linecap="round"/>`,
      `<circle cx="${bx}" cy="${beadY}" r="${R}" fill="${p.paper}" stroke="${p.ink}" stroke-opacity="0.2" stroke-width="1.5"/>`,
      glyph(e.type, bx - GLYPH / 2, beadY - GLYPH / 2, GLYPH, 'data-bead="" '),
    );
  }
  // Each type drawn, once, in the order the book first meets it, set left to right at its own width and wrapping under the chart.
  let lx = M;
  let ly = beadY + R + 26;
  for (const type of new Set(beads.map((e) => e.type))) {
    const name = EVENT_NAMES[type];
    const w = legendWidth(name);
    if (lx > M && lx + w > chartR) [lx, ly] = [M, ly + LEGEND.lead];
    out.push(
      `<g data-legend-item="" transform="translate(${lx},${ly})">${glyph(type, 0, -LEGEND.glyph + 4, LEGEND.glyph)}${text(LEGEND.glyph + 7, 0, LEGEND.size, p.muted, name, 'font-style="italic"')}</g>`,
    );
    lx += w + LEGEND.gap;
  }

  // The shape and its one line, then the mean score of every layer as a bar.
  const shapeX = L.beside ? chartR + 64 : M;
  const shapeW = L.beside ? W - M - shapeX : inner * 0.46;
  const scoresX = L.beside ? shapeX : M + inner * 0.54;
  const scoresW = L.beside ? shapeW : W - M - scoresX;
  const info = shapeInfo(a.archetype) ?? SHAPE_INFO.none;
  const desc = wrap(info.description, shapeW, 20, EM.italic, 4);
  out.push(
    label(shapeX, infoTop + 13, p.muted, "THE SHAPE"),
    text(shapeX, infoTop + 56, 34, p.ink, esc(shapeTitle(a.archetype)), 'font-weight="600"'),
    lines(desc, shapeX, infoTop + 92, 20, 28, p.muted, 'font-style="italic"'),
  );
  const scoresTop = L.beside ? infoTop + 92 + desc.length * 28 + 36 : infoTop;
  out.push(label(scoresX, scoresTop + 13, p.muted, "MEAN SCORE, OUT OF 4"));
  const means = meanScores(a);
  const trackX = scoresX + 104;
  const trackW = scoresW - 104 - 44;
  AXES.forEach((ax, i) => {
    const ry = scoresTop + 30 + i * L.rowH + L.rowH / 2;
    const v = means[ax];
    out.push(
      text(scoresX, ry + 5, 15, p.ink, AXIS_INFO[ax].name),
      `<rect x="${trackX}" y="${ry - 3}" width="${trackW}" height="6" rx="3" fill="${p.ink}" fill-opacity="0.09"/>`,
      v === null
        ? ""
        : `<rect data-bar="${ax}" x="${trackX}" y="${ry - 3}" width="${((trackW * v) / SCORE_MAX).toFixed(1)}" height="6" rx="3" fill="${colorOf(ax)}"/>`,
      text(
        W - M,
        ry + 5,
        15,
        p.muted,
        v === null ? "–" : v.toFixed(1),
        'text-anchor="end" style="font-variant-numeric:tabular-nums"',
      ),
    );
  });

  // The footer: the mark and the facts on one line, the colophon under it.
  const words = a.chapters.reduce((s, ch) => s + ch.word_count, 0);
  const passages = a.chapters.reduce((s, ch) => s + ch.beats, 0);
  const date = (o.date ?? new Date()).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  out.push(
    `<line x1="${M}" x2="${W - M}" y1="${footer - 34}" y2="${footer - 34}" stroke="${p.ink}" stroke-opacity="0.16"/>`,
    `<path d="M${M} ${footer - 14}c10 0 12-12 22-12s12 16 22 16" fill="none" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>`,
    text(M + 56, footer - 4, 19, p.ink, "shapesofstories", 'font-weight="600"'),
    text(
      W - M,
      footer - 4,
      16,
      p.muted,
      `${words.toLocaleString("en-US")} words · ${a.chapters.length} chapters · ${passages.toLocaleString("en-US")} passages · ${date}`,
      'text-anchor="end"',
    ),
    lines(
      wrap(COLOPHON, inner, 15, EM.italic, 2),
      M,
      footer + 28,
      15,
      21,
      p.muted,
      'font-style="italic"',
    ),
  );

  // The grain is printed on the paper only; the ink poster is the dark page as it is.
  const grain =
    o.palette === "paper"
      ? `<filter id="sos-poster-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 0 1"/></filter><rect width="${W}" height="${H}" filter="url(#sos-poster-grain)" opacity=".07"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<style>${fontFace(o.fonts.title, "600")}${fontFace(o.fonts.text, "300 500")}${fontFace(o.fonts.italic, "300 700", "italic")}</style>
<rect width="${W}" height="${H}" fill="${p.bg}"/>${grain}
${out.join("\n")}
</svg>`;
}
