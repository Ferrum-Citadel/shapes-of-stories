import { useCallback, useEffect, useId, useMemo, useRef, type MouseEvent } from "react";
import { linear } from "../lib/scale";
import type { Analysis, Axis, Structure } from "../types";
import { LAYERS } from "../lib/layers";
import { BINS, beatForBin } from "../lib/bins";
import { ChartFrame, PLOT, halo, passageColumn, pinMark, word, yOf } from "./ChartFrame";
import { useDrawIn } from "./useDrawIn";
import { curvePaths, drawnRange, lineNear } from "./curves";
import { bandAt } from "../lib/curves";
import { useLayerWipe, useMorph } from "./useLayerMotion";
import { useSelectionMotion } from "./useSelectionMotion";
import { coarse } from "../lib/ui";
import { Lines, Underlay } from "./Layers";

export interface ArcChartProps {
  analysis: Analysis;
  structure: Structure;
  axes: Axis[];
  smoothing: number;
  showBand: boolean;
  showRaw: boolean;
  shown: number | null;
  pinned: number | null;
  focusAxis?: Axis | null;
  highlight?: Axis | null;
  onHover: (i: number | null) => void;
  onLineHover?: (a: Axis | null) => void;
  onPin: (i: number) => void;
  drawIn?: boolean;
  width?: number;
  height?: number;
  onDrawn?: () => void;
  reading?: { id: string; text: string };
  live?: boolean;
  hint?: boolean;
}

