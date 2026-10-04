import { useRef } from "react";
import type { BeatAnswers, Structure, WorkState } from "../types";
import { isScored } from "../types";
import { ChartFrame, xOf, yOf } from "./ChartFrame";
import { useChartSize } from "./useChartSize";
import { LAYERS } from "../lib/layers";
import { BINS, beatSpans, binsOfBeat } from "../lib/bins";
import { textButton } from "../lib/ui";

// While a work is read, the chart's own frame fills in with raw fortune points, and the progress sits underneath.
export default function ArcChartLive({
  answers,
  structure,
  state,
  done,
  total,
  secondsLeft,
  queuePosition,
  onCancel,
}: {
  answers: Record<number, BeatAnswers>;
  structure: Structure;
  state: WorkState;
  done: number;
  total: number;
  // Null until the pace is known, and then no time is shown.
  secondsLeft: number | null;
  queuePosition: number | null;
  onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useChartSize(box);
  const spans = beatSpans(structure);
  const origin = spans.length ? spans[0][0] : 0;
  const totalSpan = spans.length ? spans[spans.length - 1][1] - origin : 0;
  const pts = structure.beats.map((b, i) => {
    const [a0, a1] = spans[i];
    const share = totalSpan ? ((a0 + a1) / 2 - origin) / totalSpan : 0;
    const ans = answers[b.idx];
    return ans && isScored(ans)
      ? [xOf(share * BINS - 0.5, width), yOf(ans.scores.fortune.score, height)]
      : null;
  });
  // The line follows a centered three-point mean of the scored points in passage order, so single readings do not jag it; the points stay raw, and the line's last stretch draws itself in.
  const last = pts.findLastIndex(Boolean),
    lastPt = last >= 0 ? pts[last] : null,
    raw = pts.filter((p) => p !== null),
    scored = raw.map(([x], i) => {
      const near = raw.slice(Math.max(0, i - 1), i + 2);
      return [x, near.reduce((a, p) => a + p[1], 0) / near.length];
    }),
    body = scored.slice(0, -1),
    tail = scored.slice(-2);
  const chapters = structure.chapters.map((c) => {
    const i = structure.beats.findIndex((b) => b.chapter_idx === c.idx);
    return { idx: c.idx, title: c.title, start_bin: i < 0 ? null : binsOfBeat(structure, i)[0] };
  });
  const queued = state === "queued" && typeof queuePosition === "number",
    paused = state === "paused";
  const parts: string[] = [];
  if (queued) parts.push(`Position ${queuePosition} in the queue`);
  else if (done > 0) {
    parts.push(`Passage ${done} of ${total}`);
    if (!paused && secondsLeft !== null)
      parts.push(secondsLeft > 0 ? `about ${secondsLeft} s left` : "nearly done");
  }
  if (paused)
    parts.push(
      parts.length
        ? "waiting for your TypeSafe rate limit"
        : "Waiting for your TypeSafe rate limit",
    );
  return (
    <div ref={box} className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        role="img"
        aria-label="Fortune so far"
      >
        <ChartFrame
          chapters={chapters}
          width={width}
          height={height}
          axis="fortune"
          second={null}
          transcript={structure.preset === "transcript"}
        />
        <g fill="none" stroke={LAYERS.fortune.color} strokeOpacity={0.45} strokeWidth={1.2}>
          {body.length > 1 && <path d={`M${body.join("L")}`} />}
          {tail.length === 2 && (
            <path key={last} className="live-draw" pathLength={1} d={`M${tail.join("L")}`} />
          )}
        </g>
        {pts.map(
          (p, i) =>
            p && (
              <circle
                key={i}
                className="live-settle"
                cx={p[0]}
                cy={p[1]}
                r={3}
                fill={LAYERS.fortune.color}
              />
            ),
        )}
        {lastPt && (
          <circle
            key={`ring-${last}`}
            data-ring
            className="live-ring"
            cx={lastPt[0]}
            cy={lastPt[1]}
            r={3}
            fill="none"
            stroke={LAYERS.fortune.color}
          />
        )}
      </svg>
      <div
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={done}
        className="h-[2px] w-full"
        style={{ background: "var(--rule)" }}
      >
        <div
          className="h-full transition-[width] duration-[var(--motion-draw)] ease-[var(--ease-draw)]"
          style={{
            width: `${total ? Math.min(100, (done / total) * 100) : 0}%`,
            background: "var(--accent)",
          }}
        />
      </div>
      <div className="flex items-center gap-x-4 text-[13px]">
        {parts.length > 0 && (
          <p className="tabular-nums text-[var(--muted)]">{parts.join(" · ")}</p>
        )}
        <button className={`ml-auto ${textButton}`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
