import { clusterEvents } from "../chart/events";
import { xOf } from "../chart/ChartFrame";
import type { EventMarker } from "../types";

const at = (bin: number, probability: number, extra: Partial<EventMarker> = {}): EventMarker => ({
  type: "reveal",
  beat_idx: bin,
  bin,
  probability,
  strength: "strong",
  ...extra,
});

// At width 915 a bin is exactly 9 units wide, so bins read as distances.
const W = 915;

test("events within 24 units share a bead at the most probable one; one 30 units on starts the next", () => {
  const clusters = clusterEvents(
    [at(10, 0.6), at(11.1111, 0.9, { type: "death", beat_idx: 40 }), at(14.4444, 0.7)],
    W,
  );
  expect(clusters).toHaveLength(2);
  expect(clusters[0].members).toHaveLength(2);
  expect(clusters[0].top.type).toBe("death");
  expect(clusters[0].x).toBeCloseTo(xOf(11.1111, W), 6);
  expect(clusters[0].beat).toBe(40);
  expect(clusters[1].members).toHaveLength(1);
  expect(clusters[1].x - clusters[0].x).toBeCloseTo(30, 2);
});

test("faint events are never drawn", () => {
  expect(clusterEvents([at(10, 0.9, { strength: "faint" })], W)).toEqual([]);
  const clusters = clusterEvents([at(10, 0.4, { strength: "faint" }), at(50, 0.8)], W);
  expect(clusters.map((c) => c.members.length)).toEqual([1]);
});

test("the order of the input does not matter", () => {
  const a = [at(80, 0.7), at(10, 0.9), at(11, 0.5)];
  expect(clusterEvents(a, W)).toEqual(clusterEvents([...a].reverse(), W));
});

test("a dense book's beads are always at least 24 units apart and keep every event", () => {
  const dense = Array.from({ length: 600 }, (_, i) =>
    at((i * 99) / 599, 0.5 + 0.5 * Math.abs(Math.sin(i * 1.7)), { beat_idx: i }),
  );
  const clusters = clusterEvents(dense, 900);
  expect(clusters.length).toBeGreaterThan(10);
  for (let i = 1; i < clusters.length; i++)
    expect(clusters[i].x - clusters[i - 1].x).toBeGreaterThanOrEqual(24);
  expect(clusters.reduce((n, c) => n + c.members.length, 0)).toBe(600);
  for (const c of clusters)
    expect(Math.max(...c.members.map((m) => m.probability))).toBe(c.top.probability);
});
