import { useState } from "react";
import { render, renderHook, act } from "@testing-library/react";
import ArcChart, { type ArcChartProps } from "../chart/ArcChart";
import { PLOT } from "../chart/ChartFrame";
import { useDrawIn } from "../chart/useDrawIn";
import { advance, openingProps, stubPathLength, stubReducedMotion } from "./fixtures";

test("an opening with no line to end on finishes at once instead of throwing", () => {
  stubPathLength();
  const el = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
  const onDone = vi.fn();
  renderHook(() => useDrawIn({ current: el }, "M0,0 L10,10", "", true, onDone));
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(el.getAttribute("d")).toBe("");
});

test("the opening reports to the newest onDone, not the one it started with", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  stubPathLength();
  const el = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
  const first = vi.fn(),
    second = vi.fn();
  const { rerender } = renderHook(
    ({ done }) => useDrawIn({ current: el }, "M0,0 L10,10", "M0,5 L10,5", true, done),
    { initialProps: { done: first } },
  );
  rerender({ done: second });
  advance(1500);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

// A stand-in observer that reports only when the test says how much of the chart is on screen.
function stubObserver() {
  const seen: {
    cb: IntersectionObserverCallback;
    targets: Element[];
    options?: IntersectionObserverInit;
  }[] = [];
  class Stub {
    constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      seen.push({ cb, targets: [], options });
    }
    observe(t: Element) {
      seen.at(-1)!.targets.push(t);
    }
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", Stub);
  const show = (ratio: number) =>
    act(() => {
      for (const o of seen)
        o.cb(
          o.targets.map(
            (target) =>
              ({
                target,
                isIntersecting: ratio > 0,
                intersectionRatio: ratio,
              }) as IntersectionObserverEntry,
          ),
          o as unknown as IntersectionObserver,
        );
    });
  return { seen, show };
}

test("the opening waits, its line hidden, until half the chart is on screen", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  stubPathLength();
  const io = stubObserver();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    el = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
  svg.append(el);
  const onDone = vi.fn();
  renderHook(() => useDrawIn({ current: el }, "M0,0 L10,10", "M0,5 L10,5", true, onDone));
  expect(io.seen[0].targets).toEqual([svg]);
  expect(el.style.strokeDashoffset).toBe("1000");
  io.show(0.2);
  advance(3000);
  expect(onDone).not.toHaveBeenCalled();
  expect(el.style.strokeDashoffset).toBe("1000");
  io.show(0.5);
  advance(1500);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(el.getAttribute("d")).toBe("M0,5 L10,5");
});

test("the opening's clock starts on its first frame, so a slow first paint does not eat the stroke", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  stubPathLength();
  const el = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
  renderHook(() => useDrawIn({ current: el }, "M0,0 L10,10", "M0,5 L10,5", true));
  frames.shift()!(performance.now() + 400);
  expect(el.style.strokeDashoffset).toBe("1000");
});

const fortuneD = (c: HTMLElement) => c.querySelector("path[data-layer=fortune]")!.getAttribute("d");

test("the opening stroke never writes NaN, ends on the static line and reports once", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  stubPathLength();
  const still = fortuneD(render(<ArcChart {...openingProps()} />).container);
  const onDrawn = vi.fn();
  const { container } = render(<ArcChart {...openingProps()} drawIn onDrawn={onDrawn} />);
  const seen: (string | null)[] = [];
  for (let ms = 0; ms < 1500; ms += 16) {
    advance(16);
    seen.push(fortuneD(container));
  }
  expect(seen[0]).not.toBe(still);
  expect(seen.filter((d) => d?.includes("NaN"))).toEqual([]);
  expect(fortuneD(container)).toBe(still);
  expect(onDrawn).toHaveBeenCalledTimes(1);
});

test("on a nearly flat book the chalk sketch is still tall enough to read as its shape", () => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  stubPathLength();
  const p = openingProps();
  p.analysis.bins.fortune.shape = Array.from(
    { length: 100 },
    (_, i) => 2 + 0.01 * Math.sin(i / 10),
  );
  const ys = fortuneD(render(<ArcChart {...p} drawIn />).container)!
    .match(/,(-?[\d.]+)/g)!
    .map((v) => Number(v.slice(1)));
  // A tenth of the plot's height at the least.
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan((PLOT.height - PLOT.t - PLOT.b) / 10);
});

test("an opening interrupted mid-stroke returns to the static line with no dash left behind", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  stubPathLength();
  const still = fortuneD(render(<ArcChart {...openingProps()} />).container);
  const { container, rerender } = render(<ArcChart {...openingProps()} drawIn />);
  advance(300);
  rerender(<ArcChart {...openingProps()} drawIn={false} />);
  const p = container.querySelector("path[data-layer=fortune]") as SVGPathElement;
  expect(p.getAttribute("d")).toBe(still);
  expect(p.style.strokeDasharray).toBe("");
});

test("under reduced motion the opening is skipped: onDrawn fires and the line is the static one", () => {
  stubReducedMotion();
  const still = fortuneD(render(<ArcChart {...openingProps()} />).container);
  const onDrawn = vi.fn();
  const { container } = render(<ArcChart {...openingProps()} drawIn onDrawn={onDrawn} />);
  expect(onDrawn).toHaveBeenCalledTimes(1);
  expect(fortuneD(container)).toBe(still);
});

// Mirrors the viewer: the others stay dimmed until the opening reports it has drawn.
function Opening({ onDone = () => {}, ...p }: Partial<ArcChartProps> & { onDone?: () => void }) {
  const [on, setOn] = useState(true);
  return (
    <ArcChart
      {...openingProps()}
      axes={["fortune", "tension"]}
      {...p}
      drawIn={on}
      onDrawn={() => {
        onDone();
        setOn(false);
      }}
    />
  );
}
const tensionOpacity = (c: HTMLElement) =>
  (c.querySelector("path[data-layer=tension]") as SVGPathElement).style.opacity;

test("the other layers wait at zero opacity and fade in once the opening has drawn", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  stubPathLength();
  const { container } = render(<Opening />);
  expect(tensionOpacity(container)).toBe("0");
  act(() => {
    for (let t = 0; frames.length; t += 5000) frames.shift()!(performance.now() + t);
  });
  expect(tensionOpacity(container)).toBe("1");
});

test("on a replay the other layers vanish at once, and only their return fades", () => {
  const tension = (c: HTMLElement) => c.querySelector("path[data-layer=tension]")!;
  stubPathLength();
  const { container, rerender } = render(
    <ArcChart {...openingProps()} axes={["fortune", "tension"]} />,
  );
  expect(tension(container)).toHaveClass("transition-opacity");
  rerender(<ArcChart {...openingProps()} axes={["fortune", "tension"]} drawIn />);
  expect(tension(container)).not.toHaveClass("transition-opacity");
});

test("under reduced motion the other layers show at once", () => {
  stubReducedMotion();
  expect(tensionOpacity(render(<Opening />).container)).toBe("1");
});

test("without a fortune line the opening reports at once and the other layers show", () => {
  const onDone = vi.fn();
  const { container } = render(<Opening axes={["tension"]} onDone={onDone} />);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(tensionOpacity(container)).toBe("1");
});

test("without a shape to sketch the opening reports at once and every layer shows", () => {
  const a = openingProps().analysis;
  a.archetype = { ...a.archetype, state: "none", shape: null };
  const onDone = vi.fn();
  const { container } = render(<Opening analysis={a} onDone={onDone} />);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(getComputedStyle(container.querySelector("path[data-layer=fortune]")!).opacity).toBe("1");
  expect(tensionOpacity(container)).toBe("1");
});
