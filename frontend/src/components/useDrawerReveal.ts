import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { MOTION, prefersReducedMotion, tweenStyle } from "../lib/motion";

function release(el: HTMLElement) {
  el.style.height = "";
  el.style.overflowY = "";
}

// The next passage is laid out in the same commit that drops the last, so the box glides from the height it had to the new one; a step mid-glide starts from where the glide got to.
export function useDrawerReveal(beat: number, ref: RefObject<HTMLElement | null>) {
  // The box's own height as last laid out, null until the first.
  const last = useRef<number | null>(null);
  // Stops the running glide and leaves the box where it is.
  const glide = useRef<(() => void) | null>(null);
  // Before paint, so the new content is never drawn at its own height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h0 = el.style.height ? el.offsetHeight : last.current;
    glide.current?.();
    glide.current = null;
    release(el);
    if (h0 === null || prefersReducedMotion()) return;
    const h1 = el.offsetHeight;
    if (Math.abs(h1 - h0) < 1) return;
    // Clipped only top to bottom, so the rules in the text's left margin stay whole.
    el.style.overflowY = "clip";
    glide.current = tweenStyle(el, "height", h0, h1, MOTION.reveal, () => {
      release(el);
      // Recorded here too, since a fast screen may end the glide before the resize watch sees it.
      last.current = el.offsetHeight;
      glide.current = null;
    });
  }, [beat, ref]);
  // After every commit, and on any resize between them, such as a turned phone or a text that arrived.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !el.style.height) last.current = el.offsetHeight;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      if (!el.style.height) last.current = el.offsetHeight;
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref]);
  useEffect(() => () => glide.current?.(), []);
}
