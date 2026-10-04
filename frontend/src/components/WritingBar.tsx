import { useState, type PointerEvent } from "react";
import type { ChapterStat } from "../types";
import { writingBackground } from "../lib/definitions";
import Tip from "./Tip";

export const pct = (f: number) => `${Math.round(f * 100)}%`;
type Shares = Pick<ChapterStat, "mode_share">;
export const shares = (c: Shares) => Object.entries(c.mode_share).map(([m, f]) => `${m} ${pct(f)}`);

// The index of the segment under a point that lies at this fraction of the bar's width.
function segmentAt(flex: number[], at: number) {
  const total = flex.reduce((a, b) => a + b, 0);
  let edge = 0;
  const i = flex.findIndex((f) => (edge += f / total) > at);
  return i < 0 ? flex.length - 1 : i;
}

// On a phone the bar sits inside the row's button, so only the table's bar takes focus and hovers a tooltip.
export default function WritingBar({
  c,
  tip = false,
  width = 120,
  name,
}: {
  c: Shares;
  tip?: boolean;
  width?: number;
  name?: string;
}) {
  const [hot, setHot] = useState(-1);
  const [focused, setFocused] = useState(false);
  const entries = Object.entries(c.mode_share);
  const parts = shares(c);
  const live = tip && entries.length > 0;
  // Found on enter as well as on move, so the tip never opens before it knows the segment.
  const point = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHot(
      segmentAt(
        entries.map(([, f]) => f),
        (e.clientX - r.left) / r.width,
      ),
    );
  };
  const bar = (
    <span
      role="img"
      aria-label={(name ? `${name}: ` : "") + (parts.join(", ") || "no writing measured")}
      tabIndex={live ? 0 : undefined}
      onPointerEnter={live ? point : undefined}
      onPointerMove={live ? point : undefined}
      onPointerLeave={live ? () => setHot(-1) : undefined}
      onFocus={live ? () => setFocused(true) : undefined}
      onBlur={live ? () => setFocused(false) : undefined}
      className="flex h-[10px] shrink-0 overflow-hidden rounded-sm"
      style={{ width }}
    >
      {entries.map(([m, f], i) => (
        <span
          key={m}
          className="transition-opacity"
          style={{
            flex: f,
            background: writingBackground(m),
            boxShadow: i === hot ? "inset 0 0 0 1.5px var(--ink)" : undefined,
            opacity: hot >= 0 && i !== hot ? 0.7 : undefined,
          }}
        />
      ))}
    </span>
  );
  if (!live) return bar;
  // The pointer asks about one segment; the keys ask about the bar, so they get every share.
  const text =
    hot >= 0
      ? `${entries[hot][0]} · ${pct(entries[hot][1])}`
      : focused
        ? parts.map((p) => (
            <span key={p} className="block">
              {p}
            </span>
          ))
        : "";
  return <Tip text={text}>{bar}</Tip>;
}
