import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShapeCard, { ShapeLine } from "../components/ShapeCard";
import { confidenceSentence } from "../lib/definitions";
import { fakeAnalysis, popoverOf } from "./fixtures";

test("named, leans and none states read in plain words and replay is offered", async () => {
  const a = fakeAnalysis();
  const onReplay = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(
    <ShapeCard
      archetype={{
        ...a.archetype,
        state: "named",
        shape: "fall_rise",
        caption: "Man in a Hole",
        r: 0.86,
        margin: 0.4,
      }}
      fortuneShape={a.bins.fortune.shape}
      onReplay={onReplay}
    />,
  );
  expect(screen.getByRole("heading")).toHaveTextContent("Man in a Hole");
  expect(screen.getByText(/gets into trouble/)).toBeInTheDocument();
  expect(screen.getByText(/strong match/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /replay/i }));
  expect(onReplay).toHaveBeenCalled();
  rerender(
    <ShapeCard
      archetype={{
        ...a.archetype,
        state: "leans",
        shape: "rise",
        caption: "leans toward Rags to Riches",
        r: 0.47,
        margin: 0.09,
      }}
      fortuneShape={a.bins.fortune.shape}
    />,
  );
  expect(screen.getByText(/leans this way/i)).toBeInTheDocument();
  rerender(
    <ShapeCard
      archetype={{
        ...a.archetype,
        state: "none",
        shape: null,
        caption: "Which Way Is Up?",
        r: 0.3,
        margin: 0.1,
      }}
      fortuneShape={a.bins.fortune.shape}
    />,
  );
  expect(screen.getByRole("heading")).toHaveTextContent(/no clear shape/i);
  expect(screen.getByText(/Hamlet/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "What the match means" })).toBeInTheDocument();
});

test("no replay button without onReplay", () => {
  const a = fakeAnalysis();
  render(
    <ShapeCard
      archetype={{
        ...a.archetype,
        state: "named",
        shape: "fall_rise",
        caption: "Man in a Hole",
        r: 0.86,
        margin: 0.4,
      }}
      fortuneShape={a.bins.fortune.shape}
    />,
  );
  expect(screen.queryByRole("button", { name: /replay/i })).not.toBeInTheDocument();
});

test("a flat series with an unknown shape draws one finite curve and no template", () => {
  const a = fakeAnalysis();
  const { container } = render(
    <ShapeCard
      archetype={{
        ...a.archetype,
        state: "named",
        shape: "mystery",
        caption: "Something Else",
        r: 0.9,
        margin: 0.5,
      }}
      fortuneShape={Array(100).fill(2)}
    />,
  );
  const paths = container.querySelectorAll('svg[viewBox="0 0 160 60"] path');
  expect(paths).toHaveLength(1);
  expect(paths[0].getAttribute("d")).not.toContain("NaN");
  expect(screen.getByRole("heading")).toHaveTextContent("Something Else");
});

test("the match popover opens on focus with the note and the card keeps one heading", async () => {
  const a = fakeAnalysis();
  const user = userEvent.setup();
  render(
    <ShapeCard
      archetype={{
        ...a.archetype,
        state: "named",
        shape: "fall_rise",
        caption: "Man in a Hole",
        r: 0.86,
        margin: 0.4,
      }}
      fortuneShape={a.bins.fortune.shape}
    />,
  );
  await user.tab();
  expect(screen.getByRole("button", { name: "What the match means" })).toHaveFocus();
  expect(popoverOf("What the match means")).toHaveTextContent(/the closest is named/);
  expect(screen.getAllByRole("heading")).toHaveLength(1);
});

test("a reading of no clear shape draws no template, even when the answer names one", () => {
  const a = fakeAnalysis();
  const { container } = render(
    <ShapeCard
      archetype={{
        ...a.archetype,
        state: "none",
        shape: "rise",
        caption: "Which Way Is Up?",
        r: 0.3,
        margin: 0.1,
      }}
      fortuneShape={a.bins.fortune.shape}
    />,
  );
  expect(container.querySelectorAll('svg[viewBox="0 0 160 60"] path')).toHaveLength(1);
  expect(screen.getByRole("heading")).toHaveTextContent("No clear shape");
});

test("the phone's shape line names the shape and how close it came, with the rest behind its ?", async () => {
  const a = fakeAnalysis();
  const onReplay = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(
    <ShapeLine
      archetype={{
        ...a.archetype,
        state: "named",
        shape: "rise_fall_rise",
        caption: "Cinderella",
        r: 0.86,
        margin: 0.4,
      }}
      onReplay={onReplay}
    />,
  );
  expect(screen.getByText("Cinderella")).toBeInTheDocument();
  expect(screen.getByText("strong match")).toBeInTheDocument();
  expect(screen.queryByRole("heading")).toBeNull();
  // The phone's line is the same landmark as the card it stands in for.
  expect(screen.getByRole("complementary", { name: "Story shape" })).toHaveTextContent(
    "Cinderella",
  );
  await user.click(screen.getByRole("button", { name: "About this shape" }));
  const note = popoverOf("About this shape");
  expect(note).toHaveTextContent(/Low, then rising/);
  expect(note).toHaveTextContent(/Strong match, with a clear margin/);
  expect(note).toHaveTextContent(/the closest is named/);
  await user.click(screen.getByRole("button", { name: /replay/i }));
  expect(onReplay).toHaveBeenCalled();
  rerender(
    <ShapeLine
      archetype={{
        ...a.archetype,
        state: "leans",
        shape: "rise",
        caption: "leans toward Rags to Riches",
        r: 0.47,
        margin: 0.09,
      }}
    />,
  );
  expect(screen.getByText("Rags to Riches")).toBeInTheDocument();
  expect(screen.getByText("leans this way")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /replay/i })).toBeNull();
  rerender(
    <ShapeLine
      archetype={{
        ...a.archetype,
        state: "none",
        shape: null,
        caption: "Which Way Is Up?",
        r: 0.3,
        margin: 0.1,
      }}
    />,
  );
  expect(screen.getByText("No clear shape")).toBeInTheDocument();
  expect(screen.queryByText(/match|leans/)).toBeNull();
});

test("the card's sketch keeps its stroke width at any size", () => {
  const a = fakeAnalysis();
  render(<ShapeCard archetype={a.archetype} fortuneShape={a.bins.fortune.shape} />);
  const card = screen.getByRole("complementary", { name: "Story shape" });
  const svg = card.querySelector('svg[viewBox="0 0 160 60"]')!;
  expect([...svg.querySelectorAll("path")].map((p) => p.getAttribute("vector-effect"))).toEqual([
    "non-scaling-stroke",
  ]);
});

test("the match's question flows in its sentence, after the last word", () => {
  const a = fakeAnalysis();
  render(<ShapeCard archetype={a.archetype} fortuneShape={a.bins.fortune.shape} />);
  const q = screen.getByRole("button", { name: "What the match means" });
  const sentence = screen.getByText(confidenceSentence(a.archetype).trim());
  expect(sentence).toContainElement(q);
  expect(sentence.textContent).toBe(`${confidenceSentence(a.archetype)}\u00a0`);
});
