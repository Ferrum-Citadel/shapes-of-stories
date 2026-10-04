import type { Axis } from "../types";

// Below this confidence a passage's mode shows as "mixed" (backend MODE_MIXED_CONFIDENCE).
export const MODE_CONFIDENCE = 0.6;
// Every score and curve runs from 0 to this, one step per level of the question.
export const SCORE_MAX = 4;

// Layer colors are tokens so that each theme sets its own.
export const LAYERS: Record<Axis, { color: string; dash: string }> = {
  fortune: { color: "var(--accent)", dash: "" },
  warmth: { color: "var(--ax-warmth)", dash: "6 3" },
  humor: { color: "var(--ax-humor)", dash: "2 3" },
  romance: { color: "var(--ax-romance)", dash: "8 3 2 3" },
  wonder: { color: "var(--ax-wonder)", dash: "10 4" },
  dread: { color: "var(--ax-dread)", dash: "3 3" },
  sorrow: { color: "var(--ax-sorrow)", dash: "12 3 3 3" },
  tension: { color: "var(--ax-tension)", dash: "9 3 1 3" },
  mystery: { color: "var(--ax-mystery)", dash: "5 4" },
  pace: { color: "var(--ax-pace)", dash: "1 4" },
};
export const GROUPS = {
  Feeling: ["fortune", "warmth", "humor", "romance", "wonder", "dread", "sorrow"],
  Telling: ["tension", "mystery", "pace"],
} as const;
