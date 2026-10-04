import { memo } from "react";
import { Link } from "react-router";
import type { Axis } from "../types";
import { AXIS_INFO } from "../lib/definitions";
import { Icon } from "./icons";
import { link, target } from "../lib/ui";
// From 640 px, where the line sits above the chart, the definition keeps room for two lines in its own column, so the chart never moves as the chip changes.
export default memo(function DefinitionLine({
  axis,
  explainerOpen = false,
  onToggleExplainer,
}: {
  axis: Axis;
  explainerOpen?: boolean;
  onToggleExplainer?: () => void;
}) {
  return (
    <div className="serif opsz-14 flex flex-wrap items-center justify-between gap-x-4 text-[13.5px] italic text-[var(--muted)] sm:min-h-[41px] sm:flex-nowrap lg:min-h-0">
      <span className="sm:min-w-0 sm:flex-1">
        <b className="not-italic font-medium text-[var(--ink)]">{AXIS_INFO[axis].name}</b> —{" "}
        {AXIS_INFO[axis].definition}
      </span>
      <Link
        to="/about#layers"
        viewTransition
        className={`${link} ${target} ml-auto inline-flex shrink-0 items-center whitespace-nowrap`}
      >
        What the layers mean
      </Link>
      {onToggleExplainer && (
        <button
          type="button"
          onClick={onToggleExplainer}
          aria-expanded={explainerOpen}
          className={`inline-flex ${target} shrink-0 items-center gap-1 ${link}`}
        >
          How to read this chart
          <Icon
            name="chevron"
            size={12}
            className={`transition-transform ${explainerOpen ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      )}
    </div>
  );
});
