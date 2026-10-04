import { API_BASE } from "../api/client";
import type { Analysis, BeatAnswers, WorkState } from "../types";

export interface Snapshot {
  state: WorkState;
  done: number;
  total: number;
  beats: { idx: number; answers: BeatAnswers }[];
  queue_position: number | null;
}
type StateEvent = { state: WorkState; error?: string | null };
type BeatEvent = { idx: number; answers: BeatAnswers; done: number; total: number };
type Handlers = {
  onSnapshot(s: Snapshot): void;
  onBeat(b: BeatEvent): void;
  onState(s: StateEvent): void;
  onComplete(a: Analysis): void;
  onClosed(): void;
};
export const TERMINAL = new Set<WorkState>(["complete", "failed", "cancelled"]);

export function watchWork(id: string, ticket: string, h: Handlers): () => void {
  const es = new EventSource(
    `${API_BASE}/api/works/${encodeURIComponent(id)}/events?ticket=${encodeURIComponent(ticket)}`,
  );
  const on = <T>(name: string, f: (d: T) => void) =>
    es.addEventListener(name, (e) => f(JSON.parse((e as MessageEvent).data) as T));
  on<Snapshot>("snapshot", h.onSnapshot);
  on<BeatEvent>("beat", h.onBeat);
  on<StateEvent>("state", (s) => {
    h.onState(s);
    if (TERMINAL.has(s.state)) es.close();
  });
  on<{ analysis: Analysis }>("complete", (c) => {
    h.onComplete(c.analysis);
    es.close();
  });
  es.addEventListener("error", () => {
    // The browser reconnects on its own with Last-Event-ID, so only a stream it has given up on is reported.
    if (es.readyState === EventSource.CLOSED) h.onClosed();
  });
  return () => es.close();
}
