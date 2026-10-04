import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import type { Axis, EventMarker, Structure } from "../types";
import type { Drivers } from "../lib/bins";
import { AXIS_INFO, EVENT_NAMES } from "../lib/definitions";
import { LAYERS } from "../lib/layers";
import { makeSlicer, paragraphsOf } from "../lib/text";
import { useReadAloud } from "../lib/speech";
import { textButton } from "../lib/ui";
import { EASE, MOTION, prefersReducedMotion } from "../lib/motion";
import { EventGlyph } from "./icons";

const PASSAGE_NOTE = "serif opsz-14 text-[13.5px] italic text-[var(--muted)]";

// A soft 48 px edge on a mask twice the box's height plus the edge, so moving the mask from its foot to its head writes the box from top to bottom.
const MASK = {
  maskImage: "linear-gradient(to bottom, #000 calc(50% - 24px), transparent calc(50% + 24px))",
  maskSize: "100% calc(200% + 48px)",
  maskRepeat: "no-repeat",
};
const SWEEP: Keyframe[] = [
  { ...MASK, maskPosition: "0 100%" },
  { ...MASK, maskPosition: "0 0" },
];

// The sweep starts and ends softly with an even middle, so it reads as a hand writing rather than a reveal.
const WRITE = "cubic-bezier(.3, .1, .3, 1)";

// Writes a passage's text in from the top, longer for a taller box, or fades it in where masks are not drawn.
function sweep(box: HTMLElement): Animation | undefined {
  if (prefersReducedMotion()) return;
  const duration = Math.min(520, 280 + box.clientHeight * 0.4);
  const masks =
    typeof CSS !== "undefined" && CSS.supports("mask-image", "linear-gradient(#000, #000)");
  return box.animate(masks ? SWEEP : { opacity: [0, 1] }, { duration, easing: WRITE });
}

// Said in place of the passage: a text still on its way is null, and one that failed to arrive can be asked for again.
function NoPassage({
  text,
  onRetry,
  textDiscarded,
}: {
  text: string | null;
  onRetry?: () => void;
  textDiscarded?: boolean;
}) {
  if (text === null && onRetry)
    return (
      <p role="status" className={PASSAGE_NOTE}>
        The passage did not load.{" "}
        <button type="button" onClick={onRetry} className={`${textButton} not-italic`}>
          Try again
        </button>
      </p>
    );
  if (text === null)
    return (
      <p role="status" className={PASSAGE_NOTE}>
        Loading the passage…
      </p>
    );
  const why = textDiscarded
    ? "The text was not saved, so the passage cannot be shown."
    : "Passage text lives only on the device that analyzed this work.";
  return <p className={PASSAGE_NOTE}>{why} Scores and chapter are shown instead.</p>;
}

