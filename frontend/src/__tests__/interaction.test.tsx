import { render, fireEvent } from "@testing-library/react";
import ArcChart, { type ArcChartProps } from "../chart/ArcChart";
import { PLOT, yOf } from "../chart/ChartFrame";
import { advance, fakeAnalysis, fakeStructure, stubMedia } from "./fixtures";

// Fortune runs low and tension high, so the pointer can be near one line and far from the other.
function props(p: Partial<ArcChartProps> = {}): ArcChartProps {
  const a = fakeAnalysis();
  a.bins.fortune.shape = Array(100).fill(1);
  a.bins.tension.shape = Array(100).fill(3);
  a.bins.tension.detail = Array.from({ length: 100 }, (_, i) => 2 + Math.sin(i / 5));
  return {
    analysis: a,
    structure: fakeStructure(),
    axes: ["fortune", "tension"],
    smoothing: 1,
    showBand: true,
    showRaw: false,
    shown: null,
    pinned: null,
    onHover: () => {},
    onPin: () => {},
    ...p,
  };
}

// The overlay covers the plot one to one, so a client y is a drawing y less the plot's top.
function overlayOf(c: HTMLElement) {
  const { width, height, l, r, t, b } = PLOT;
  const overlay = c.querySelector("[data-overlay]")!;
  overlay.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: width - l - r, height: height - t - b }) as DOMRect;
  return (x: number, y: number) => fireEvent.mouseMove(overlay, { clientX: x, clientY: y - t });
}

const group = (c: HTMLElement, ax: string) =>
  c.querySelector(`path[data-layer=${ax}]`)!.parentElement!;

test("a hovered passage's column is lighter than the pinned one's", () => {
  const { container, rerender } = render(<ArcChart {...props({ shown: 3, pinned: 1 })} />);
  expect(container.querySelector("rect[data-shown]")).toHaveAttribute("fill-opacity", "0.6");
  expect(container.querySelector("[data-pinned]")).not.toBeNull();
  rerender(<ArcChart {...props({ shown: 1, pinned: 1 })} />);
  expect(container.querySelector("rect[data-shown]")).not.toHaveAttribute("fill-opacity");
});

test("the pointer within 10 px of a line reports that layer, once, and nothing beyond", () => {
  const onLineHover = vi.fn();
  const { container } = render(<ArcChart {...props({ onLineHover })} />);
  const move = overlayOf(container);
  move(400, yOf(1) + 7);
  expect(onLineHover).toHaveBeenLastCalledWith("fortune");
  move(410, yOf(1) - 5);
  expect(onLineHover).toHaveBeenCalledTimes(1);
  move(400, yOf(1) + 17);
  expect(onLineHover).toHaveBeenLastCalledWith(null);
  move(400, yOf(3) - 9);
  expect(onLineHover).toHaveBeenLastCalledWith("tension");
  fireEvent.mouseLeave(container.querySelector("[data-overlay]")!);
  expect(onLineHover).toHaveBeenLastCalledWith(null);
  expect(onLineHover).toHaveBeenCalledTimes(4);
});

test("the line under the pointer is the one at the smoothing drawn", () => {
  const onLineHover = vi.fn();
  const { container } = render(<ArcChart {...props({ onLineHover, smoothing: 0 })} />);
  // At full detail tension at bin 24 is about 1, where the shape draws fortune.
  const at = (24 / 99) * (PLOT.width - PLOT.l - PLOT.r);
  overlayOf(container)(at, yOf(2 + Math.sin(24 / 5)) + 3);
  expect(onLineHover).toHaveBeenLastCalledWith("tension");
});

test("between two bins the hit follows the line drawn between them, not the nearer bin", () => {
  const onLineHover = vi.fn();
  const p = props({ onLineHover });
  p.analysis.bins.tension.shape = Array.from({ length: 100 }, (_, i) => (i % 2 ? 4 : 0));
  const { container } = render(<ArcChart {...p} />);
  // Halfway from bin 24 (at 0) to bin 25 (at 4) the line is at 2; bin 25 alone would put it at 4.
  overlayOf(container)((24.5 / 99) * (PLOT.width - PLOT.l - PLOT.r), yOf(2));
  expect(onLineHover).toHaveBeenLastCalledWith("tension");
});

