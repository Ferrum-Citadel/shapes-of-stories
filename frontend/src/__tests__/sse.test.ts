import { watchWork } from "../lib/sse";
import { FakeES } from "./fixtures";

beforeEach(() => vi.stubGlobal("EventSource", FakeES));

test("dispatches events and closes on complete", () => {
  const got: string[] = [];
  watchWork("w1", "t/1", {
    onSnapshot: () => got.push("snap"),
    onBeat: (b) => got.push(`beat${b.idx}`),
    onState: (s) => got.push(s.state),
    onComplete: () => got.push("done"),
    onClosed: () => got.push("closed"),
  });
  const es = FakeES.last;
  // The owner's ticket rides in the query, escaped, since EventSource sends no headers.
  expect(es.url).toMatch(/\/api\/works\/w1\/events\?ticket=t%2F1$/);
  es.emit("snapshot", { state: "running", done: 0, total: 3, beats: [], queue_position: null });
  es.emit("beat", { idx: 0, answers: {}, done: 1, total: 3 });
  es.emit("complete", { analysis: { version: 1 } });
  expect(got).toEqual(["snap", "beat0", "done"]);
  expect(es.closed).toBe(true);
});

test("closes the stream when a terminal state event arrives", () => {
  watchWork("w3", "t", {
    onSnapshot: () => {},
    onBeat: () => {},
    onState: () => {},
    onComplete: () => {},
    onClosed: () => {},
  });
  const es = FakeES.last;
  es.emit("state", { state: "failed", error: "key_rejected" });
  expect(es.closed).toBe(true);
});

test("reports a stream the browser has given up on, and not one it is still retrying", () => {
  let closed = 0;
  watchWork("w2", "t", {
    onSnapshot: () => {},
    onBeat: () => {},
    onState: () => {},
    onComplete: () => {},
    onClosed: () => closed++,
  });
  const es = FakeES.last;
  es.emit("error", {});
  expect(closed).toBe(0);
  es.readyState = FakeES.CLOSED;
  es.emit("error", {});
  expect(closed).toBe(1);
});
