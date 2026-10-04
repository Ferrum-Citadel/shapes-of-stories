import { render, act } from "@testing-library/react";
import ArcChart, { type ArcChartProps } from "../chart/ArcChart";
import {
  advance,
  morphProps,
  openingProps,
  stubAnimate,
  stubPathLength,
  stubReducedMotion,
} from "./fixtures";

const layerProps = (axes: ArcChartProps["axes"]): ArcChartProps => ({ ...openingProps(), axes });

test("a layer switched on is wiped in from the left, and one switched off fades out and is gone", () => {
  const calls = stubAnimate();
  const { container, rerender } = render(<ArcChart {...layerProps(["fortune"])} />);
  expect(calls).toHaveLength(0);
  rerender(<ArcChart {...layerProps(["fortune", "tension"])} />);
  const tension = container.querySelector("path[data-layer=tension]")!;
  expect(calls).toHaveLength(1);
  expect(calls[0].el).toBe(tension);
  expect(calls[0].keyframes).toEqual([
    { clipPath: "inset(0 100% 0 0)" },
    { clipPath: "inset(0 0 0 0)" },
  ]);
  expect(calls[0].options.duration).toBe(400);
  rerender(<ArcChart {...layerProps(["fortune"])} />);
  expect(calls).toHaveLength(2);
  expect(calls[1].el).toBe(tension);
  expect(calls[1].keyframes.at(-1)).toEqual({ opacity: 0 });
  expect(calls[1].options).toMatchObject({ duration: 150, fill: "forwards" });
  expect(tension.isConnected).toBe(true);
  expect(container.querySelector("path[data-layer=tension]")).toBeNull();
  act(() => calls[1].anim.onfinish!());
  expect(tension.isConnected).toBe(false);
});

test("a chip flicked off and on within the fade wipes in the live line, and the next switch-off fades that one", () => {
  const calls = stubAnimate();
  const { container, rerender } = render(<ArcChart {...layerProps(["fortune", "tension"])} />);
  const first = container.querySelector("path[data-layer=tension]")!;
  rerender(<ArcChart {...layerProps(["fortune"])} />);
  rerender(<ArcChart {...layerProps(["fortune", "tension"])} />);
  const live = container.querySelectorAll("path[data-layer=tension]");
  expect(live).toHaveLength(1);
  expect(live[0]).not.toBe(first);
  expect(calls.at(-1)!.el).toBe(live[0]);
  expect(calls.at(-1)!.keyframes[0]).toEqual({ clipPath: "inset(0 100% 0 0)" });
  rerender(<ArcChart {...layerProps(["fortune"])} />);
  expect(calls.at(-1)!.el).toBe(live[0]);
  expect(calls.at(-1)!.keyframes.at(-1)).toEqual({ opacity: 0 });
  expect(live[0].isConnected).toBe(true);
});

test("layers switch at once under reduced motion and while the opening plays", () => {
  const calls = stubAnimate();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  stubPathLength();
  const { rerender } = render(<ArcChart {...layerProps(["fortune"])} drawIn />);
  rerender(<ArcChart {...layerProps(["fortune", "tension"])} drawIn />);
  stubReducedMotion();
  rerender(<ArcChart {...layerProps(["fortune", "tension", "dread"])} />);
  rerender(<ArcChart {...layerProps(["fortune"])} />);
  expect(calls).toHaveLength(0);
});

const curveDs = (c: HTMLElement) =>
  ["path[data-layer=tension]", "path[data-band]"].map((s) => c.querySelector(s)!.getAttribute("d"));

test("moving the smoothing from shape to detail morphs every curve from one to the other", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const detail = curveDs(render(<ArcChart {...morphProps({ smoothing: 0 })} />).container);
  const { container, rerender } = render(<ArcChart {...morphProps()} />);
  const shape = curveDs(container);
  expect(shape).not.toEqual(detail);
  rerender(<ArcChart {...morphProps({ smoothing: 0 })} />);
  expect(curveDs(container)).toEqual(shape);
  advance(110);
  const mid = curveDs(container);
  expect(mid[0]).not.toBe(shape[0]);
  expect(mid[0]).not.toBe(detail[0]);
  advance(200);
  expect(curveDs(container)).toEqual(detail);
});