// The faint events appear only here, since the ribbon draws the strong ones alone.
function EventChips({ events }: { events: EventMarker[] }) {
  const sorted = [...events].sort(
    (a, b) => Number(a.strength === "faint") - Number(b.strength === "faint"),
  );
  const set = sorted.map((e) => `${e.type} ${e.strength}`).join();
  const list = useRef<HTMLUListElement>(null);
  const last = useRef(set);
  // Only a passage with other events than the last changes its chips, and they come in as one.
  useLayoutEffect(() => {
    if (last.current === set) return;
    last.current = set;
    if (!prefersReducedMotion())
      list.current?.animate({ opacity: [0, 1] }, { duration: MOTION.respond, easing: EASE.settle });
  }, [set]);
  if (!events.length) return null;
  return (
    <ul ref={list} aria-label="Events in this passage" className="flex flex-wrap gap-1.5">
      {sorted.map((e, i) => (
        <li
          key={i}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] ${e.strength === "faint" ? "opacity-60" : ""}`}
          style={{ borderColor: "var(--rule)" }}
        >
          <EventGlyph type={e.type} size={14} />
          {EVENT_NAMES[e.type]}
          {e.strength === "faint" && <span className="sr-only"> (faint)</span>}
        </li>
      ))}
    </ul>
  );
}

function marksLine(axes: Axis[], drivers: Drivers) {
  const [first, ...rest] = axes;
  const ruled = rest.filter((a) => drivers[a]).map((a) => AXIS_INFO[a].name);
  const parts = [];
  if (drivers[first]) parts.push(`underlined: what moved the ${AXIS_INFO[first].name} line`);
  const rule = ruled.length > 1 ? "rules, left to right" : "rule";
  if (ruled.length)
    parts.push(
      parts.length
        ? `${rule}: ${ruled.join(", ")}`
        : `${rule}: what moved the ${ruled.join(", ")} line${ruled.length > 1 ? "s" : ""}`,
    );
  return parts.join(" · ");
}

// The first drawn layer underlines its span and the others rule the left margin, stacked so two rules on one paragraph both show.
function paragraphLook(axes: Axis[], marks: Axis[], reading: boolean) {
  const edges = [
    ...(reading ? ["var(--mark)"] : []),
    ...marks.filter((a) => a !== axes[0]).map((a) => LAYERS[a].color),
  ];
  const style: CSSProperties = {};
  if (marks.includes(axes[0])) style.textDecorationColor = LAYERS[axes[0]].color;
  if (edges.length)
    style.boxShadow = edges.map((c, k) => `inset ${3 * (k + 1)}px 0 0 ${c}`).join(", ");
  if (reading) style.background = "var(--select)";
  return {
    className: `-ml-3 pl-3 ${marks.includes(axes[0]) ? "underline decoration-2 underline-offset-[3px]" : ""}`,
    style,
  };
}

function ReadAloud({ speech }: { speech: ReturnType<typeof useReadAloud> }) {
  // A voice list that empties mid-reading leaves Stop in place, since the reading goes on.
  if (!speech.supported && speech.state === "idle") return null;
  const label = { idle: "Read aloud", playing: "Pause", paused: "Resume" }[speech.state];
  return (
    <div className="flex shrink-0 gap-3 text-[13.5px]">
      <button type="button" onClick={speech.toggle} className={textButton}>
        {label}
      </button>
      {speech.state !== "idle" && (
        <button type="button" onClick={speech.stop} className={textButton}>
          Stop
        </button>
      )}
    </div>
  );
}

// The text keeps the page's reading measure; the scroll box has a left gutter so the rules sit in it without moving the text.
export default function PassageText({
  beat,
  structure,
  events,
  text,
  textDiscarded,
  onRetry,
  axes,
  drivers,
}: {
  beat: number;
  structure: Structure;
  events: EventMarker[];
  text: string | null;
  textDiscarded?: boolean;
  onRetry?: () => void;
  axes: Axis[];
  drivers: Drivers;
}) {
  const passage = structure.beats[beat];
  const slicer = useMemo(() => (text ? makeSlicer(text) : null), [text]);
  const paras = useMemo(
    () => (slicer ? paragraphsOf(slicer, passage.start_cp, passage.end_cp) : []),
    [slicer, passage.start_cp, passage.end_cp],
  );
  const speech = useReadAloud(paras);
  const box = useRef<HTMLDivElement>(null);
  // Each passage starts at the top of the box and is written in afresh, cutting short the one before.
  useLayoutEffect(() => {
    const b = box.current;
    if (!b) return;
    b.scrollTop = 0;
    const run = sweep(b);
    return () => run?.cancel();
  }, [paras]);
  useEffect(() => {
    if (speech.index === null) return;
    const b = box.current;
    const p = b?.children[speech.index] as HTMLElement | undefined;
    // The box scrolls on its own, never the page, which on a phone would jump away from the controls.
    if (
      b &&
      p &&
      (p.offsetTop < b.scrollTop || p.offsetTop + p.offsetHeight > b.scrollTop + b.clientHeight)
    )
      b.scrollTop = p.offsetTop;
  }, [speech.index]);
  const spans = axes.flatMap((a) => (drivers[a] ? [[a, drivers[a]] as const] : []));
  const line = paras.length ? marksLine(axes, drivers) : "";
  return (
    <div className="max-w-[40rem] max-sm:mt-3">
      {/* Read aloud keeps the row's right edge, so chips of another width wrap beside it and never move it. */}
      <div className="mb-1.5 flex items-start gap-x-3">
        <div className="flex min-h-[40px] min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="label">The passage</span>
          <EventChips events={events} />
        </div>
        {paras.length > 0 && <ReadAloud speech={speech} />}
      </div>
      {line && <p className="mb-1.5 text-[13px] text-[var(--muted)]">{line}</p>}
      {paras.length ? (
        <div
          ref={box}
          className="serif opsz-14 relative -ml-3 max-h-[70vh] space-y-2 overflow-auto pb-2 pl-3 text-[15.5px] leading-[1.55]"
        >
          {paras.map((p, i) => {
            const marks = spans.filter(([, [lo, hi]]) => i >= lo && i <= hi).map(([a]) => a);
            const reading = speech.index === i;
            return (
              <p
                key={i}
                data-driver={marks.length ? marks.join(" ") : undefined}
                data-reading={reading ? "true" : undefined}
                {...paragraphLook(axes, marks, reading)}
              >
                {marks.map((a) => (
                  <span key={a} className="sr-only">
                    what moved the {AXIS_INFO[a].name} line:{" "}
                  </span>
                ))}
                {p}
              </p>
            );
          })}
        </div>
      ) : (
        <NoPassage text={text} onRetry={onRetry} textDiscarded={textDiscarded} />
      )}
    </div>
  );
}
