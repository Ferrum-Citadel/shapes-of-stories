import { render, screen } from "@testing-library/react";
import ArcChartLive from "../chart/ArcChartLive";
import { chartSize } from "../chart/useChartSize";
import { fakeAnswers, fakeStructure, indexCss, stubResize } from "./fixtures";

test("the live chart is drawn at the width of its box, as the finished one is", () => {
  const box = stubResize();
  render(
    <ArcChartLive
      answers={{}}
      structure={fakeStructure()}
      state="running"
      done={0}
      total={12}
      secondsLeft={null}
      queuePosition={null}
      onCancel={() => {}}
    />,
  );
  box.resize(358);
  expect(screen.getByRole("img", { name: "Fortune so far" })).toHaveAttribute(
    "viewBox",
    "0 0 358 212",
  );
});

test("a width change of a few pixels, such as a scrollbar coming and going, does not redraw the chart", () => {
  const box = stubResize();
  render(
    <ArcChartLive
      answers={{}}
      structure={fakeStructure()}
      state="running"
      done={0}
      total={12}
      secondsLeft={null}
      queuePosition={null}
      onCancel={() => {}}
    />,
  );
  const chart = screen.getByRole("img", { name: "Fortune so far" });
  box.resize(1000);
  expect(chart).toHaveAttribute("viewBox", "0 0 1000 340");
  box.resize(985);
  expect(chart).toHaveAttribute("viewBox", "0 0 985 337");
  box.resize(1000);
  expect(chart).toHaveAttribute("viewBox", "0 0 1000 340");
  box.resize(997);
  expect(chart).toHaveAttribute("viewBox", "0 0 1000 340");
  box.resize(1003);
  expect(chart).toHaveAttribute("viewBox", "0 0 1000 340");
});

// Each scored passage reads the fortune given for it.
const liveRun = (
  done: number,
  fortune: Record<number, number> = {},
  secondsLeft: number | null = null,
) => (
  <ArcChartLive
    answers={Object.fromEntries(
      Object.entries(fortune).map(([i, f]) => {
        const a = fakeAnswers();
        return [i, { ...a, scores: { ...a.scores, fortune: { ...a.scores.fortune, score: f } } }];
      }),
    )}
    structure={fakeStructure()}
    state="running"
    done={done}
    total={12}
    secondsLeft={secondsLeft}
    queuePosition={null}
    onCancel={() => {}}
  />
);

test("the progress rule fills in the accent with the passages done, and the status counts them in tabular figures", () => {
  const { rerender } = render(liveRun(0));
  const fill = screen.getByRole("progressbar", { name: "Analysis progress" })
    .firstElementChild as HTMLElement;
  // The accent is read from the inline style: jsdom computes the shorthand without its variable.
  expect(fill).toHaveStyle({ width: "0%" });
  expect(fill.style.background).toBe("var(--accent)");
  rerender(liveRun(3));
  expect(fill).toHaveStyle({ width: "25%" });
  // Before the pace is known no time is offered.
  rerender(liveRun(3, {}, 4));
  expect(screen.getByText("Passage 3 of 12 · about 4 s left")).toBeInTheDocument();
  rerender(liveRun(11, {}, 0));
  expect(screen.getByText("Passage 11 of 12 · nearly done")).toBeInTheDocument();
  rerender(liveRun(12));
  expect(fill).toHaveStyle({ width: "100%" });
});

