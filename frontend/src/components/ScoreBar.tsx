import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion, tweenValues } from "../lib/motion";

const W = 48;
// How long a bar takes to move to another passage's score.
const MOVE = 260;
const tenth = (v: number) => Math.round(v * 10) / 10;
const at = (v: number, max: number) => tenth((Math.min(max, Math.max(0, v)) / max) * W);

// A score as a share of its scale, so "out of 4" is seen, with its spread as a lighter range; with `move`, a new score starts from what the bar shows, so a burst of scores never jumps.
export default function ScoreBar({
  score,
  sd,
  color,
  max = 4,
  label,
  move = false,
}: {
  score: number | null;
  sd?: number;
  color: string;
  max?: number;
  label?: string;
  move?: boolean;
}) {
  const ends =
    score !== null && sd !== undefined ? [at(score - sd, max), at(score + sd, max)] : null;
  const fill = useRef<HTMLSpanElement>(null),
    range = useRef<HTMLSpanElement>(null),
    num = useRef<HTMLSpanElement>(null);
  // The score and its range's ends as last drawn, from nothing before the first.
  const drawn = useRef([0, 0, 0]);
  // Before paint, so the new score is never shown for a frame before the move starts.
  useLayoutEffect(() => {
    if (!move) return;
    const spread = sd ?? 0;
    const to = score === null ? [0, 0, 0] : [score, score - spread, score + spread];
    const paint = (v: number[]) => {
      drawn.current = v;
      const [s, a, b] = v;
      if (fill.current) fill.current.style.width = `${at(s, max)}px`;
      if (range.current) {
        range.current.style.left = `${at(a, max)}px`;
        range.current.style.width = `${tenth(at(b, max) - at(a, max))}px`;
      }
      if (num.current && score !== null) num.current.textContent = s.toFixed(1);
    };
    if (score === null || prefersReducedMotion()) {
      paint(to);
      return;
    }
    const stop = tweenValues(drawn.current, to, MOVE, paint);
    return () => void stop();
  }, [move, score, sd, max]);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        data-bar
        className="relative h-1 shrink-0 overflow-hidden rounded-full"
        style={{ width: W, background: "var(--rule)" }}
      >
        {score !== null && (
          <span
            ref={fill}
            data-fill
            className="absolute inset-y-0 left-0"
            style={{ width: at(score, max), background: color }}
          />
        )}
        {ends && (
          <span
            ref={range}
            data-range
            className="absolute top-px h-0.5"
            style={{
              left: ends[0],
              width: tenth(ends[1] - ends[0]),
              background: `color-mix(in srgb, ${color} 40%, var(--paper))`,
            }}
          />
        )}
      </span>
      <span
        ref={num}
        aria-hidden={label ? true : undefined}
        className="min-w-[1.6em] text-right tabular-nums"
      >
        {score === null ? "–" : score.toFixed(1)}
      </span>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