test("a touch screen reports no line and draws no highlight", () => {
  stubMedia("(pointer: coarse)");
  const onLineHover = vi.fn();
  const { container } = render(<ArcChart {...props({ onLineHover, highlight: "tension" })} />);
  overlayOf(container)(400, yOf(1));
  expect(onLineHover).not.toHaveBeenCalled();
  expect(group(container, "fortune")).toHaveAttribute("opacity", "1");
});

test("the highlighted line widens by 0.8 and the others drop to 55 %", () => {
  const { container, rerender } = render(<ArcChart {...props({ highlight: "tension" })} />);
  expect(group(container, "tension")).toHaveAttribute("stroke-width", "2.6");
  expect(group(container, "tension")).toHaveAttribute("opacity", "1");
  expect(group(container, "fortune")).toHaveAttribute("stroke-width", "2.4");
  expect(group(container, "fortune")).toHaveAttribute("opacity", "0.55");
  expect(group(container, "fortune").style.transition).toMatch(/opacity.*stroke-width/);
  rerender(<ArcChart {...props({ highlight: null })} />);
  expect(group(container, "tension")).toHaveAttribute("stroke-width", "1.8");
  expect(group(container, "fortune")).toHaveAttribute("opacity", "1");
  // A chip whose layer is not drawn highlights nothing.
  rerender(<ArcChart {...props({ highlight: "dread" })} />);
  expect(group(container, "fortune")).toHaveAttribute("opacity", "1");
});

test("the fortune line glows only when it is highlighted with the band shown", () => {
  const glow = (p: Partial<ArcChartProps>) =>
    render(<ArcChart {...props(p)} />).container.querySelector("[data-glow]")!;
  const on = glow({ highlight: "fortune" });
  expect(on).toHaveAttribute("opacity", "0.18");
  expect(on).toHaveAttribute("stroke-width", "6");
  expect(on.getAttribute("href")).toBe(`#${on.parentElement!.querySelector("path")!.id}`);
  expect(glow({ highlight: "fortune", showBand: false })).toHaveAttribute("opacity", "0");
  expect(glow({ highlight: "tension" })).toHaveAttribute("opacity", "0");
  expect(glow({ highlight: null })).toHaveAttribute("opacity", "0");
});

test("a first pin's note says Escape releases it", () => {
  const { container, rerender } = render(<ArcChart {...props({ pinned: 2, hint: true })} />);
  expect(container.querySelector("[data-annotation]")!.textContent).toMatch(
    /pinned · Esc releases$/,
  );
  rerender(<ArcChart {...props({ pinned: 2 })} />);
  expect(container.querySelector("[data-annotation]")!.textContent).toMatch(/pinned$/);
});

const tension = (c: HTMLElement) => c.querySelector("path[data-layer=tension]")!.getAttribute("d");

test("a live smoothing draws the new curves at once, and a settled one morphs to them", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const detail = tension(render(<ArcChart {...props({ smoothing: 0 })} />).container);
  const { container, rerender } = render(<ArcChart {...props()} />);
  const shape = tension(container);
  rerender(<ArcChart {...props({ smoothing: 0, live: true })} />);
  expect(tension(container)).toBe(detail);
  advance(110);
  expect(tension(container)).toBe(detail);
  rerender(<ArcChart {...props({ smoothing: 1, live: false })} />);
  advance(110);
  expect(tension(container)).not.toBe(detail);
  expect(tension(container)).not.toBe(shape);
  advance(300);
  expect(tension(container)).toBe(shape);
});

test("a drag released where it rests settles without a morph, on the drawing it reached", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const target = tension(render(<ArcChart {...props({ smoothing: 0.3 })} />).container);
  const { container, rerender } = render(<ArcChart {...props()} />);
  rerender(<ArcChart {...props({ smoothing: 0.3, live: true })} />);
  expect(tension(container)).toBe(target);
  rerender(<ArcChart {...props({ smoothing: 0.3, live: false })} />);
  expect(tension(container)).toBe(target);
  advance(60);
  expect(tension(container)).toBe(target);
  advance(400);
  expect(tension(container)).toBe(target);
});
