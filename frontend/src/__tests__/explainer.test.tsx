import { render, screen } from "@testing-library/react";
import Explainer from "../components/Explainer";
test("renders the three paragraphs only when open", () => {
  const { container, rerender } = render(<Explainer open={false} />);
  expect(container.firstChild).toBeNull();
  rerender(<Explainer open />);
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  const svgs = container.querySelectorAll("svg");
  expect(svgs).toHaveLength(3);
  svgs.forEach((svg) => expect(svg).toHaveAttribute("aria-hidden", "true"));
  expect(screen.getByText(/squinted at/)).toBeInTheDocument();
  expect(
    screen.getByText(/the slider on the chart sets how much they are smoothed/),
  ).toBeInTheDocument();
  expect(screen.getByText(/an underline marks .* a rule in the margin/)).toBeInTheDocument();
  expect(container).not.toHaveTextContent(/red line|the model|number on a bead|drawn doubled/);
  expect(screen.getByRole("region", { name: "How to read this chart" })).toHaveClass("enter");
});
