import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Tip from "../components/Tip";

const bar = () => screen.getByRole("img", { name: "bar" });

test("hovering shows a tooltip that describes the child, and leaving hides it", async () => {
  const user = userEvent.setup();
  render(
    <Tip text="dialogue 57 %">
      <span role="img" aria-label="bar" tabIndex={0} />
    </Tip>,
  );
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.hover(bar());
  expect(screen.getByRole("tooltip")).toHaveTextContent("dialogue 57 %");
  expect(bar()).toHaveAccessibleDescription("dialogue 57 %");
  await user.unhover(bar());
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(bar()).not.toHaveAttribute("aria-describedby");
});

test("an empty text keeps the tooltip closed until there is something to say", async () => {
  const user = userEvent.setup();
  const tip = (text: string) => (
    <Tip text={text}>
      <span role="img" aria-label="bar" tabIndex={0} />
    </Tip>
  );
  const { rerender } = render(tip(""));
  await user.hover(bar());
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(bar()).not.toHaveAttribute("aria-describedby");
  rerender(tip("dialogue 57 %"));
  expect(screen.getByRole("tooltip")).toHaveTextContent("dialogue 57 %");
});

test("focus shows it, Escape dismisses it, and blur hides it", async () => {
  const user = userEvent.setup();
  render(
    <>
      <Tip text="action 43 %">
        <span role="img" aria-label="bar" tabIndex={0} />
      </Tip>
      <button type="button">next</button>
    </>,
  );
  await user.tab();
  expect(bar()).toHaveFocus();
  expect(screen.getByRole("tooltip")).toHaveTextContent("action 43 %");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(bar());
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  await user.tab();
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("a focused child keeps its tooltip when the pointer leaves, and a hovered one when focus leaves", async () => {
  const user = userEvent.setup();
  render(
    <>
      <Tip text="exposition 20 %">
        <span role="img" aria-label="bar" tabIndex={0} />
      </Tip>
      <button type="button">next</button>
    </>,
  );
  await user.tab();
  await user.hover(bar());
  await user.unhover(bar());
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  await user.hover(bar());
  await user.tab();
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  await user.unhover(bar());
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("the tooltip opens below its child, lets the pointer through, and stays inside a narrow viewport", async () => {
  const user = userEvent.setup();
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
  render(
    <Tip text="reflection 100 %">
      <span role="img" aria-label="bar" tabIndex={0} />
    </Tip>,
  );
  vi.spyOn(bar().parentElement!, "getBoundingClientRect").mockReturnValue({
    left: 300,
  } as DOMRect);
  await user.hover(bar());
  const panel = screen.getByRole("tooltip").parentElement!;
  expect(panel).toHaveClass("top-full", "pointer-events-none");
  // 390 − 8 − 260 = 122 is the furthest right a 260 px panel may start, 178 px left of the child.
  expect(panel.style.left).toBe("-178px");
});
