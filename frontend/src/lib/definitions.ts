import type { Archetype, Axis, EventType, WorkView } from "../types";
import { version } from "../../public/questions.json";

// The question set this build asks; results scored under another one say so.
export const QUESTION_SET = version;

export const AXIS_INFO: Record<
  Axis,
  { name: string; definition: string; low: string; high: string }
> = {
  fortune: {
    name: "Fortune",
    definition: "How well things are going for the characters, from ill to good.",
    low: "ill",
    high: "good",
  },
  tension: {
    name: "Tension",
    definition: "How much the reader wants to know what happens next.",
    low: "calm",
    high: "gripping",
  },
  mystery: {
    name: "Mystery",
    definition: "How much is being withheld: questions raised and not yet answered.",
    low: "all told",
    high: "deep puzzle",
  },
  humor: {
    name: "Humor",
    definition: "How much the passage is playing for a smile or a laugh.",
    low: "straight",
    high: "comic",
  },
  warmth: {
    name: "Warmth",
    definition: "Kindness, affection and fellow feeling between the characters.",
    low: "cold",
    high: "tender",
  },
  romance: {
    name: "Romance",
    definition: "Love and desire on the page, felt or pursued.",
    low: "none",
    high: "ardent",
  },
  wonder: {
    name: "Wonder",
    definition: "Awe, strangeness and the sense of something larger.",
    low: "plain",
    high: "marvelous",
  },
  dread: {
    name: "Dread",
    definition: "Fear of what is coming, from unease to terror.",
    low: "safe",
    high: "terror",
  },
  sorrow: {
    name: "Sorrow",
    definition: "Grief and loss, borne or feared.",
    low: "untroubled",
    high: "grief",
  },
  pace: {
    name: "Pace",
    definition: "How fast things happen: new developments per page.",
    low: "still",
    high: "headlong",
  },
};

// How the work that scores higher on a layer differs, in a word or two.
export const DIFFERENCE_WORDS: Record<Axis, string> = {
  fortune: "better off",
  tension: "more gripping",
  mystery: "more mysterious",
  humor: "funnier",
  warmth: "warmer",
  romance: "more romantic",
  wonder: "more wondrous",
  dread: "more fearful",
  sorrow: "sadder",
  pace: "faster",
};

export const EVENT_NAMES: Record<EventType, string> = {
  reveal: "reveal",
  death: "death",
  arrival_departure: "arrival or departure",
  location_change: "new place",
  confrontation: "confrontation",
  reconciliation: "reconciliation",
  decision: "decision",
  betrayal: "betrayal",
  injury_violence: "injury",
};

export const WRITING = {
  title: "Writing",
  definition: "What kind of prose fills the passage: what it reads as mostly doing.",
  kinds: {
    action: "things happening",
    dialogue: "people talking",
    description: "places, faces, weather",
    reflection: "a mind turning things over",
    exposition: "the narrator explaining",
    mixed: "no one kind dominates",
  },
};
// Marks in the page's own paper color, so a pattern reads light on dark and dark on light alike.
const MARK = "color-mix(in srgb, var(--paper) 55%, transparent)";
// A pattern over each color, so kinds that sit side by side are not told apart by color alone.
export const WRITING_STYLE: Record<string, { color: string; pattern: string }> = {
  action: { color: "var(--ax-tension)", pattern: "none" },
  dialogue: {
    color: "var(--ax-wonder)",
    pattern: `repeating-linear-gradient(0deg, transparent 0 2px, ${MARK} 2px 3px)`,
  },
  description: {
    color: "var(--ax-humor)",
    pattern: `radial-gradient(circle, ${MARK} 0 1px, transparent 1.5px) 0 0 / 4px 4px`,
  },
  reflection: {
    color: "var(--ax-dread)",
    pattern: `repeating-linear-gradient(45deg, transparent 0 2px, ${MARK} 2px 3px)`,
  },
  exposition: { color: "var(--ax-pace)", pattern: "none" },
  mixed: {
    color: "var(--muted)",
    pattern: "repeating-linear-gradient(135deg, transparent 0 2px, var(--paper) 2px 5px)",
  },
};
export const writingBackground = (kind: string) => {
  const s = WRITING_STYLE[kind] ?? WRITING_STYLE.mixed;
  return `${s.pattern}, ${s.color}`;
};

