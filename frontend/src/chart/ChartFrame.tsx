import { memo } from "react";
import type { Axis, Structure } from "../types";
import { LAYERS, SCORE_MAX } from "../lib/layers";
import { AXIS_INFO } from "../lib/definitions";
import { BINS, binsOfBeat, chapterNameOfBeat, chapterNumeral } from "../lib/bins";

export const PLOT = { width: 900, height: 320, l: 12, r: 12, t: 12, b: 44 };
export function xOf(bin: number, width = PLOT.width) {
  return PLOT.l + (Math.max(0, Math.min(BINS - 1, bin)) / (BINS - 1)) * (width - PLOT.l - PLOT.r);
}
export function yOf(v: number, height = PLOT.height) {
  return (
    height - PLOT.b - (Math.max(0, Math.min(SCORE_MAX, v)) / SCORE_MAX) * (height - PLOT.t - PLOT.b)
  );
}

// Sizes are pixels, since the chart is drawn at the width it is shown; the widths are guesses at a character (a generous 8.2 for a numeral, 6.1 for an italic word, whose gap below allows for it).
const NUMERAL = 12,
  WORDS = 13,
  numeralW = (s: string) => s.length * 8.2;
export const wordsW = (s: string) => s.length * 6.5;

// Lettering over the curves is ringed in the page color, so a line passing under it never cuts through a letter.
export const halo = {
  stroke: "var(--bg)",
  strokeWidth: 3,
  strokeLinejoin: "round",
  style: { paintOrder: "stroke" },
} as const;

type FrameChapter = { idx: number; title: string; start_bin: number | null };

// Label a tick only once the last label has ended (32 at least), and never past the right edge.
export function tickLabels(chapters: FrameChapter[], width: number) {
  const labels: { idx: number; x: number; text: string }[] = [];
  for (const c of chapters) {
    if (c.start_bin === null) continue;
    const cx = xOf(c.start_bin, width),
      text = chapterNumeral(c.title, c.idx),
      prev = labels.at(-1);
    if (
      (prev && cx - prev.x < Math.max(32, numeralW(prev.text) + 4)) ||
      cx + 3 + numeralW(text) > width - PLOT.r
    )
      continue;
    labels.push({ idx: c.idx, x: cx, text });
  }
  return labels;
}

// The note goes right of the line, else left of it, losing the chapter's name when neither side holds it, and on a chart too narrow for either it sits inside the plot over the line; a first pin's hint to let go outranks the name.
export function pinNote(cx: number, chapter: string, beat: number, width: number, hint = false) {
  const { l, r } = PLOT;
  const right = (s: string) => cx + 8 + wordsW(s) <= width - r,
    left = (s: string) => cx - 8 - wordsW(s) >= l;
  const short = `passage ${beat + 1} · pinned`,
    tries = [`${chapter} · ${short}`, short];
  if (hint) tries.unshift(...tries.map((s) => `${s} · Esc releases`));
  const text = tries.find((s) => right(s) || left(s)) ?? short;
  if (right(text)) return { text, at: cx + 8, anchor: "start" as const };
  if (left(text)) return { text, at: cx - 8, anchor: "end" as const };
  const at = Math.max(l, Math.min(cx - wordsW(text) / 2, width - r - wordsW(text)));
  return { text, at, anchor: "start" as const };
}

// The note shares the high words' line, so it drops one where it would run into either corner's words.
export function noteY(
  note: ReturnType<typeof pinNote>,
  axis: Axis,
  second: Axis | null,
  width: number,
) {
  const { l, r, t } = PLOT;
  const from = note.anchor === "end" ? note.at - wordsW(note.text) : note.at,
    to = from + wordsW(note.text);
  const clash =
    from < l + 4 + wordsW(AXIS_INFO[axis].high) + 8 ||
    (second !== null && to > width - r - 4 - wordsW(AXIS_INFO[second].high) - 8);
  return clash ? t + 28 : t + 14;
}

// The column a passage takes on the plot, at least one bin wide.
export function passageColumn(structure: Structure, beat: number, x: (bin: number) => number) {
  const [lo, hi] = binsOfBeat(structure, beat),
    binW = x(1) - x(0);
  return { x: x(lo) - binW / 2, width: Math.max(binW, x(hi) - x(lo) + binW) };
}

