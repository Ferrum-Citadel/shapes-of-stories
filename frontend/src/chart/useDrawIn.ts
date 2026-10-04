import { useLayoutEffect, useRef } from "react";
import { MOTION, easeInOut, prefersReducedMotion, tweenNumbers } from "../lib/motion";

// Chalk stroke first, then the sketch settles into the measured line; the caller turns enabled off from onDone, or a change of toD replays the opening.
export function useDrawIn(
  ref: React.RefObject<SVGPathElement | null>,
  fromD: string | null,
  toD: string,
  enabled: boolean,
  onDone?: () => void,
) {
  // The run started under one onDone reports to whichever the caller passes last; set before the effect below reads it.
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });
  // A layout effect, so the finished line is never painted for a frame before the chalk stroke starts.
  useLayoutEffect(() => {
    const el = ref.current;
    // React rewrites d only when the prop changes, so an interrupted run is resynced here.
    if (!enabled || !el || !fromD || !toD || prefersReducedMotion()) {
      el?.setAttribute("d", toD);
      if (enabled) done.current?.();
      return;
    }
    el.setAttribute("d", fromD);
    const length = el.getTotalLength();
    el.style.strokeDasharray = `${length}`;
    el.style.strokeDashoffset = `${length}`;
    let raf = 0,
      start = -1,
      stopSettle: (() => void) | null = null;
    const tick = (now: number) => {
      // Time runs from the first frame drawn, so a slow first paint does not eat the stroke.
      if (start < 0) start = now;
      const t = now - start;
      if (t < MOTION.stroke) {
        el.style.strokeDashoffset = `${length * (1 - easeInOut(t / MOTION.stroke))}`;
        raf = requestAnimationFrame(tick);
        return;
      }
      el.style.strokeDashoffset = "0";
      el.style.strokeDasharray = "";
      stopSettle = tweenNumbers(el, "d", fromD, toD, MOTION.settle, easeInOut, () =>
        done.current?.(),
      );
    };
    // The opening is the one motion meant to be watched, so it waits until half the chart is on screen; a browser may round that half down a hair.
    const watch =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (es) => {
              if (es.some((e) => e.isIntersecting && e.intersectionRatio >= 0.49)) {
                watch!.disconnect();
                raf = requestAnimationFrame(tick);
              }
            },
            { threshold: 0.5 },
          )
        : null;
    if (watch) watch.observe(el.ownerSVGElement ?? el);
    else raf = requestAnimationFrame(tick);
    return () => {
      watch?.disconnect();
      cancelAnimationFrame(raf);
      stopSettle?.();
      el.style.strokeDasharray = "";
      el.style.strokeDashoffset = "";
    };
  }, [ref, enabled, fromD, toD]);
}