export const SPREAD_NOTE =
  "Each of the five levels gets a probability; the score, out of 4, is their average and fills the bar, and the thin lighter range on the bar is how spread out they were. A short range is a confident reading, a long one means the passage could be read two ways. The shaded band on the chart is the same thing, smoothed.";

export const FAMILY_ORDER = [
  "fall_rise",
  "rise_fall_rise",
  "rise",
  "fall",
  "rise_fall",
  "fall_rise_fall",
  "none",
] as const;
export type Family = (typeof FAMILY_ORDER)[number];
export const isFamily = (s: string | null): s is Family =>
  (FAMILY_ORDER as readonly (string | null)[]).includes(s);

export const SHAPE_INFO: Record<Family, { name: string; description: string; quote?: string }> = {
  fall_rise: {
    name: "Man in a Hole",
    description:
      "Somebody gets into trouble, gets out of it again, and ends up better off for the experience.",
    quote: "In Vonnegut's own words.",
  },
  rise_fall_rise: {
    name: "Cinderella",
    description: "Low, then rising, then a slide, then good at the end.",
    quote:
      "Vonnegut said people love this story, and every time it is retold somebody makes another million dollars.",
  },
  rise: { name: "Rags to Riches", description: "A steady climb from ill fortune to good." },
  fall: { name: "Tragedy", description: "A long fall that does not come back." },
  rise_fall: { name: "Icarus", description: "A rise, then a fall." },
  fall_rise_fall: { name: "Oedipus", description: "A fall, a recovery, and a final fall." },
  none: {
    name: "No clear shape",
    description:
      "Vonnegut said Hamlet has no shape either: we cannot tell whether the news is good or bad. These keep their own counsel.",
  },
};

// Each shape is one cosine, the same term and sign that backend/app/core/curves/classify.py compares against.
const TEMPLATE: Partial<Record<Family, (t: number) => number>> = {
  rise: (t) => -Math.cos(Math.PI * t),
  fall: (t) => Math.cos(Math.PI * t),
  fall_rise: (t) => Math.cos(2 * Math.PI * t),
  rise_fall: (t) => -Math.cos(2 * Math.PI * t),
  rise_fall_rise: (t) => -Math.cos(3 * Math.PI * t),
  fall_rise_fall: (t) => Math.cos(3 * Math.PI * t),
};
// Nothing to sketch without a shape, or for a shape this build does not know.
export function templateOf(
  a: Pick<Archetype, "state" | "shape">,
): ((t: number) => number) | undefined {
  return a.state === "none" || !isFamily(a.shape) ? undefined : TEMPLATE[a.shape];
}
// The y range a z-scored fortune line and its template share, wherever a shape is sketched.
export const SHAPE_Z = [-2.2, 2.2] as const;
// The template at a z-scored line's typical amplitude, sampled like a sparkline.
export function templateSamples(a: Pick<Archetype, "state" | "shape">): number[] | null {
  const template = templateOf(a);
  return template ? Array.from({ length: 100 }, (_, i) => template((i + 0.5) / 100) * 1.4) : null;
}
// The "none" entry when there is no shape; undefined for a shape this build does not know.
export function shapeInfo(a: Archetype): (typeof SHAPE_INFO)[Family] | undefined {
  if (a.state === "none" || !a.shape) return SHAPE_INFO.none;
  return isFamily(a.shape) ? SHAPE_INFO[a.shape] : undefined;
}

// A shape is named from this match on (backend SHAPE_NAMED_R).
export const SHAPE_NAMED_R = 0.55;
// Below this margin over the runner-up a shape only leans (backend SHAPE_MARGIN).
export const SHAPE_MARGIN = 0.1;
// Below this match there is no clear shape (backend SHAPE_LEANS_R).
export const SHAPE_LEANS_R = 0.4;

export const SHAPE_CARD_NOTE = `The smoothed fortune line is compared with each of six shapes and the closest is named. The match (r) says how alike they are; the margin says how far ahead it is of the runner-up. Under ${SHAPE_NAMED_R.toFixed(2)}, or with a slim margin, it only leans; under ${SHAPE_LEANS_R.toFixed(2)} there is no clear shape, which is an honest answer.`;

