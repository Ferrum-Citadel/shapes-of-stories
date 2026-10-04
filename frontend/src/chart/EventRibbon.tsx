import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { EventMarker, Structure } from "../types";
import { EVENT_TYPES } from "../types";
import { EVENT_NAMES } from "../lib/definitions";
import { EventGlyph, GlyphPath } from "../components/icons";
import { PLOT, halo, word, wordsW } from "./ChartFrame";
import { chapterNameOfBeat, chapterTitleOfBeat } from "../lib/bins";
import { prefersReducedMotion } from "../lib/motion";
import { clusterEvents, type Cluster } from "./events";

interface Props {
  events: EventMarker[];
  structure: Structure;
  shown: number | null;
  pinned?: number | null;
  onHover: (i: number | null) => void;
  onPin: (i: number) => void;
  width?: number;
}
const H = 54,
  CY = 22,
  R = 11,
  REACH = 48;

const names = (c: Cluster) => [
  ...new Set(
    [...c.members].sort((a, b) => b.probability - a.probability).map((m) => EVENT_NAMES[m.type]),
  ),
];

const list = (xs: string[]) =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

// The least likely names give way to a count, then the chapter shortens, until the line fits the plot.
function annotate(all: string[], chapter: string, room: number) {
  let k = all.length;
  const text = () =>
    `${all.slice(0, k).join(" · ")}${k < all.length ? ` +${all.length - k}` : ""} — ${chapter}`;
  while (wordsW(text()) > room) {
    if (k > 1) k--;
    else if (chapter.length > 1) chapter = `${chapter.slice(0, chapter.endsWith("…") ? -2 : -1)}…`;
    else break;
  }
  return text();
}

