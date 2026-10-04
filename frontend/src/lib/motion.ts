import { useLayoutEffect, type CSSProperties } from "react";
import { useViewTransitionState } from "react-router";
import { matches } from "./ui";

// A work's title carries the shared name only while a page transition leaves or enters `path`, since the browser skips a transition that finds one name twice.
export function useTitleTravel(path: string): CSSProperties | undefined {
  return useViewTransitionState(path) ? { viewTransitionName: "work-title" } : undefined;
}

// The work page being left, kept only through the commit that removes it, so only a wall drawn in that same commit sees it.
let leaving: string | undefined;
export function useLeaveMark(path: string) {
  useLayoutEffect(
    () => () => {
      leaving = path;
      queueMicrotask(() => (leaving = undefined));
    },
    [path],
  );
}
export const justLeft = () => leaving;

export const prefersReducedMotion = () => matches("(prefers-reduced-motion: reduce)");

// The durations in index.css, in milliseconds, for the motions script drives; the opening's settle is script's alone.
export const MOTION = { respond: 150, reveal: 220, draw: 400, stroke: 600, settle: 700 } as const;
export const EASE = {
  settle: "cubic-bezier(.2, .8, .2, 1)",
  draw: "cubic-bezier(.45, 0, .55, 1)",
} as const;

// The settle easing as a function of time, so the motions script drives start as quickly as the ones CSS drives.
export function settle(u: number): number {
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (at(0.2, 0.2, mid) < u) lo = mid;
    else hi = mid;
  }
  return at(0.8, 1, (lo + hi) / 2);
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const NUMBER = /-?\d*\.?\d+(?:e-?\d+)?/g;

// Moves the numbers of an attribute, a path's drawing or a ring's height, from one value to another of the same form, and returns how to stop it, which tells the value last drawn; any other pair is swapped at once.
export function tweenNumbers(
  el: Element,
  attr: string,
  fromD: string,
  toD: string,
  ms: number,
  easing: (u: number) => number,
  onDone?: () => void,
): () => string {
  return tween((d) => el.setAttribute(attr, d), fromD, toD, ms, easing, onDone);
}

// The same for a style property in pixels, such as the drawer's height while its content changes.
export function tweenStyle(
  el: HTMLElement,
  prop: string,
  from: number,
  to: number,
  ms: number,
  onDone?: () => void,
): () => string {
  return tween((v) => el.style.setProperty(prop, v), `${from}px`, `${to}px`, ms, settle, onDone);
}

// The same for numbers drawn by hand together, such as a score bar's fill, its range and the number beside it.
export function tweenValues(
  from: number[],
  to: number[],
  ms: number,
  draw: (v: number[]) => void,
): () => number[] {
  const values = (d: string) => d.split(" ").map(Number);
  const stop = tween((d) => draw(values(d)), from.join(" "), to.join(" "), ms, settle);
  return () => values(stop());
}

function tween(
  set: (d: string) => void,
  fromD: string,
  toD: string,
  ms: number,
  easing: (u: number) => number,
  onDone?: () => void,
): () => string {
  const from = fromD.match(NUMBER)?.map(Number),
    to = toD.match(NUMBER)?.map(Number);
  if (
    !from ||
    !to ||
    from.length !== to.length ||
    fromD.replace(NUMBER, "") !== toD.replace(NUMBER, "")
  ) {
    set(toD);
    onDone?.();
    return () => toD;
  }
  let drawn = fromD;
  const draw = (d: string) => {
    drawn = d;
    set(d);
  };
  const frame = (k: number) => {
    let i = 0;
    draw(
      toD.replace(NUMBER, () => {
        const v = from[i] + (to[i] - from[i]) * k;
        i++;
        return String(Math.round(v * 1000) / 1000);
      }),
    );
  };
  let raf = 0,
    start = -1;
  const tick = (now: number) => {
    if (start < 0) start = now;
    const u = Math.min(1, (now - start) / ms);
    if (u < 1) {
      frame(easing(u));
      raf = requestAnimationFrame(tick);
    } else {
      draw(toD);
      onDone?.();
    }
  };
  draw(fromD);
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    return drawn;
  };
}
