import { useLayoutEffect, useRef, type RefObject } from "react";
import { EASE, MOTION, prefersReducedMotion, settle, tweenNumbers } from "../lib/motion";

type Marks = readonly (readonly [string, string])[];
// The marks that glide: the column's left and width, and the pin line's two ends and the ring's center.
const COLUMN: Marks = [
  ["rect[data-shown]", "x"],
  ["rect[data-shown]", "width"],
];
const PIN: Marks = [
  ["[data-pinned] line", "x1"],
  ["[data-pinned] line", "x2"],
  ["[data-pinned] circle", "cx"],
  ["[data-pinned] circle", "cy"],
];

// React rewrites only what changed, so marks a glide cut short are put right first, all but the ring's height, which belongs to the morph; then they glide from where they were, when asked to.
function place(plot: Element, marks: Marks, from: string[], to: string[], glide: boolean) {
  const els = marks.map(([sel]) => plot.querySelector(sel));
  els.forEach((el, i) => {
    if (marks[i][1] !== "cy") el?.setAttribute(marks[i][1], to[i]);
  });
  if (!glide || prefersReducedMotion()) return null;
  const stops = els.map((el, i) =>
    el ? tweenNumbers(el, marks[i][1], from[i], to[i], MOTION.reveal, settle) : () => to[i],
  );
  return () => stops.map((stop) => stop());
}

// Pinning another passage while one is pinned glides the pin line and its ring there, and the column when it marks the pinned passage, and crossfades the note; a first pin, an unpin and a hover stay instant, and a hover never cuts a glide short.
export function useSelectionMotion(
  plotRef: RefObject<SVGGElement | null>,
  column: { x: number; width: number } | null,
  columnPinned: boolean,
  pin: { beat: number; cx: number; cy: number; y: number } | null,
) {
  const lastColumn = useRef<{ beat: number | null; values: string[] }>({ beat: null, values: [] });
  const last = useRef<{ beat: number | null; values: string[]; note: Element | null }>({
    beat: null,
    values: [],
    note: null,
  });
  const { x = 0, width = 0 } = column ?? {};
  const { beat = null, cx = 0, cy = 0, y: noteY = 0 } = pin ?? {};
  const columnBeat = column && columnPinned ? beat : null;
  useLayoutEffect(() => {
    const plot = plotRef.current,
      before = lastColumn.current;
    const now = { beat: columnBeat, values: [x, width].map(String) };
    lastColumn.current = now;
    if (!plot) return;
    const glide = columnBeat !== null && before.beat !== null && before.beat !== columnBeat;
    const stop = place(plot, COLUMN, before.values, now.values, glide);
    return () => {
      if (stop) now.values = stop();
    };
  }, [plotRef, columnBeat, x, width]);
  useLayoutEffect(() => {
    const plot = plotRef.current,
      before = last.current;
    const values = [cx, cx, cx, cy].map(String);
    // The note is copied on every change of its place, so the copy that fades out is the one last drawn.
    const note = plot?.parentElement?.querySelector("[data-annotation]") ?? null;
    const now = { beat, values, note: (note?.cloneNode(true) as Element | undefined) ?? null };
    last.current = now;
    if (!plot) return;
    const glide = beat !== null && before.beat !== null && before.beat !== beat;
    const stop = place(plot, PIN, before.values, values, glide);
    const ghost = before.note;
    if (stop && note && ghost) {
      ghost.removeAttribute("data-annotation");
      note.before(ghost);
      const fade = { duration: MOTION.reveal, easing: EASE.settle };
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], { ...fade, fill: "forwards" }).onfinish =
        () => ghost.remove();
      note.animate([{ opacity: 0 }, { opacity: 1 }], fade);
    }
    return () => {
      if (stop) now.values = stop();
    };
  }, [plotRef, beat, cx, cy, noteY]);
}
