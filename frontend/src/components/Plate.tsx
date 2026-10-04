import type { ReactNode } from "react";
import { Link } from "react-router";
import { curveMonotoneX, line } from "d3-shape";
import { linear } from "../lib/scale";
import type { GalleryEntry } from "../types";
import { familyOf } from "../lib/gallery";
import { SHAPE_INFO, SHAPE_Z, matchWords, templateSamples } from "../lib/definitions";
import { zscore } from "../lib/stats";
import { Icon } from "./icons";
import { useTitleTravel } from "../lib/motion";
import { actionPill } from "../lib/ui";

// A plate lifts the same for a mouse and for the keyboard; a press on a touch screen dims it.
const LIFT =
  "press-soft transition-[translate,box-shadow,opacity] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_var(--shadow)] focus-visible:-translate-y-0.5 focus-visible:shadow-[0_8px_20px_var(--shadow)]";

// On the shape card's scale, so a plate and the card draw a work alike.
export function Sketch({
  g,
  w,
  h,
  pad,
  className,
  children,
}: {
  g: GalleryEntry;
  w: number;
  h: number;
  pad: number;
  className: string;
  children?: ReactNode;
}) {
  const x = linear([0, 99], [0, w]);
  const y = linear([...SHAPE_Z], [h - pad, pad]);
  const ln = line<number>()
    .x((_, i) => x(i))
    .y((v) => y(v))
    .curve(curveMonotoneX);
  const tpl = templateSamples(g.archetype);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      {children}
      {tpl && (
        <path
          d={ln(tpl) ?? ""}
          fill="none"
          stroke="var(--ink)"
          strokeOpacity={0.25}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={ln(zscore(g.sparkline)) ?? ""}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.8}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function Plate({ g, to = `/gallery/${g.slug}` }: { g: GalleryEntry; to?: string }) {
  const none = g.archetype.state === "none";
  const leans = g.archetype.state === "leans";
  const words = none ? "" : matchWords(g.archetype);
  const shape = SHAPE_INFO[familyOf(g)].name;
  const travel = useTitleTravel(to);
  return (
    <li>
      <Link
        to={to}
        viewTransition
        aria-label={[g.author ? `${g.title} by ${g.author}` : g.title, shape, words]
          .filter(Boolean)
          .join(", ")}
        className={`block h-full rounded-md border border-[var(--rule)] bg-[var(--paper)] p-3.5 ${LIFT} ${leans ? "border-dashed" : ""}`}
      >
        <Sketch g={g} w={300} h={84} pad={6} className="block h-[84px] w-full">
          {[21, 42, 63].map((v) => (
            <line
              key={v}
              x1="0"
              x2="300"
              y1={v}
              y2={v}
              stroke="currentColor"
              strokeOpacity={0.07}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </Sketch>
        {/* The author spans the label, so a narrow plate does not wrap it word by word. */}
        <div className="hairline mt-2.5 grid grid-cols-[1fr_auto] items-baseline gap-x-2.5 pt-2">
          <div
            className="serif opsz-14 min-w-0 text-[16px] font-medium leading-tight"
            style={travel}
          >
            {g.title}
          </div>
          {words && (
            <i className="serif whitespace-nowrap text-[13.5px] text-[var(--muted)]">{words}</i>
          )}
          <div className="col-span-2 text-[14px] text-[var(--muted)]">{g.author}</div>
        </div>
      </Link>
    </li>
  );
}

export function Invite({ className = "" }: { className?: string }) {
  return (
    <li className={className}>
      <Link
        to="/import"
        viewTransition
        className={`flex h-full min-h-[92px] flex-col justify-center rounded-md border border-dashed border-[var(--rule)] p-3.5 ${LIFT}`}
      >
        <span className={`${actionPill} gap-1 self-start`}>
          Your book here
          <Icon name="chevron" size={12} />
        </span>
        <span className="text-[14px] text-[var(--muted)]">
          any novel, screenplay or transcript · about two cents · a minute
        </span>
      </Link>
    </li>
  );
}
