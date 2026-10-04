import { render, act } from "@testing-library/react";
import ArcChart, { type ArcChartProps } from "../chart/ArcChart";
import { advance, fakeStructure, morphProps, stubAnimate, stubReducedMotion } from "./fixtures";

// What the chart marks for the shown and the pinned passage, as numbers.
const marks = (c: HTMLElement) => {
  const n = (sel: string, attr: string) => Number(c.querySelector(sel)?.getAttribute(attr));
  return {
    x: n("rect[data-shown]", "x"),
    width: n("rect[data-shown]", "width"),
    x1: n("[data-pinned] line", "x1"),
    x2: n("[data-pinned] line", "x2"),
    cx: n("[data-pinned] circle", "cx"),
    cy: n("[data-pinned] circle", "cy"),
  };
};
// At full detail the ring sits on a wavy line, so its height differs from passage to passage.
const pinnedAt = (i: number | null) => morphProps({ pinned: i, shown: i, smoothing: 0 });

test("pinning another passage glides the column, the pin line and its ring there", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const to = marks(render(<ArcChart {...pinnedAt(2)} />).container);
  const { container, rerender } = render(<ArcChart {...pinnedAt(0)} />);
  const from = marks(container);
  for (const k of ["x", "x1", "cx", "cy"] as const) expect(from[k]).not.toBe(to[k]);
  rerender(<ArcChart {...pinnedAt(2)} />);
  expect(marks(container)).toEqual(from);
  advance(60);
  const mid = marks(container);
  expect(mid.x).toBeGreaterThan(from.x);
  expect(mid.x).toBeLessThan(to.x);
  expect(mid.x1).toBe(mid.x2);
  expect(mid.cx).toBe(mid.x1);
  advance(300);
  expect(marks(container)).toEqual(to);
});

test("a glide cut short by another pin carries on from where the marks are", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const last = marks(render(<ArcChart {...pinnedAt(1)} />).container);
  const { container, rerender } = render(<ArcChart {...pinnedAt(0)} />);
  rerender(<ArcChart {...pinnedAt(3)} />);
  advance(60);
  const mid = marks(container);
  rerender(<ArcChart {...pinnedAt(1)} />);
  expect(marks(container)).toEqual(mid);
  advance(300);
  expect(marks(container)).toEqual(last);
});

test("an unpin in the middle of a glide puts the column straight onto the passage shown", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const hovered = morphProps({ shown: 2, pinned: null, smoothing: 0 });
  const to = marks(render(<ArcChart {...hovered} />).container);
  const { container, rerender } = render(<ArcChart {...pinnedAt(0)} />);
  rerender(<ArcChart {...pinnedAt(2)} />);
  advance(60);
  expect(marks(container).x).not.toBe(to.x);
  rerender(<ArcChart {...hovered} />);
  expect(marks(container).x).toBe(to.x);
  expect(marks(container).width).toBe(to.width);
  advance(300);
  expect(marks(container).x).toBe(to.x);
});

test("a first pin, an unpin, a hover and anything under reduced motion move the marks at once", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const at = (p: ArcChartProps) => marks(render(<ArcChart {...p} />).container);
  const { container, rerender } = render(<ArcChart {...morphProps({ shown: 0 })} />);
  rerender(<ArcChart {...morphProps({ shown: 3 })} />);
  expect(marks(container).x).toBe(at(morphProps({ shown: 3 })).x);
  rerender(<ArcChart {...pinnedAt(1)} />);
  expect(marks(container)).toEqual(at(pinnedAt(1)));
  rerender(<ArcChart {...pinnedAt(null)} />);
  expect(container.querySelector("[data-pinned]")).toBeNull();
  rerender(<ArcChart {...pinnedAt(0)} />);
  stubReducedMotion();
  rerender(<ArcChart {...pinnedAt(3)} />);
  expect(marks(container)).toEqual(at(pinnedAt(3)));
});

test("the pinned note crossfades: the old one fades out and goes while the new one fades in", () => {
  const calls = stubAnimate();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const { container, rerender } = render(<ArcChart {...pinnedAt(0)} />);
  const old = container.querySelector("[data-annotation]")!.textContent;
  rerender(<ArcChart {...pinnedAt(2)} />);
  const live = container.querySelector("[data-annotation]")!;
  expect(live.textContent).not.toBe(old);
  const ghost = calls.find((c) => c.el !== live)!;
  expect(ghost.el.textContent).toBe(old);
  expect(ghost.el.hasAttribute("data-annotation")).toBe(false);
  expect(ghost.keyframes.at(-1)).toEqual({ opacity: 0 });
  expect(calls.find((c) => c.el === live)!.keyframes[0]).toEqual({ opacity: 0 });
  act(() => ghost.anim.onfinish!());
  expect(ghost.el.isConnected).toBe(false);
});

test("the fading note is the one last drawn, even after a chip hover moved it down a line", () => {
  const calls = stubAnimate();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const s = fakeStructure(40, 4);
  const props = (pinned: number, focusAxis: ArcChartProps["focusAxis"]) => ({
    ...morphProps({ structure: s, axes: ["fortune", "tension"], pinned, shown: pinned }),
    focusAxis,
  });
  const y = (p: ArcChartProps) =>
    render(<ArcChart {...p} />)
      .container.querySelector("[data-annotation]")!
      .getAttribute("y");
  // A passage whose note sits on a different line for each layer's corner words.
  const beat = Array.from({ length: 40 }, (_, i) => i).find(
    (i) => y(props(i, "fortune")) !== y(props(i, "tension")),
  )!;
  expect(beat).toBeDefined();
  const { container, rerender } = render(<ArcChart {...props(beat, "fortune")} />);
  rerender(<ArcChart {...props(beat, "tension")} />);
  const moved = container.querySelector("[data-annotation]")!.getAttribute("y");
  rerender(<ArcChart {...props(beat > 20 ? 0 : 39, "tension")} />);
  const live = container.querySelector("[data-annotation]");
  expect(calls.find((c) => c.el !== live)!.el.getAttribute("y")).toBe(moved);
});
