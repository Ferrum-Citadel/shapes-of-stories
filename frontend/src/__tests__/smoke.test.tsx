import { render, screen, within } from "@testing-library/react";
import { RouterProvider } from "react-router/dom";
import { browserRouter } from "../App";
import { REPO_URL } from "../lib/definitions";
import { serve } from "./fixtures";

test("nav marks the current page and the colophon links to the source", async () => {
  serve();
  render(<RouterProvider router={browserRouter()} />);
  const nav = screen.getByRole("navigation", { name: "Site" });
  expect(
    within(nav)
      .getAllByRole("link")
      .map((a) => a.textContent),
  ).toEqual(["Gallery", "Compare", "My works", "About"]);
  expect(within(nav).getByRole("link", { name: "Gallery" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(within(nav).getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", REPO_URL);
  // The wall is drawn from the gallery's index, so the test ends once it has arrived.
  expect(await screen.findByText(/^0 public-domain classics/)).toBeInTheDocument();
});
