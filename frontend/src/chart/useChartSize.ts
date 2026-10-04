import { useLayoutEffect, useState, type RefObject } from "react";
import { PLOT } from "./ChartFrame";

// One unit of the drawing is one CSS pixel, so its text keeps the size it is set in on every screen; the height grows more slowly than the width,
// and on a phone held sideways it leaves room on the screen for the marks and the passage below.
export function chartSize(
  measured: number,
  screenHeight = Infinity,
): { width: number; height: number } {
  const width = Math.round(Math.min(1200, Math.max(280, measured)));
  return {
    width,
    height: Math.round(Math.min(140 + width / 5, Math.max(200, screenHeight * 0.6))),
  };
}

// Follows the width of the chart's box from before the first paint, and reads the screen's height only when that width changes, so a phone's address bar sliding away never resizes the chart under a finger.
export function useChartSize(box: RefObject<HTMLElement | null>): {
  width: number;
  height: number;
} {
  const [measured, setMeasured] = useState({ width: PLOT.width, screen: Infinity });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // A change under 4 px is a scrollbar coming or going, and redrawing for it could bring the scrollbar back and forth for ever.
    const take = (w: number) => {
      if (w > 0)
        setMeasured((m) =>
          Math.abs(Math.round(w) - m.width) < 4 && m.screen !== Infinity
            ? m
            : { width: Math.round(w), screen: window.innerHeight },
        );
    };
    take(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(([entry]) => take(entry.contentRect.width));
    watch.observe(el);
    return () => watch.disconnect();
  }, [box]);
  return chartSize(measured.width, measured.screen);
}
