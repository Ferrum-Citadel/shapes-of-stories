import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { prefersReducedMotion } from "../lib/motion";

// Only a first pin from the chart brings the drawer's top row into view, for a mouse only as far as keeps the clicked spot under it, while a finger or the keys get the whole way.
export function useRevealOnPin(pinned: number | null) {
  const row = useRef<HTMLDivElement>(null);
  // How far the pending reveal may scroll, or null when none is pending.
  const reveal = useRef<number | null>(null);
  const mouse = useRef(false);
  const slack = useRef(Infinity);
  useEffect(() => {
    const cap = reveal.current;
    reveal.current = null;
    if (cap === null || pinned === null || !row.current) return;
    // The row comes to rest with 30% of the window under it.
    const top = Math.min(
      row.current.getBoundingClientRect().bottom - window.innerHeight * 0.7,
      cap,
    );
    if (top > 0) window.scrollBy({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [pinned]);
  // Called just before a pin from the chart or the ribbon, with whether the drawer was closed.
  const arm = useCallback((opening: boolean) => {
    reveal.current = opening ? slack.current : null;
  }, []);
  const onPointerDown = useCallback((e: PointerEvent) => {
    mouse.current = e.pointerType === "mouse";
  }, []);
  const onClickCapture = useCallback((e: MouseEvent) => {
    slack.current = mouse.current
      ? (e.target as Element).getBoundingClientRect().bottom - e.clientY - 8
      : Infinity;
  }, []);
  // The allowance lives for one click, so a later pin from the keys is never held to it.
  const onClick = useCallback(() => {
    slack.current = Infinity;
  }, []);
  return { row, arm, onPointerDown, onClickCapture, onClick };
}
