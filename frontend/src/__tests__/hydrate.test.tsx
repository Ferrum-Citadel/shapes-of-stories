import { render, screen } from "@testing-library/react";
import { RouterProvider } from "react-router/dom";
import { browserRouter } from "../App";

// The privacy page's code never arrives here.
vi.mock("../pages/Privacy", () => new Promise(() => {}));

test("a first visit to a page whose code is still on its way shows the bar at once", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  window.history.replaceState(null, "", "/privacy");
  render(<RouterProvider router={browserRouter()} />);
  expect(await screen.findByRole("navigation", { name: "Site" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Skip to the content" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toBeEmptyDOMElement();
});
