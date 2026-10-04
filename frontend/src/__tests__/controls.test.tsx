import { useState, type ComponentProps, type ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LayerChips from "../components/LayerChips";
import ViewControls from "../components/ViewControls";
import DefinitionLine from "../components/DefinitionLine";
import { popoverOf } from "./fixtures";

const chips = (ui: ReactElement) => render(ui, { wrapper: MemoryRouter });

test("chips toggle layers, keep one on, and report the focused axis", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onFocus = vi.fn();
  chips(<LayerChips active={["fortune"]} onChange={onChange} onFocusAxis={onFocus} />);
  await user.click(screen.getByRole("button", { name: /^Tension$/ }));
  expect(onChange).toHaveBeenCalledWith(["fortune", "tension"]);
  onChange.mockClear();
  await user.click(screen.getByRole("button", { name: /^Fortune$/ }));
  expect(onChange).toHaveBeenCalledTimes(0);
  fireEvent.pointerEnter(screen.getByRole("button", { name: /^Dread$/ }), { pointerType: "mouse" });
  expect(onFocus).toHaveBeenCalledWith("dread");
  expect(screen.getByText("Feeling")).toBeInTheDocument();
  expect(screen.getByText("Telling")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Feeling layers" })).toContainElement(
    screen.getByRole("button", { name: /^Dread$/ }),
  );
  expect(screen.getByRole("group", { name: "Telling layers" })).toContainElement(
    screen.getByRole("button", { name: /^Tension$/ }),
  );
});

test("the chips carry no popovers or links of their own", () => {
  chips(<LayerChips active={["fortune"]} onChange={() => {}} onFocusAxis={() => {}} />);
  expect(screen.queryByRole("button", { name: /^What .* means$/ })).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(10);
  expect(screen.queryByRole("link")).toBeNull();
});

test("the definition line ends with the link to the layers on About, before the explainer's button", () => {
  chips(<DefinitionLine axis="tension" onToggleExplainer={() => {}} />);
  const more = screen.getByRole("link", { name: "What the layers mean" });
  expect(more).toHaveAttribute("href", "/about#layers");
  const button = screen.getByRole("button", { name: "How to read this chart" });
  expect(more.compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(more.parentElement).toBe(button.parentElement);
});

test("a chip that is not the last one turns off, and aria-pressed follows active", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  chips(<LayerChips active={["fortune", "tension"]} onChange={onChange} onFocusAxis={() => {}} />);
  expect(screen.getByRole("button", { name: /^Fortune$/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /^Tension$/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /^Warmth$/ })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: /^Tension$/ }));
  expect(onChange).toHaveBeenCalledWith(["fortune"]);
});

test("a mouse hover and focus report the axis, leaving reports none, and a touch's hover does not", async () => {
  const user = userEvent.setup();
  const onFocus = vi.fn();
  chips(<LayerChips active={["fortune"]} onChange={() => {}} onFocusAxis={onFocus} />);
  fireEvent.pointerEnter(screen.getByRole("button", { name: /^Wonder$/ }), {
    pointerType: "touch",
  });
  expect(onFocus).not.toHaveBeenCalled();
  const chip = screen.getByRole("button", { name: /^Warmth$/ });
  fireEvent.pointerEnter(chip, { pointerType: "mouse" });
  expect(onFocus).toHaveBeenLastCalledWith("warmth");
  fireEvent.pointerLeave(chip, { pointerType: "mouse" });
  expect(onFocus).toHaveBeenLastCalledWith(null);
  fireEvent.blur(chip);
  expect(onFocus).toHaveBeenLastCalledWith(null);
  expect(onFocus).not.toHaveBeenCalledWith("wonder");
  onFocus.mockClear();
  await user.tab();
  expect(onFocus).toHaveBeenLastCalledWith("fortune");
  await user.tab();
  expect(screen.getByRole("button", { name: /^Warmth$/ })).toHaveFocus();
  expect(onFocus).toHaveBeenLastCalledWith("warmth");
});

function controls(p: Partial<ComponentProps<typeof ViewControls>> = {}) {
  return render(
    <ViewControls
      smoothing={1}
      onSmoothing={() => {}}
      band
      onBand={() => {}}
      points={false}
      onPoints={() => {}}
      {...p}
    />,
  );
}

test("the smoothing slider runs continuously from detail to shape", () => {
  const onSmoothing = vi.fn();
  controls({ onSmoothing });
  const slider = screen.getByRole("slider", { name: "Smoothing, from detail to shape" });
  expect(slider).toHaveAttribute("type", "range");
  expect(slider).toHaveAttribute("min", "0");
  expect(slider).toHaveAttribute("max", "1");
  expect(slider).toHaveAttribute("step", "0.01");
  expect(slider).not.toHaveAttribute("list");
  expect(slider).toHaveValue("1");
  expect(slider).toHaveAttribute("aria-valuetext", "shape");
  fireEvent.change(slider, { target: { value: "0.37" } });
  expect(onSmoothing).toHaveBeenCalledWith(0.37, false);
  expect(screen.getByText("Detail")).toBeInTheDocument();
  expect(screen.getByText("Shape")).toBeInTheDocument();
});

