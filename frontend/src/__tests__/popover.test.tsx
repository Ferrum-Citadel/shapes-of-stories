import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Popover from "../components/Popover";
import { popoverOf } from "./fixtures";

const rect = (left: number, right: number) => () =>
  ({
    left,
    right,
    top: 0,
    bottom: 18,
    width: right - left,
    height: 18,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;
const spread = () => popoverOf("What ± means");

test("opens on focus and click, closes on Escape and outside click", async () => {
  const user = userEvent.setup();
  render(
    <div>
      <Popover label="What tension means" title="Tension">
        <p>How much the reader wants to know what happens next.</p>
      </Popover>
      <button>elsewhere</button>
    </div>,
  );
  const btn = screen.getByRole("button", { name: "What tension means" });
  expect(popoverOf("What tension means")).toBeNull();
  act(() => btn.focus());
  expect(popoverOf("What tension means")).toHaveTextContent("How much the reader");
  await user.keyboard("{Escape}");
  expect(popoverOf("What tension means")).toBeNull();
  await user.click(btn);
  expect(popoverOf("What tension means")).toBeInTheDocument();
  await user.click(screen.getByText("elsewhere"));
  expect(popoverOf("What tension means")).toBeNull();
});

test("it is a disclosure, not a dialog: the button says whether it is open and names what it shows", () => {
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  expect(btn).toHaveAttribute("aria-expanded", "false");
  expect(btn).not.toHaveAttribute("aria-controls");
  fireEvent.click(btn);
  expect(btn).toHaveAttribute("aria-expanded", "true");
  expect(spread()).toHaveTextContent("The ±spread");
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a click with no earlier hover opens it", () => {
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  fireEvent.click(screen.getByRole("button", { name: "What ± means" }));
  expect(spread()).toBeInTheDocument();
});

test("the tap that opens it does not close it, and a second tap does", () => {
  vi.useFakeTimers();
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  // A tap arrives as a hover, a focus and a click in quick succession.
  fireEvent.mouseEnter(btn);
  fireEvent.focus(btn);
  fireEvent.click(btn);
  expect(spread()).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(btn);
  expect(spread()).toBeNull();
  fireEvent.click(btn);
  expect(spread()).toBeInTheDocument();
});

test("a click on a popover the mouse opened pins it, and leaving no longer closes it", () => {
  vi.useFakeTimers();
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  fireEvent.mouseEnter(btn);
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(btn);
  expect(spread()).toBeInTheDocument();
  fireEvent.mouseLeave(btn);
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(spread()).toBeInTheDocument();
  fireEvent.click(btn);
  expect(spread()).toBeNull();
});

test("a popover that focus opened stays open when its button is pressed, and a second press closes it", () => {
  vi.useFakeTimers();
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  act(() => btn.focus());
  expect(spread()).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(500);
  });
  fireEvent.click(btn);
  expect(spread()).toBeInTheDocument();
  fireEvent.click(btn);
  expect(spread()).toBeNull();
});

test("a popover opened by a click closes on the next click, however long it has been open", () => {
  vi.useFakeTimers();
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  fireEvent.click(btn);
  expect(spread()).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(100);
  });
  fireEvent.click(btn);
  expect(spread()).toBeNull();
});

test("a resting mouse opens it after a quarter of a second, and leaving closes it after a short grace period", () => {
  vi.useFakeTimers();
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  fireEvent.mouseEnter(btn);
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(spread()).toBeNull();
  act(() => {
    vi.advanceTimersByTime(50);
  });
  expect(spread()).toBeInTheDocument();
  expect(spread()).toHaveClass("enter", "quick");
  fireEvent.mouseLeave(btn);
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(spread()).toBeNull();
});

test("a pointer passing over the ? on its way elsewhere does not open it", () => {
  vi.useFakeTimers();
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  fireEvent.mouseEnter(btn);
  act(() => {
    vi.advanceTimersByTime(120);
  });
  expect(spread()).toBeNull();
  fireEvent.mouseLeave(btn);
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(spread()).toBeNull();
});

test("coming back within the grace period keeps it open", () => {
  vi.useFakeTimers();
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  fireEvent.mouseEnter(btn);
  act(() => {
    vi.advanceTimersByTime(250);
  });
  fireEvent.mouseLeave(btn);
  act(() => {
    vi.advanceTimersByTime(100);
  });
  fireEvent.mouseEnter(btn);
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(spread()).toBeInTheDocument();
});

test("leaving the popover and coming back within the grace period keeps it open", () => {
  vi.useFakeTimers();
  render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  fireEvent.mouseEnter(screen.getByRole("button", { name: "What ± means" }));
  act(() => {
    vi.advanceTimersByTime(250);
  });
  const panel = spread()!;
  fireEvent.mouseLeave(panel);
  act(() => {
    vi.advanceTimersByTime(100);
  });
  fireEvent.mouseEnter(panel);
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(spread()).toBeInTheDocument();
});

// jsdom lays nothing out, so the popover's width and the page's are set by hand; a phone's innerWidth can be wider than its page once something overflows.
function openAt(left: number, pageWidth: number, innerWidth = pageWidth) {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
  const page = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(pageWidth);
  vi.stubGlobal("innerWidth", innerWidth);
  const r = render(
    <Popover label="What ± means" title="The ±">
      <p>spread</p>
    </Popover>,
  );
  const btn = screen.getByRole("button", { name: "What ± means" });
  btn.parentElement!.getBoundingClientRect = rect(left, left + 18);
  fireEvent.click(btn);
  const at = () => left + parseFloat(spread()!.style.left);
  return {
    at,
    page,
    done: () => {
      r.unmount();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}
const placed = (left: number, pageWidth: number, innerWidth?: number) => {
  const o = openAt(left, pageWidth, innerWidth);
  const x = o.at();
  o.done();
  return x;
};

test("it opens under its button when there is room", () => {
  expect(placed(50, 1024)).toBe(50);
});

test("near the right edge it slides left and stays 8 px inside the page", () => {
  expect(placed(900, 1024)).toBe(1024 - 8 - 300);
  // A phone: every chip's button sits right of 82 px, so every popover is pulled back to the same spot.
  for (const left of [120, 288, 360]) expect(placed(left, 390)).toBe(390 - 8 - 300);
});

test("it is held to the page's width even when a phone reports a wider window", () => {
  expect(placed(338, 390, 638)).toBe(390 - 8 - 300);
});

test("near the left edge it never starts before 8 px", () => {
  expect(placed(2, 390)).toBe(8);
});

test("an open popover is placed again when the window turns", () => {
  const o = openAt(700, 1024);
  expect(o.at()).toBe(700);
  o.page.mockReturnValue(844);
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(o.at()).toBe(844 - 8 - 300);
  o.done();
});