export default function ArcChart({
  analysis,
  structure,
  axes,
  smoothing,
  showBand,
  showRaw,
  shown,
  pinned,
  focusAxis = null,
  highlight = null,
  onHover,
  onLineHover,
  onPin,
  drawIn = false,
  width = PLOT.width,
  height = PLOT.height,
  onDrawn,
  reading,
  live = false,
  hint = false,
}: ArcChartProps) {
  const { l, r, t, b } = PLOT;
  const id = useId();
  const x = useMemo(() => linear([0, BINS - 1], [l, width - r], true), [l, r, width]);
  const y = useCallback((v: number) => yOf(v, height), [height]);
  const first = axes[0];
  // Kept between renders, so a hover never redraws the curves.
  const band = useMemo(
    () => (first && showBand ? bandAt(analysis.bins[first], smoothing) : null),
    [analysis, first, showBand, smoothing],
  );
  const range = useMemo(() => drawnRange(analysis.empty_bins), [analysis.empty_bins]);
  // The drawings change with the data, the layers and the size, never with a hover.
  const { fortuneD, sketch, curves, values } = useMemo(
    () => curvePaths({ analysis, axes, smoothing, band, x, y, range }),
    [analysis, axes, smoothing, band, x, y, range],
  );
  const fortuneRef = useRef<SVGPathElement>(null);
  useDrawIn(fortuneRef, sketch, fortuneD, drawIn, onDrawn);
  const plotRef = useRef<SVGGElement>(null);
  useLayerWipe(plotRef, axes, drawIn);

  const pointAt = (e: MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return null;
    const px = l + ((e.clientX - rect.left) / rect.width) * (width - l - r);
    const py = t + ((e.clientY - rect.top) / rect.height) * (height - t - b);
    const at = Math.max(0, Math.min(BINS - 1, x.invert(px)));
    return { at, bin: Math.round(at), py };
  };
  const beatAt = (e: MouseEvent<SVGRectElement>) => {
    const p = pointAt(e);
    return p && beatForBin(structure, p.bin);
  };
  // The line under the pointer is reported only when it changes; there is none past the drawn ends or while the opening hides the other layers.
  const lastLine = useRef<Axis | null>(null);
  // A change of layers clears the viewer's line, so the next move reports afresh.
  useEffect(() => {
    lastLine.current = null;
  }, [axes]);
  const touch = coarse();
  const hoverLine = (e: MouseEvent<SVGRectElement> | null) => {
    const p = e && !touch && !drawIn ? pointAt(e) : null;
    const near =
      p && p.at >= range[0] && p.at <= range[1] ? lineNear(values, axes, p.at, p.py, y) : null;
    if (near === lastLine.current) return;
    lastLine.current = near;
    onLineHover?.(near);
  };
  const lit = highlight && axes.includes(highlight) && !drawIn && !touch ? highlight : null;
  const column = shown === null ? null : passageColumn(structure, shown, x);
  // The words belong to the chip under the pointer when its layer is drawn, else to the first layer; of two layers, the other takes the right.
  const axis = focusAxis && axes.includes(focusAxis) ? focusAxis : (first ?? "fortune");
  const second = axes.length === 2 ? (axes.find((a) => a !== axis) ?? null) : null;
  const ringY = (bin: number) => y(values[first ?? "fortune"][bin] ?? 0);
  const pin =
    pinned === null ? null : pinMark(structure, pinned, x, ringY, width, axis, second, hint);

  // The pinned ring rides its line through the morph.
  const ring = pin ? String(pin.cy) : null;
  useMorph(plotRef, smoothing, curves, ring, drawIn, live);
  useSelectionMotion(plotRef, column, shown === pinned, pin);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      role="img"
      aria-label="Story arcs by percent of work"
      aria-describedby={reading?.id}
    >
      {reading && <desc>{reading.text}</desc>}
      <defs>
        <clipPath id={`${id}plot`}>
          <rect x={l} y={t} width={width - l - r} height={height - t - b} />
        </clipPath>
        <pattern
          id={`${id}hatch`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <ChartFrame
        chapters={analysis.chapters}
        width={width}
        height={height}
        axis={axis}
        second={second}
        transcript={structure.preset === "transcript"}
      />
      <g ref={plotRef} clipPath={`url(#${id}plot)`}>
        <Underlay
          analysis={analysis}
          axes={axes}
          x={x}
          height={height}
          hatch={`${id}hatch`}
          band={band && first ? curves.band : null}
          bandFill={
            !first || first === "fortune"
              ? "var(--accent-soft)"
              : `color-mix(in srgb, ${LAYERS[first].color} var(--band-mix), transparent)`
          }
          showRaw={showRaw}
          dim={drawIn}
        />
        {column && (
          <rect
            data-shown
            {...column}
            y={t}
            height={height - t - b}
            fill="var(--select)"
            fillOpacity={shown === pinned ? undefined : 0.6}
          />
        )}
        <Lines
          axes={axes}
          lit={lit}
          glow={showBand}
          fortuneD={fortuneD}
          curves={curves}
          fortuneId={`${id}fortune`}
          fortuneRef={fortuneRef}
          dim={drawIn}
        />
        {pin && (
          <g data-pinned>
            <line
              x1={pin.cx}
              x2={pin.cx}
              y1={t}
              y2={height - b}
              stroke="currentColor"
              strokeOpacity={0.55}
            />
            <circle
              cx={pin.cx}
              cy={pin.cy}
              r={4.5}
              fill="var(--bg)"
              stroke="var(--mark)"
              strokeWidth={2}
            />
          </g>
        )}
      </g>
      {pin && (
        <text
          data-annotation
          x={pin.at}
          y={pin.y}
          textAnchor={pin.anchor}
          {...word}
          {...halo}
          fill="var(--ink)"
        >
          {pin.text}
        </text>
      )}
      <rect
        data-overlay
        x={l}
        y={t}
        width={width - l - r}
        height={height - t - b}
        fill="transparent"
        style={{ cursor: "crosshair" }}
        onMouseMove={(e) => {
          onHover(beatAt(e));
          hoverLine(e);
        }}
        onMouseLeave={() => {
          onHover(null);
          hoverLine(null);
        }}
        onClick={(e) => {
          const i = beatAt(e);
          if (i !== null) onPin(i);
        }}
      />
    </svg>
  );
}