// The viewer keeps the value, so the slider holds what it last reported.
function Held({ onSmoothing }: { onSmoothing: (v: number, live: boolean) => void }) {
  const [v, setV] = useState(1);
  return (
    <ViewControls
      smoothing={v}
      onSmoothing={(x, live) => {
        setV(x);
        onSmoothing(x, live);
      }}
      band
      onBand={() => {}}
      points={false}
      onPoints={() => {}}
    />
  );
}

test("a drag reports each move as live and its release as settled; a keyboard step is settled", () => {
  const onSmoothing = vi.fn();
  render(<Held onSmoothing={onSmoothing} />);
  const slider = screen.getByRole("slider");
  fireEvent.pointerDown(slider);
  fireEvent.pointerMove(slider);
  fireEvent.input(slider, { target: { value: "0.6" } });
  expect(onSmoothing).toHaveBeenLastCalledWith(0.6, true);
  fireEvent.input(slider, { target: { value: "0.4" } });
  expect(onSmoothing).toHaveBeenLastCalledWith(0.4, true);
  fireEvent.change(slider);
  expect(onSmoothing).toHaveBeenLastCalledWith(0.4, false);
  fireEvent.pointerUp(slider);
  onSmoothing.mockClear();
  fireEvent.input(slider, { target: { value: "0.41" } });
  expect(onSmoothing).toHaveBeenCalledWith(0.41, false);
  expect(onSmoothing).not.toHaveBeenCalledWith(expect.anything(), true);
});

test("a plain click on the track jumps there settled, so the line tweens", () => {
  const onSmoothing = vi.fn();
  render(<Held onSmoothing={onSmoothing} />);
  const slider = screen.getByRole("slider");
  fireEvent.pointerDown(slider);
  fireEvent.input(slider, { target: { value: "0.3" } });
  expect(onSmoothing).toHaveBeenLastCalledWith(0.3, false);
  fireEvent.pointerUp(slider);
  fireEvent.pointerMove(slider);
  fireEvent.input(slider, { target: { value: "0.5" } });
  expect(onSmoothing).toHaveBeenLastCalledWith(0.5, false);
});

test.each([
  [0, "detail"],
  [0.1, "detail"],
  [0.2, "mostly detail"],
  [0.5, "halfway"],
  [0.62, "halfway"],
  [0.7, "mostly shape"],
  [0.9, "shape"],
])("a smoothing of %s is read out by the nearest word, %s", (smoothing, word) => {
  controls({ smoothing });
  const slider = screen.getByRole("slider", { name: "Smoothing, from detail to shape" });
  expect(slider).toHaveValue(String(smoothing));
  expect(slider).toHaveAttribute("aria-valuetext", word);
});

test("band and points toggle, and no table toggle is left", async () => {
  const user = userEvent.setup();
  const onBand = vi.fn();
  controls({ onBand });
  await user.click(screen.getByRole("button", { name: "band" }));
  expect(onBand).toHaveBeenCalledWith(false);
  expect(screen.getByRole("button", { name: "band" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "points" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", { name: "table" })).toBeNull();
  expect(screen.getByRole("group", { name: "Chart details" })).toContainElement(
    screen.getByRole("button", { name: "band" }),
  );
});

test("one popover says what the band, the points and the slider show", async () => {
  const user = userEvent.setup();
  controls();
  await user.click(screen.getByRole("button", { name: "What the controls show" }));
  const card = popoverOf("What the controls show")!;
  expect(card).toHaveTextContent(/band.*how sure the reading was.*wider is less sure/i);
  expect(card).toHaveTextContent(/points.*readings before smoothing/i);
  expect(card).toHaveTextContent(/slider.*how much smoothing/i);
});

test("the definition line names the axis, keeps a constant button name and flips aria-expanded", async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  const { rerender } = chips(
    <DefinitionLine axis="tension" explainerOpen={false} onToggleExplainer={onToggle} />,
  );
  expect(screen.getByText("Tension")).toBeInTheDocument();
  expect(screen.getByText(/how much the reader wants/i)).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "How to read this chart" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(button.closest("[aria-live]")).toBeNull();
  expect(screen.getByText(/how much the reader wants/i).closest("[aria-live]")).toBeNull();
  await user.click(button);
  expect(onToggle).toHaveBeenCalled();
  rerender(<DefinitionLine axis="tension" explainerOpen onToggleExplainer={onToggle} />);
  expect(screen.getByRole("button", { name: "How to read this chart" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});
