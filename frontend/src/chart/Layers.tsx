import { memo, type RefObject } from "react";
import type { Analysis, Axis } from "../types";
import { LAYERS } from "../lib/layers";
import { PLOT, yOf } from "./ChartFrame";

// Everything but the fortune line waits for the opening stroke, then fades in; it leaves at once, so a replay never draws across a ghost of the band.
const fadeIn = (dim: boolean) => ({
  className: dim ? undefined : "transition-opacity duration-[var(--motion-draw)]",
  style: { opacity: dim ? 0 : 1 },
});

// The hatching, the band and the points stay put while the pointer moves, so they are drawn apart from what follows it.
export const Underlay = memo(function Underlay({
  analysis,
  axes,
  x,
  height,
  hatch,
  band,
  bandFill,
  showRaw,
  dim,
}: {
  analysis: Analysis;
  axes: Axis[];
  x: (bin: number) => number;
  height: number;
  hatch: string;
  band: string | null;
  bandFill: string;
  showRaw: boolean;
  dim: boolean;
}) {
  const { t, b } = PLOT;
  const binW = x(1) - x(0);
  const others = fadeIn(dim);
  return (
    <>
      {analysis.empty_bins.map((bin) => (
        <rect
          key={bin}
          data-empty
          x={x(bin) - binW / 2}
          y={t}
          width={binW}
          height={height - t - b}
          fill={`url(#${hatch})`}
          opacity={0.2}
        />
      ))}
      {band !== null && <path data-band {...others} d={band || undefined} fill={bandFill} />}
      {showRaw && (
        <g {...others}>
          {axes.map((ax) =>
            analysis.bins[ax].raw.map((v, i) =>
              v === null ? null : (
                <circle
                  key={`${ax}${i}`}
                  cx={x(i)}
                  cy={yOf(v, height)}
                  r={1.6}
                  fill={LAYERS[ax].color}
                  opacity={0.3}
                />
              ),
            ),
          )}
        </g>
      )}
    </>
  );
});

const RESPOND = ["opacity", "stroke-width"]
  .map((p) => `${p} var(--motion-respond) var(--ease-settle)`)
  .join(", ");

// Each line sits in a group that carries its width and its dimming, so a highlight eases in apart from the fade the line runs itself; the fortune line's glow is a copy of it, drawn wide and faint behind it, which follows every morph.
export function Lines({
  axes,
  lit,
  glow,
  fortuneD,
  curves,
  fortuneId,
  fortuneRef,
  dim,
}: {
  axes: Axis[];
  lit: Axis | null;
  glow: boolean;
  fortuneD: string;
  curves: Record<string, string>;
  fortuneId: string;
  fortuneRef: RefObject<SVGPathElement | null>;
  dim: boolean;
}) {
  const fade = fadeIn(dim);
  return axes.map((ax) => (
    <g
      key={ax}
      strokeWidth={(ax === "fortune" ? 2.4 : 1.8) + (lit === ax ? 0.8 : 0)}
      opacity={lit && lit !== ax ? 0.55 : 1}
      style={{ transition: RESPOND }}
    >
      {ax === "fortune" ? (
        <>
          <use
            data-glow
            href={`#${fortuneId}`}
            strokeWidth={6}
            opacity={lit === ax && glow ? 0.18 : 0}
            style={{ transition: RESPOND }}
          />
          <path
            id={fortuneId}
            ref={fortuneRef}
            data-layer={ax}
            d={fortuneD}
            fill="none"
            stroke={LAYERS[ax].color}
            strokeLinecap="round"
          />
        </>
      ) : (
        <path
          data-layer={ax}
          {...fade}
          d={curves[ax] || undefined}
          fill="none"
          stroke={LAYERS[ax].color}
          strokeDasharray={LAYERS[ax].dash || undefined}
        />
      )}
    </g>
  ));
}