// The chart's explainer shows each text; the About page follows it with more.
export const HOW_TO_READ = [
  {
    sketch: "line",
    title: "One line is one feeling",
    text: "Every 800 words or so, the book is asked how things are going for its characters, on a scale from ill fortune to good. Joined up and smoothed, the answers make the fortune line; the slider on the chart sets how much they are smoothed, from detail to shape. The other lines work the same way for tension, warmth, dread and the rest.",
    more: "Each score runs from 0 to 4, and the five levels behind the numbers are printed with every question below. The thin lighter range on a passage's score bar is how spread out the five probabilities were: a short one is a confident reading, a long one means the passage could be read two ways. The shaded band around the line is the same doubt, smoothed.",
  },
  {
    sketch: "shape",
    title: "The shape is the line, squinted at",
    text: 'Vonnegut drew story shapes on a blackboard; later researchers settled on six. This compares the smoothed fortune line to each of the six and names the closest, saying how close. "Leans toward" and "no clear shape" are honest answers, not failures.',
    more: `The six, as Reagan and colleagues named them, are Man in a Hole, Cinderella, Rags to Riches, Tragedy, Icarus and Oedipus. The match, r, says how alike the line and the shape are, where 1 would be a perfect fit; the margin says how far the winner is ahead of the runner-up. Below ${SHAPE_NAMED_R.toFixed(2)}, or with a slim margin, a book only leans toward its shape; below ${SHAPE_LEANS_R.toFixed(2)} there is no clear shape at all, which is what Vonnegut said of Hamlet.`,
  },
  {
    sketch: "pin",
    title: "Click anywhere to read the page behind it",
    text: "Hover to look, click to pin, and click it again, press Escape or close the passage to let go; hover a line to bring it forward. The passage opens underneath with its scores and its text. The beads under the chart are events read with confidence, such as a reveal, a death or a betrayal. In the passage, an underline marks what moved the first line drawn, a rule in the margin what moved each of the others.",
    more: "The marked part of a passage is what moved its line most, as far as the reading can tell: a pointer, not a proof. A bead shows its likeliest event; the passage lists every event it holds, the faint ones too. If you analyze your own book and discard the text, the scores stay but the passages will not open.",
  },
] as const;

export const REPO_URL = "https://github.com/Ferrum-Citadel/shapes-of-stories";
export const COLOPHON =
  "A side project about the shapes of stories, after Vonnegut. About two cents a novel, and your text is never kept.";

export function shapeSentence(a: Archetype): string {
  if (a.state === "none" || !a.shape)
    return "No clear shape, and that's fine: Vonnegut said Hamlet doesn't have one either.";
  return shapeInfo(a)?.description ?? a.caption;
}
// How close the match is, in a few words.
export function matchWords(a: Pick<Archetype, "state" | "r">): string {
  return a.state === "none"
    ? "no clear shape"
    : a.state === "leans"
      ? "leans this way"
      : a.r >= 0.7
        ? "strong match"
        : "clear match";
}
export function confidenceSentence(a: Archetype): string {
  if (a.state === "none")
    return "Nothing reaches the threshold; the line does not settle into any of the six.";
  const strength = matchWords(a).replace(/^./, (c) => c.toUpperCase());
  const margin =
    a.margin >= 0.2
      ? "a clear margin"
      : a.margin >= SHAPE_MARGIN
        ? "a narrow margin"
        : "a slim margin";
  return a.state === "leans"
    ? `Leans this way, with ${margin} over the runner-up.`
    : `${strength}, with ${margin} over the other five shapes.`;
}

export function metaOf(
  w: Pick<WorkView, "word_count" | "structure"> &
    Partial<Pick<WorkView, "kind_warning" | "model_id" | "question_set_version" | "cost_usd">>,
  own = false,
): string {
  const s = w.structure;
  return [
    `${w.word_count.toLocaleString()} words`,
    `${s.chapters.length} chapters`,
    `analyzed in ${s.beats.length} ${s.beats.length === 1 ? "passage" : "passages"}`,
    own && w.cost_usd != null && `about $${w.cost_usd.toFixed(2)}`,
    s.preset === "transcript" && "transcript",
    w.kind_warning && `${w.kind_warning.replaceAll("_", " ")}: arcs may be less meaningful`,
    w.model_id,
    w.question_set_version,
  ]
    .filter(Boolean)
    .join(" · ");
}