test("the newest point settles in with a ring, the line is a three-point mean of the raw points, and its last stretch draws itself in", () => {
  const { container, rerender } = render(liveRun(3, { 0: 1, 1: 4, 2: 1 }));
  const chart = container.querySelector("svg[aria-label='Fortune so far']")!;
  const dots = () => [...chart.querySelectorAll("circle:not([data-ring])")];
  const ring = () => chart.querySelectorAll("circle[data-ring]");
  const cx = (i: number) => Number(dots()[i].getAttribute("cx")),
    cy = (i: number) => Number(dots()[i].getAttribute("cy"));
  const mean = (...ys: number[]) => ys.reduce((a, b) => a + b, 0) / ys.length;
  const pairs = (path: Element) =>
    path
      .getAttribute("d")!
      .slice(1)
      .split("L")
      .map((p) => p.split(",").map(Number));
  const expectLine = (path: Element, want: number[][]) =>
    pairs(path).forEach(([x, y], i) => {
      expect(x).toBeCloseTo(want[i][0]);
      expect(y).toBeCloseTo(want[i][1]);
    });
  expect(dots()).toHaveLength(3);
  dots().forEach((d) => expect(d).toHaveClass("live-settle"));
  // The points stay raw: the middle one sits apart from its neighbors.
  expect(cy(1)).not.toBeCloseTo(cy(0));
  expect(ring()).toHaveLength(1);
  expect(ring()[0]).toHaveClass("live-ring");
  expect(ring()[0].getAttribute("cx")).toBe(dots()[2].getAttribute("cx"));
  const [body, tail] = [...chart.querySelectorAll("g[fill=none] path")];
  expectLine(body, [
    [cx(0), mean(cy(0), cy(1))],
    [cx(1), mean(cy(0), cy(1), cy(2))],
  ]);
  expect(tail).toHaveClass("live-draw");
  expect(tail).toHaveAttribute("pathLength", "1");
  expectLine(tail, [
    [cx(1), mean(cy(0), cy(1), cy(2))],
    [cx(2), mean(cy(1), cy(2))],
  ]);
  // A later passage moves the ring and the drawing stretch on; the first dots are the same elements, so they do not settle again.
  const first = dots()[0];
  rerender(liveRun(4, { 0: 1, 1: 4, 2: 1, 5: 4 }));
  expect(dots()[0]).toBe(first);
  expect(ring()).toHaveLength(1);
  expect(ring()[0].getAttribute("cx")).toBe(dots()[3].getAttribute("cx"));
  expectLine(chart.querySelector(".live-draw")!, [
    [cx(2), mean(cy(1), cy(2), cy(3))],
    [cx(3), mean(cy(2), cy(3))],
  ]);
});

test("the live chart's motion is CSS alone: a 4 px drop over 220 ms, a ring that ends unseen, and none under reduced motion", () => {
  const rule = (sel: string) => indexCss.match(new RegExp(`\\n${sel} \\{([^}]*)\\}`))![1];
  expect(indexCss).toMatch(
    /@keyframes live-settle \{\s*from \{\s*opacity: 0;\s*translate: 0 -4px;/,
  );
  expect(rule("\\.live-settle")).toContain("var(--motion-reveal)");
  expect(indexCss).toMatch(/--motion-reveal: 220ms;/);
  expect(rule("\\.live-ring")).toMatch(/opacity: 0;/);
  expect(indexCss).toMatch(
    /@media \(prefers-reduced-motion: reduce\) \{\s*\* \{\s*transition: none !important;\s*animation: none !important;/,
  );
});

test("a phone held sideways gets a chart no taller than 60% of its screen, never under 200", () => {
  expect(chartSize(358, 844)).toEqual({ width: 358, height: 212 });
  expect(chartSize(814, 390)).toEqual({ width: 814, height: 234 });
  expect(chartSize(814, 300)).toEqual({ width: 814, height: 200 });
});

test("a sideways phone's chart keeps its height while the address bar comes and goes, and takes the new screen when it turns", () => {
  const box = stubResize();
  vi.stubGlobal("innerHeight", 390);
  const live = (done: number) => (
    <ArcChartLive
      answers={{}}
      structure={fakeStructure()}
      state="running"
      done={done}
      total={12}
      secondsLeft={null}
      queuePosition={null}
      onCancel={() => {}}
    />
  );
  const { rerender } = render(live(0));
  const chart = screen.getByRole("img", { name: "Fortune so far" });
  box.resize(814);
  expect(chart).toHaveAttribute("viewBox", "0 0 814 234");
  // The address bar comes back: the window is shorter and the chart is drawn again, but its box keeps its width.
  vi.stubGlobal("innerHeight", 330);
  box.resize(814);
  rerender(live(1));
  expect(chart).toHaveAttribute("viewBox", "0 0 814 234");
  vi.stubGlobal("innerHeight", 844);
  box.resize(358);
  expect(chart).toHaveAttribute("viewBox", "0 0 358 212");
});