export default function EventRibbon({
  events,
  structure,
  shown,
  pinned = null,
  onHover,
  onPin,
  width = PLOT.width,
}: Props) {
  const clusters = useMemo(() => clusterEvents(events, width), [events, width]);
  // Each bead's target reaches halfway to its neighbors and no further than the dock's reach, so hovering and growing agree.
  const spans = clusters.map((c, i) => [
    Math.max(c.x - REACH, i > 0 ? (clusters[i - 1].x + c.x) / 2 : 0),
    Math.min(c.x + REACH, i < clusters.length - 1 ? (c.x + clusters[i + 1].x) / 2 : width),
  ]);
  const [cursor, setCursor] = useState<number | null>(null);
  const keyed = cursor !== null && cursor < clusters.length ? cursor : null;
  const found = clusters.findIndex((c) => c.beat === shown);
  const active = keyed ?? (found < 0 ? null : found);
  const id = useId();
  const beadId = (i: number) => `${id}-bead-${i}`;
  const spoken = (c: Cluster) =>
    `${list(names(c))}, ${chapterTitleOfBeat(structure, c.beat)}, passage ${c.beat + 1}`;

  // The dock is drawn on the beads directly rather than through state, so following the mouse costs no render; each frame eases every bead's [scale, shift] 35 % of the way to its aim, so a new aim never restarts a motion.
  const beads = useRef(new Map<number, SVGGElement>());
  const drawn = useRef<number[][]>([]);
  const aim = useRef<number[][]>([]);
  const nearest = useRef<number | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // A new bead list leaves the aims pointing at beads that moved or went, so the dock starts again from rest.
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    drawn.current = [];
    aim.current = [];
    nearest.current = null;
    beads.current.forEach((b) => b.style.removeProperty("transform"));
  }, [clusters]);
  const tick = () => {
    let moving = false;
    aim.current.forEach((t, i) => {
      const c = drawn.current[i] ?? [1, 0];
      if (c[0] === t[0] && c[1] === t[1]) return;
      const next = c.map((v, k) => v + (t[k] - v) * 0.35);
      const done = next.every((v, k) => Math.abs(t[k] - v) < 0.005);
      const [s, dx] = (drawn.current[i] = done ? t : next);
      moving ||= !done;
      const style = beads.current.get(i)?.style;
      if (s === 1 && dx === 0) style?.removeProperty("transform");
      else style?.setProperty("transform", `translate(${dx}px,0) scale(${s})`);
    });
    frame.current = moving ? requestAnimationFrame(tick) : 0;
  };
  const aimAt = (near: number | null) => {
    if (near === nearest.current) return;
    nearest.current = near;
    aim.current = clusters.map((_, i) => {
      const side = near === null ? 0 : i - near;
      if (near === null || Math.abs(side) > 1) return [1, 0];
      return side === 0 ? [1.5, 0] : [1.08, 3 * side];
    });
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  };
  // Only the nearest bead within reach grows, the same one whose target the mouse is over.
  const magnify = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * width;
    let near: number | null = null;
    clusters.forEach((c, i) => {
      if (Math.abs(c.x - x) < (near === null ? REACH : Math.abs(clusters[near].x - x))) near = i;
    });
    aimAt(near);
  };

  const move = (i: number) => {
    setCursor(i);
    onHover(clusters[i].beat);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const last = clusters.length - 1,
      from = active ?? -1;
    if (last < 0) return;
    if (e.key === "ArrowRight") move(Math.min(last, from + 1));
    else if (e.key === "ArrowLeft") move(Math.max(0, from - 1));
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if ((e.key === "Enter" || e.key === " ") && active !== null) onPin(clusters[active].beat);
    else if (e.key === "Escape" && keyed !== null) {
      setCursor(null);
      onHover(null);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const a = active === null ? null : clusters[active];
  const note = a
    ? annotate(names(a), chapterNameOfBeat(structure, a.beat), width - PLOT.l - PLOT.r)
    : "";
  const half = wordsW(note) / 2;
  // The active bead is drawn last, so when it grows it is never under a neighbor.
  const order = clusters.map((_, i) => i);
  if (active !== null) order.push(...order.splice(active, 1));
  return (
    <svg
      data-ribbon
      viewBox={`0 0 ${width} ${H}`}
      className="block w-full overflow-visible not-focus-visible:outline-none"
      role="listbox"
      aria-orientation="horizontal"
      tabIndex={0}
      aria-label="Story events. Use arrow keys to move between them, Enter to open the passage."
      aria-activedescendant={active === null ? undefined : beadId(active)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (keyed === null) return;
        setCursor(null);
        onHover(null);
      }}
      onPointerMove={magnify}
      onPointerLeave={() => aimAt(null)}
    >
      <line
        x1={PLOT.l}
        x2={width - PLOT.r}
        y1={CY}
        y2={CY}
        stroke="currentColor"
        strokeOpacity={0.15}
      />
      {order.map((i) => {
        const c = clusters[i];
        return (
          <g
            key={i}
            id={beadId(i)}
            role="option"
            aria-selected={i === active}
            aria-posinset={i + 1}
            aria-setsize={clusters.length}
            aria-label={`${spoken(c)}${c.beat === pinned ? ", pinned" : ""}`}
            transform={`translate(${c.x},${CY})`}
            onClick={() => onPin(c.beat)}
          >
            <g
              ref={(el) => {
                if (el) beads.current.set(i, el);
                else beads.current.delete(i);
              }}
              data-bead
              style={{
                transformBox: "fill-box",
                transformOrigin: "50% 100%",
              }}
            >
              <circle
                data-disc
                r={R}
                fill="var(--paper)"
                stroke={i === active ? "var(--mark)" : "var(--rule)"}
                strokeWidth={i === active ? 1.5 : 1}
              />
              <g style={{ color: i === active ? "var(--ink)" : "var(--muted)" }}>
                <GlyphPath type={c.top.type} size={16} />
              </g>
            </g>
          </g>
        );
      })}
      {a && (
        <text
          data-event-note
          x={Math.max(PLOT.l + half, Math.min(width - PLOT.r - half, a.x))}
          y={50}
          textAnchor="middle"
          {...word}
          {...halo}
          fill="var(--ink)"
        >
          {note}
        </text>
      )}
      {clusters.map((c, i) => (
        <rect
          key={i}
          data-hit
          x={spans[i][0]}
          y={0}
          width={spans[i][1] - spans[i][0]}
          height={H}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={() => {
            setCursor(null);
            onHover(c.beat);
          }}
          onMouseLeave={() => onHover(null)}
          onClick={() => onPin(c.beat)}
        />
      ))}
    </svg>
  );
}

export const EventLegend = memo(function EventLegend() {
  const [open, setOpen] = useState(false);
  return (
    // The toggle starts at the plot's left edge, where the beads begin, its 40 px reach drawn by ::after.
    <div className="text-[13.5px] text-[var(--muted)]" style={{ paddingLeft: PLOT.l }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative inline-flex min-h-[24px] items-center text-[var(--muted)] after:absolute after:-inset-y-[8px] after:inset-x-0 after:content-[''] hover:text-[var(--ink)]"
      >
        What the marks mean
      </button>
      {open && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {EVENT_TYPES.map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span style={{ color: "var(--ink)" }}>
                <EventGlyph type={t} size={14} />
              </span>
              {EVENT_NAMES[t]}
            </span>
          ))}
          <span>only confident events are marked; the passage lists the faint ones</span>
        </div>
      )}
    </div>
  );
});