// The pinned passage is marked at its middle bin, with its ring on the first layer's line at ringY.
export function pinMark(
  structure: Structure,
  beat: number,
  x: (bin: number) => number,
  ringY: (bin: number) => number,
  width: number,
  axis: Axis,
  second: Axis | null,
  hint = false,
) {
  const [lo, hi] = binsOfBeat(structure, beat),
    cx = x((lo + hi) / 2),
    note = pinNote(cx, chapterNameOfBeat(structure, beat), beat, width, hint);
  return {
    beat,
    cx,
    cy: ringY(Math.round((lo + hi) / 2)),
    y: noteY(note, axis, second, width),
    ...note,
  };
}

export const word = {
  fontSize: WORDS,
  fill: "var(--muted)",
  fontFamily: "var(--serif)",
  fontStyle: "italic",
} as const;

// A layer's name over its high word, the high word on the pinned note's line and the low word just above the baseline.
export function AxisWords({
  axis,
  x,
  end,
  low,
  fill = LAYERS[axis].color,
}: {
  axis: Axis;
  x: number;
  end: boolean;
  low: number;
  fill?: string;
}) {
  const { t } = PLOT;
  const anchor = end ? ("end" as const) : undefined;
  const words = { ...word, ...halo, fill, textAnchor: anchor };
  return (
    <g data-axis-words={axis}>
      <text className="label" x={x} y={t + 2} fill="var(--muted)" textAnchor={anchor} {...halo}>
        {AXIS_INFO[axis].name}
      </text>
      <text x={x} y={t + 14} {...words}>
        {AXIS_INFO[axis].high}
      </text>
      <text x={x} y={low} {...words}>
        {AXIS_INFO[axis].low}
      </text>
    </g>
  );
}

// Three faint gridlines over a firmer baseline.
export function Grid({ width, y }: { width: number; y: (v: number) => number }) {
  const { l, r } = PLOT;
  return (
    <>
      {[1, 2, 3].map((v) => (
        <line
          key={v}
          x1={l}
          x2={width - r}
          y1={y(v)}
          y2={y(v)}
          stroke="currentColor"
          strokeOpacity={0.08}
        />
      ))}
      <line x1={l} x2={width - r} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.5} />
    </>
  );
}

// The gridlines, the focus layer's words and the chapter ticks; the live chart draws the same frame so it turns into the finished one without a jump.
export const ChartFrame = memo(function ChartFrame({
  chapters,
  width,
  height,
  axis,
  second,
  transcript,
}: {
  chapters: FrameChapter[];
  width: number;
  height: number;
  axis: Axis;
  second: Axis | null;
  transcript: boolean;
}) {
  const { l, r, t, b } = PLOT;
  const x = (bin: number) => xOf(bin, width),
    y = (v: number) => yOf(v, height);
  const labels = tickLabels(chapters, width);
  // The middle caption is shortened, then left out, where it would run into "beginning".
  const caption = (
    transcript
      ? ["minutes · chapter starts marked", "minutes"]
      : ["percent of the book · chapter starts marked", "percent of the book"]
  ).find((s) => wordsW(s) / 2 + 8 <= (width - l - r) / 2 - wordsW("beginning"));
  return (
    <>
      <Grid width={width} y={y} />
      {chapters.map((c) =>
        c.start_bin === null ? null : (
          <line
            key={c.idx}
            data-chapter-tick
            x1={x(c.start_bin)}
            x2={x(c.start_bin)}
            y1={t}
            y2={height - b}
            stroke="currentColor"
            strokeOpacity={0.12}
          />
        ),
      )}
      <AxisWords axis={axis} x={l + 4} end={false} low={y(0) - 6} />
      {second && <AxisWords axis={second} x={width - r - 4} end low={y(0) - 6} />}
      {labels.map((c) => (
        <text
          key={c.idx}
          data-chapter-label
          x={c.x + 3}
          y={height - b + 14}
          fontSize={NUMERAL}
          fill="var(--muted)"
        >
          {c.text}
        </text>
      ))}
      <text x={l} y={height - 4} {...word}>
        beginning
      </text>
      {caption && (
        <text x={(l + width - r) / 2} y={height - 4} textAnchor="middle" {...word}>
          {caption}
        </text>
      )}
      <text x={width - r} y={height - 4} textAnchor="end" {...word}>
        end
      </text>
    </>
  );
});
