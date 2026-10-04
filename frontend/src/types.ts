export const AXES = [
  "fortune",
  "tension",
  "mystery",
  "humor",
  "warmth",
  "romance",
  "wonder",
  "dread",
  "sorrow",
  "pace",
] as const;
export type Axis = (typeof AXES)[number];
export const EVENT_TYPES = [
  "reveal",
  "death",
  "arrival_departure",
  "location_change",
  "confrontation",
  "reconciliation",
  "decision",
  "betrayal",
  "injury_violence",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface Beat {
  idx: number;
  chapter_idx: number;
  start_cp: number;
  end_cp: number;
  word_count: number;
  start_s: number | null;
  end_s: number | null;
}
export interface Chapter {
  idx: number;
  title: string;
  start_cp: number;
  end_cp: number;
}
export interface Section {
  idx: number;
  title: string;
  start_cp: number;
  end_cp: number;
}
export interface Structure {
  sections: Section[];
  chapters: Chapter[];
  beats: Beat[];
  chapter_source: string;
  preset: "prose" | "screenplay" | "transcript";
  word_count: number;
}

// The two stored smoothings; a curve is drawn at either or at a blend between them.
export interface AxisBins {
  raw: (number | null)[];
  sd: (number | null)[];
  shape: number[];
  detail: number[];
  band: { shape: [number[], number[]]; detail: [number[], number[]] };
}
export interface Archetype {
  state: "named" | "leans" | "none";
  shape: string | null;
  caption: string;
  r: number;
  margin: number;
}
export interface EventMarker {
  type: EventType;
  beat_idx: number;
  bin: number;
  probability: number;
  strength: "strong" | "faint";
}
export interface ChapterStat {
  idx: number;
  title: string;
  word_count: number;
  beats: number;
  means: Record<Axis, number | null>;
  mode_share: Record<string, number>;
  event_count: number;
  start_bin: number | null;
}
export interface Analysis {
  version: 1;
  axes: Axis[];
  bins: Record<Axis, AxisBins>;
  empty_bins: number[];
  missing_beats: number[];
  archetype: Archetype;
  events: EventMarker[];
  chapters: ChapterStat[];
  mode_share: Record<string, number>;
  drivers: Record<
    string,
    Record<
      string,
      { paragraph_idx: number | null; paragraph_end_idx: number | null; confidence: number }
    >
  >;
  driver_gate: number;
}

// A passage either has answers or says why it has none; a gallery work keeps only the answers the analysis reads.
export interface ScoredAnswers {
  scores: Record<Axis, { score: number; p?: number[]; confidence?: number; sd: number }>;
  events: Record<EventType, number>;
  mode: { choice: string; confidence: number };
}
export interface MissingAnswers {
  missing: true;
  error: string;
}
export type BeatAnswers = ScoredAnswers | MissingAnswers;
export function isScored(a: BeatAnswers): a is ScoredAnswers {
  return !("missing" in a);
}

export type WorkState = "queued" | "running" | "paused" | "complete" | "failed" | "cancelled";
export interface WorkView {
  id: string;
  title: string | null;
  author: string | null;
  kind: string;
  format: string;
  state: WorkState;
  error: string | null;
  kept: boolean;
  word_count: number;
  structure: Structure;
  analysis: Analysis | null;
  done: number;
  total: number;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
  model_id: string | null;
  question_set_version: string;
  kind_warning: string | null;
  queue_position: number | null;
  // The preview's estimate of what the analysis cost, in dollars.
  cost_usd: number;
  // Opens the work's event stream for its owner, since EventSource sends no session header.
  events_ticket: string;
}
export interface Preview {
  title: string | null;
  author: string | null;
  format: string;
  word_count: number;
  chapters: Chapter[];
  sections: Section[];
  beats: Beat[];
  preset: Structure["preset"];
  chapter_source: string;
  stripped: { label: string; word_count: number }[];
  warnings: string[];
  estimate: {
    words: number;
    beats: number;
    requests: number;
    tokens: number;
    cost_usd: number;
    seconds: number;
  };
  content_hash: string;
  english: boolean;
  normalized_text: string;
}
export interface WorkSummary {
  id: string;
  title: string | null;
  author: string | null;
  kind: string;
  state: WorkState;
  kept: boolean;
  word_count: number;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
  caption: string | null;
}

export interface GalleryEntry {
  slug: string;
  title: string;
  author: string;
  word_count: number;
  content_hash: string;
  question_set_version: string;
  model_id: string;
  archetype: Pick<Archetype, "state" | "shape" | "caption" | "r" | "margin">;
  sparkline: number[];
}
export interface GalleryWork {
  work: {
    title: string;
    author: string;
    word_count: number;
    kind: string;
    format: string;
    content_hash: string;
    question_set_version: string;
    model_id: string;
  };
  structure: Structure;
  analysis: Analysis;
}

export interface LocalWork {
  id: string;
  title: string | null;
  author: string | null;
  text: string;
  structure: Structure;
  analysis: Analysis | null;
  answers: Record<number, BeatAnswers>;
  savedAt: number;
  // A copy saved before results carried these has neither.
  question_set_version?: string;
  model_id?: string | null;
  // The preview's hash of the normalized text; a copy saved before works carried it has none.
  content_hash?: string;
  // A copy saved before works carried their cost has none, and shows none.
  cost_usd?: number;
}