test("the pinned ring rides the line through a morph, and jumps with it under reduced motion", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const cy = (c: HTMLElement) =>
    Number(c.querySelector("[data-pinned] circle")!.getAttribute("cy"));
  const end = cy(render(<ArcChart {...morphProps({ smoothing: 0, pinned: 1 })} />).container);
  const { container, rerender } = render(<ArcChart {...morphProps({ pinned: 1 })} />);
  const start = cy(container);
  expect(start).not.toBe(end);
  rerender(<ArcChart {...morphProps({ smoothing: 0, pinned: 1 })} />);
  expect(cy(container)).toBe(start);
  advance(110);
  expect(cy(container)).not.toBe(start);
  expect(cy(container)).not.toBe(end);
  advance(200);
  expect(cy(container)).toBe(end);
  stubReducedMotion();
  rerender(<ArcChart {...morphProps({ pinned: 1 })} />);
  expect(cy(container)).toBe(start);
});

test("a smoothing between the ends draws the blend of the two stored curves, band and pinned ring included", () => {
  const between = morphProps({ axes: ["fortune"], smoothing: 0.5, pinned: 1 });
  const f = between.analysis.bins.fortune;
  f.detail = Array.from({ length: 100 }, (_, i) => 2 + Math.sin(i / 5));
  f.band.detail = [f.detail.map((v) => v - 0.6), f.detail.map((v) => v + 0.6)];
  // The same chart at full smoothing, with the blend stored as its shape.
  const blended = morphProps({ axes: ["fortune"], smoothing: 1, pinned: 1 });
  const g = blended.analysis.bins.fortune;
  g.shape = f.shape.map((v, i) => (v + f.detail[i]) / 2);
  g.band.shape = [0, 1].map((k) =>
    f.band.shape[k].map((v, i) => (v + f.band.detail[k][i]) / 2),
  ) as [number[], number[]];
  const drawn = (p: ArcChartProps) => {
    const c = render(<ArcChart {...p} />).container;
    return [
      c.querySelector("path[data-layer=fortune]")!.getAttribute("d"),
      c.querySelector("path[data-band]")!.getAttribute("d"),
      c.querySelector("[data-pinned] circle")!.getAttribute("cy"),
    ];
  };
  const mid = drawn(between);
  expect(mid).toEqual(drawn(blended));
  expect(mid).not.toEqual(drawn({ ...between, smoothing: 1 }));
});

test("a morph cut short by a resize ends on the new drawing, and reduced motion swaps at once", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const narrow = curveDs(
    render(<ArcChart {...morphProps({ smoothing: 0, width: 600 })} />).container,
  );
  const { container, rerender } = render(<ArcChart {...morphProps()} />);
  rerender(<ArcChart {...morphProps({ smoothing: 0 })} />);
  advance(80);
  rerender(<ArcChart {...morphProps({ smoothing: 0, width: 600 })} />);
  advance(400);
  expect(curveDs(container)).toEqual(narrow);
  stubReducedMotion();
  const wide = curveDs(render(<ArcChart {...morphProps({ width: 600 })} />).container);
  rerender(<ArcChart {...morphProps({ width: 600 })} />);
  expect(curveDs(container)).toEqual(wide);
});

test("a smoothing that lands mid-morph starts from the curve as drawn, so a drag never jumps back", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const cy = (c: HTMLElement) => c.querySelector("[data-pinned] circle")!.getAttribute("cy");
  const half = curveDs(render(<ArcChart {...morphProps({ smoothing: 0.5 })} />).container);
  const { container, rerender } = render(<ArcChart {...morphProps({ pinned: 1 })} />);
  rerender(<ArcChart {...morphProps({ smoothing: 0, pinned: 1 })} />);
  advance(80);
  const drawn = curveDs(container),
    ring = cy(container);
  rerender(<ArcChart {...morphProps({ smoothing: 0.5, pinned: 1 })} />);
  expect(curveDs(container)).toEqual(drawn);
  expect(cy(container)).toBe(ring);
  advance(400);
  expect(curveDs(container)).toEqual(half);
});
