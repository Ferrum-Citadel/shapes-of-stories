import type { Analysis, Axis, Chapter, Structure } from "../types";

export const BINS = 100;

// Kept per structure, since every pointer move over the chart asks for them.
const spansOf = new WeakMap<Structure, [number, number][]>();

// Each passage's span as backend/app/core/curves/bins.py beat_spans counts it: by words in prose and screenplays, by clock time in a transcript.
export function beatSpans(s: Structure): [number, number][] {
  let out = spansOf.get(s);
  if (out) return out;
  if (s.preset === "transcript")
    out = s.beats.map((b) => [b.start_s ?? 0, b.end_s ?? 0] as [number, number]);
  else {
    out = [];
    let pos = 0;
    for (const b of s.beats) {
      out.push([pos, pos + b.word_count]);
      pos += b.word_count;
    }
  }
  spansOf.set(s, out);
  return out;
}

function total(spans: [number, number][]): number {
  return spans.length ? spans[spans.length - 1][1] - spans[0][0] : 0;
}

// Mirrors bin_of_beat: the [lo, hi] bin range a beat occupies on the 100-bin axis.
export function binsOfBeat(s: Structure, idx: number): [number, number] {
  const spans = beatSpans(s);
  const t = total(spans);
  const origin = spans[0][0];
  const [a, b] = spans[idx];
  const lo = Math.min(BINS - 1, Math.floor(((a - origin) / t) * BINS + 1e-9));
  const hi = Math.min(BINS - 1, Math.floor(((b - origin) / t) * BINS - 1e-9));
  return [lo, Math.max(lo, hi)];
}

export function chapterAtBeat(s: Structure, i: number): Chapter | undefined {
  return s.chapters[s.beats[i]?.chapter_idx ?? -1];
}

export function chapterTitleOfBeat(s: Structure, i: number): string {
  return chapterAtBeat(s, i)?.title ?? "";
}

// The beat whose span overlaps the bin's share of the total the most; ties go to the lower index.
export function beatForBin(s: Structure, bin: number): number {
  const spans = beatSpans(s);
  const t = total(spans);
  const origin = spans[0][0];
  const lo = origin + (bin / BINS) * t;
  const hi = origin + ((bin + 1) / BINS) * t;
  let best = 0;
  let bestOverlap = -Infinity;
  spans.forEach(([a, b], i) => {
    const overlap = Math.min(b, hi) - Math.max(a, lo);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = i;
    }
  });
  return best;
}

// A passage's mean raw score over its bins; empty bins are null and left out of the mean.
export function passageMean(
  raw: (number | null)[],
  beat: number,
  structure: Structure,
): number | null {
  const [lo, hi] = binsOfBeat(structure, beat);
  const v = raw.slice(lo, hi + 1).filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

// Numerals are matched in capitals only, so "Mild" or "Civil" is never read as one.
const NUMERAL = /\b([IVXLCDM]+|\d+)\b/;

// A title of several words without a numeral gets its place in the book, since its first word ("PART", "THE") would repeat.
export function chapterNumeral(title: string, idx: number): string {
  const decile = title.match(/(\d+)\s*[–-]\s*(\d+)\s*%/);
  if (decile) return `${decile[2]}%`;
  const words = title.trim().split(/\s+/);
  return title.match(NUMERAL)?.[1] ?? (words.length > 1 ? String(idx + 1) : words[0]);
}

// A chapter in a sentence is its numeral, its stretch of the book, or its title up to the first full stop.
export function chapterName(title: string, idx: number): string {
  const n = chapterNumeral(title, idx);
  if (n.endsWith("%")) return `around ${n}`;
  if (NUMERAL.test(title)) return `chapter ${n}`;
  const cut = title.split(".")[0];
  return cut.length > 24 ? `${cut.slice(0, 23).trimEnd()}…` : cut;
}

export function chapterNameOfBeat(s: Structure, beat: number): string {
  const c = chapterAtBeat(s, beat);
  return c ? chapterName(c.title, c.idx) : "";
}

export type Drivers = Partial<Record<Axis, [number, number]>>;

// The paragraphs that moved each drawn layer's line in a passage, where the reading is sure enough to mark them.
export function driversOf(analysis: Analysis, axes: Axis[], beat: number): Drivers {
  const out: Drivers = {};
  for (const ax of axes) {
    const d = analysis.drivers[ax]?.[String(beat)];
    if (
      d &&
      d.paragraph_idx !== null &&
      d.paragraph_end_idx !== null &&
      d.confidence >= analysis.driver_gate
    )
      out[ax] = [d.paragraph_idx, d.paragraph_end_idx];
  }
  return out;
}
