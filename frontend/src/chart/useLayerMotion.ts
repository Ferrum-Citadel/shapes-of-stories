import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Axis } from "../types";
import { EASE, MOTION, prefersReducedMotion, settle, tweenNumbers } from "../lib/motion";

// A layer switched on draws in from the left under a clip, which keeps its dash pattern; one switched off fades from the line React has just taken away.
export function useLayerWipe(
  plotRef: RefObject<SVGGElement | null>,
  axes: Axis[],
  drawIn: boolean,
) {
  const drawn = useRef<{ axes: Axis[]; lines: Map<Axis, SVGPathElement> }>({
    axes,
    lines: new Map(),
  });
  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const before = drawn.current;
    drawn.current = {
      axes,
      lines: new Map(
        axes.map((ax) => [ax, plot.querySelector<SVGPathElement>(`[data-layer="${ax}"]`)!]),
      ),
    };
    if (drawIn || prefersReducedMotion()) return;
    for (const [ax, line] of drawn.current.lines)
      if (!before.axes.includes(ax))
        line.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], {
          duration: MOTION.draw,
          easing: EASE.draw,
        });
    for (const [ax, old] of before.lines) {
      if (axes.includes(ax)) continue;
      // The fading copy gives up its name, so a line switched straight back on is the one found, wiped and later faded; it fades in its group, which holds its width.
      old.removeAttribute("data-layer");
      const box = old.parentElement ?? old;
      box.querySelector("[data-glow]")?.remove();
      plot.append(box);
      old.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: MOTION.respond,
        easing: EASE.settle,
        fill: "forwards",
      }).onfinish = () => box.remove();
    }
  }, [plotRef, axes, drawIn]);
}

// A change of smoothing morphs every curve, and the pinned ring's height on its line, from one drawing to the other; a live one, from a dragged slider, is drawn at once, since a morph restarted on every move judders.
export function useMorph(
  plotRef: RefObject<SVGGElement | null>,
  smoothing: number,
  curves: Record<string, string>,
  ring: string | null,
  drawIn: boolean,
  live = false,
) {
  const morph = useRef({ smoothing, curves, ring });
  // What a morph cut short had drawn, since React has already written the new drawing by the time the next one starts.
  const drawn = useRef(new Map<Element, string>());
  useLayoutEffect(() => {
    const plot = plotRef.current,
      before = morph.current,
      cut = drawn.current,
      left = new Map<Element, string>();
    morph.current = { smoothing, curves, ring };
    drawn.current = left;
    if (!plot) return;
    const paths = [
      ...plot.querySelectorAll<SVGPathElement>("path[data-layer], path[data-band]"),
    ].map((el) => [el, el.dataset.layer ?? "band"] as const);
    // React rewrites only the curves whose drawing changed, so one a cut-short morph left halfway is put right here; the opening owns the fortune line while it plays.
    for (const [el, k] of paths)
      if (curves[k] !== undefined && !(drawIn && k === "fortune")) el.setAttribute("d", curves[k]);
    const dot = plot.querySelector("[data-pinned] circle");
    if (dot && ring) dot.setAttribute("cy", ring);
    if (before.smoothing === smoothing || drawIn || live || prefersReducedMotion()) return;
    const tween = (el: Element, attr: string, from: string, to: string) =>
      [el, tweenNumbers(el, attr, cut.get(el) ?? from, to, MOTION.reveal, settle)] as const;
    const running = paths
      .filter(([, k]) => before.curves[k] && curves[k])
      .map(([el, k]) => tween(el, "d", before.curves[k], curves[k]));
    if (dot && ring && before.ring) running.push(tween(dot, "cy", before.ring, ring));
    return () => {
      for (const [el, stop] of running) left.set(el, stop());
    };
  }, [plotRef, smoothing, drawIn, live, ring, curves]);
}
