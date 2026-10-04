import { memo } from "react";
import { AXES, type Axis } from "../types";
import { GROUPS, LAYERS } from "../lib/layers";
import { AXIS_INFO } from "../lib/definitions";
import { target } from "../lib/ui";

// A layer's line in little, or any color and dash given.
export function Swatch(p: { axis: Axis } | { color: string; dash?: string }) {
  const { color, dash } = "axis" in p ? LAYERS[p.axis] : p;
  return (
    <svg width="18" height="6" aria-hidden>
      <line
        x1="0"
        y1="3"
        x2="18"
        y2="3"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dash || undefined}
      />
    </svg>
  );
}

// Below 640 px the chips run in one row that scrolls sideways, edge to edge; the definition line explains the chip just tapped.
export default memo(function LayerChips({
  active,
  onChange,
  onFocusAxis,
}: {
  active: Axis[];
  onChange: (a: Axis[]) => void;
  onFocusAxis?: (a: Axis | null) => void;
}) {
  const toggle = (ax: Axis) => {
    if (active.includes(ax)) {
      if (active.length > 1) onChange(active.filter((a) => a !== ax));
    } else onChange(AXES.filter((a) => a === ax || active.includes(a)));
  };
  return (
    // From 640 px this box steps aside, so each group flows in the row it is placed in, beside whatever else fits there.
    <div className="flex items-center max-sm:-mx-4 max-sm:gap-x-3 max-sm:overflow-x-auto max-sm:px-4 max-sm:py-1 [scrollbar-width:none] sm:contents">
      {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((g) => (
        // From 640 px each group's label keeps a column of its own, so a wrapped row of chips hangs under the first chip and both groups' chips line up.
        <div
          key={g}
          role="group"
          aria-label={`${g} layers`}
          className="flex items-center gap-x-1 max-sm:shrink-0 sm:items-start"
        >
          <span className="label mr-1 sm:flex sm:min-h-[40px] sm:w-[4.5rem] sm:shrink-0 sm:items-center [@media(pointer:fine)]:sm:min-h-[32px]">
            {g}
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:flex-nowrap max-sm:gap-x-1">
            {GROUPS[g].map((ax) => {
              const on = active.includes(ax);
              return (
                // Only a real mouse hovers, since a tap's emulated hover would leave the line on a chip long after it was turned off.
                <button
                  key={ax}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(ax)}
                  onFocus={() => onFocusAxis?.(ax)}
                  onBlur={() => onFocusAxis?.(null)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") onFocusAxis?.(ax);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") onFocusAxis?.(null);
                  }}
                  className={`inline-flex ${target} items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13.5px] ${on ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--muted)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"}`}
                >
                  <Swatch axis={ax} />
                  {AXIS_INFO[ax].name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});
