import { act, renderHook, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import { timeLeft, useWork } from "../pages/useWork";
import { loadLocal, saveLocal } from "../lib/local";
import type { BeatAnswers, WorkView } from "../types";
import { FakeES, blockIndexedDB, fakeAnalysis, fakeWork, json } from "./fixtures";

beforeEach(() => {
  FakeES.instances = [];
  vi.stubGlobal("EventSource", FakeES);
});

// A work waiting in the queue for its three passages.
const queued = () =>
  fakeWork({
    state: "queued",
    kept: false,
    total: 3,
    completed_at: null,
    model_id: null,
    queue_position: 2,
  });

test("opens one EventSource across repeated beat events", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(queued())),
  );

  renderHook(() => useWork("w1"));
  await waitFor(() => expect(FakeES.instances.length).toBe(1));
  const es = FakeES.instances[0];

  act(() => es.emit("beat", { idx: 0, answers: { missing: true, error: "x" }, done: 1, total: 3 }));
  act(() => es.emit("beat", { idx: 1, answers: { missing: true, error: "x" }, done: 2, total: 3 }));
  act(() => es.emit("beat", { idx: 2, answers: { missing: true, error: "x" }, done: 3, total: 3 }));

  expect(FakeES.instances.length).toBe(1);
});

test("snapshot replaces queue_position, done, total, and state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(queued())),
  );
  const { result } = renderHook(() => useWork("w1"));
  await waitFor(() => expect(FakeES.instances.length).toBe(1));
  const es = FakeES.instances[0];
  act(() =>
    es.emit("snapshot", { state: "running", done: 1, total: 3, beats: [], queue_position: null }),
  );
  await waitFor(() => {
    expect(result.current.state).toBe("running");
    expect(result.current.done).toBe(1);
    expect(result.current.queuePosition).toBeNull();
  });
});

test("a terminal state event refreshes work.state, and a later Resume (failed -> queued) reopens the stream", async () => {
  let getWorkState: "queued" | "failed" = "queued";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ ...queued(), state: getWorkState })),
  );
  const { result } = renderHook(() => useWork("w1"));
  await waitFor(() => expect(FakeES.instances.length).toBe(1));
  const es = FakeES.instances[0];

  // SSE reports the job failed; the server (getWork) agrees when the onState-triggered refresh runs.
  getWorkState = "failed";
  act(() => es.emit("state", { state: "failed", error: "key_rejected" }));
  await waitFor(() => expect(result.current.state).toBe("failed"));
  expect(FakeES.instances.length).toBe(1);

  // Resume succeeds server-side; Work.tsx's Resume button calls the hook's refresh() the same way.
  getWorkState = "queued";
  await act(async () => {
    await result.current.refresh();
  });
  await waitFor(() => expect(FakeES.instances.length).toBe(2));
});

test("restores answers from the local record on revisit, before any SSE event", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ ...queued(), id: "w9" })),
  );
  const localAnswers: Record<number, BeatAnswers> = {
    0: { missing: true, error: "x" },
    1: { missing: true, error: "y" },
  };
  await saveLocal({
    id: "w9",
    title: null,
    author: null,
    text: "",
    structure: queued().structure,
    analysis: null,
    answers: localAnswers,
    savedAt: 1,
  });
  const { result } = renderHook(() => useWork("w9"));
  await waitFor(() => expect(result.current.answers).toEqual(localAnswers));
});

// The first answer from the server says the work is running; every later one fails.
function serverThenDown(over: Partial<WorkView> = {}) {
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ++calls === 1
        ? new Response(JSON.stringify({ ...queued(), state: "running", ...over }), {
            status: 200,
          })
        : new Response("{}", { status: 500 }),
    ),
  );
  return () => calls;
}

test("a finished analysis and every answer are kept on this device even when the refresh after it fails", async () => {
  serverThenDown({ id: "w5" });
  await saveLocal({
    id: "w5",
    title: null,
    author: null,
    text: "t",
    structure: queued().structure,
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  renderHook(() => useWork("w5"));
  await waitFor(() => expect(FakeES.instances.length).toBe(1));
  const answers: BeatAnswers = { missing: true, error: "x" };
  act(() => {
    FakeES.last.emit("beat", { idx: 0, answers, done: 1, total: 1 });
    FakeES.last.emit("complete", { analysis: fakeAnalysis() });
  });
  await waitFor(async () => {
    const l = await loadLocal("w5");
    expect(l?.analysis).toEqual(fakeAnalysis());
    expect(l?.answers).toEqual({ 0: answers });
    expect(l?.text).toBe("t");
  });
});

test("when the refresh after a failed run fails too, the page keeps what the stream said", async () => {
  const calls = serverThenDown();
  const { result } = renderHook(() => useWork("w1"));
  await waitFor(() => expect(FakeES.instances.length).toBe(1));
  act(() => FakeES.last.emit("state", { state: "failed", error: "key_rejected" }));
  await waitFor(() => expect(calls()).toBe(2));
  expect(result.current.state).toBe("failed");
  expect(result.current.error).toBe("key_rejected");
});

test("with this device's store blocked the work still loads from the server", async () => {
  blockIndexedDB();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(queued())),
  );
  const { result } = renderHook(() => useWork("w1"));
  await waitFor(() => expect(result.current.work?.id).toBe("w1"));
  expect(result.current.local).toBeUndefined();
});

test("a work that finished while its page was closed is saved to this device on the next visit, with its question set, model and cost", async () => {
  await saveLocal({
    id: "w7",
    title: null,
    author: null,
    text: "t",
    structure: queued().structure,
    analysis: null,
    answers: {},
    savedAt: 1,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...queued(),
            id: "w7",
            state: "complete",
            analysis: fakeAnalysis(),
            model_id: "m",
          }),
          { status: 200 },
        ),
    ),
  );
  renderHook(() => useWork("w7"));
  await waitFor(async () => {
    const l = await loadLocal("w7");
    expect(l?.analysis).toEqual(fakeAnalysis());
    expect(l?.text).toBe("t");
    expect([l?.question_set_version, l?.model_id, l?.cost_usd]).toEqual(["v1", "m", 0.02]);
  });
  expect(FakeES.instances).toHaveLength(0);
});

test("a finished copy saved before works carried their cost takes it on the next visit", async () => {
  await saveLocal({
    id: "w8",
    title: null,
    author: null,
    text: "t",
    structure: queued().structure,
    analysis: fakeAnalysis(),
    answers: {},
    savedAt: 1,
    question_set_version: "1",
    model_id: "m",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...queued(),
            id: "w8",
            state: "complete",
            analysis: fakeAnalysis(),
            model_id: "m",
          }),
          { status: 200 },
        ),
    ),
  );
  renderHook(() => useWork("w8"));
  await waitFor(async () => expect((await loadLocal("w8"))?.cost_usd).toBe(0.02));
});

test("the time left is the passages to go at the mean pace seen so far, and none before three are timed", () => {
  const start = { t: 10_000, done: 4 };
  expect(timeLeft(start, 12_000, 6, 50)).toBeNull();
  // Three passages in 1.5 s: 0.5 s each, 43 to go.
  expect(timeLeft(start, 11_500, 7, 50)).toBe(22);
  expect(timeLeft(start, 11_500, 50, 50)).toBe(0);
});

test("the stream's passages time the run from its snapshot", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(queued())),
  );
  const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
  const { result } = renderHook(() => useWork("w1"));
  await waitFor(() => expect(FakeES.instances.length).toBe(1));
  const es = FakeES.instances[0];
  act(() =>
    es.emit("snapshot", { state: "running", done: 2, total: 12, beats: [], queue_position: null }),
  );
  const beat = (done: number, at: number) => {
    now.mockReturnValue(at);
    act(() =>
      es.emit("beat", { idx: done, answers: { missing: true, error: "x" }, done, total: 12 }),
    );
  };
  beat(3, 1_200);
  beat(4, 1_400);
  expect(result.current.secondsLeft).toBeNull();
  beat(5, 1_600);
  // 0.2 s a passage over the three timed, 7 to go.
  expect(result.current.secondsLeft).toBe(1);
  beat(11, 4_000);
  // 3 s over 9 passages, 1 to go.
  expect(result.current.secondsLeft).toBe(0);
});

test("a pause drops the time left, and the pace is timed afresh after it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(queued())),
  );
  const now = vi.spyOn(Date, "now").mockReturnValue(0);
  const { result } = renderHook(() => useWork("w1"));
  await waitFor(() => expect(FakeES.instances.length).toBe(1));
  const es = FakeES.instances[0];
  act(() =>
    es.emit("snapshot", { state: "running", done: 0, total: 20, beats: [], queue_position: null }),
  );
  const beat = (done: number, at: number) => {
    now.mockReturnValue(at);
    act(() =>
      es.emit("beat", { idx: done, answers: { missing: true, error: "x" }, done, total: 20 }),
    );
  };
  [1, 2, 3].forEach((d) => beat(d, d * 100));
  expect(result.current.secondsLeft).toBe(2);
  act(() => es.emit("state", { state: "paused" }));
  expect(result.current.secondsLeft).toBeNull();
  // Sixty seconds of waiting do not count: after it, three passages at 0.1 s each again.
  [4, 5, 6, 7].forEach((d) => beat(d, 60_000 + d * 100));
  expect(result.current.secondsLeft).toBe(1);
});

test("a stream the browser gives up on mid-run is reopened, and one for an ended work is not", async () => {
  let state: WorkView["state"] = "running";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ ...queued(), state })),
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { result } = renderHook(() => useWork("w1"));
  await waitFor(() => expect(FakeES.instances.length).toBe(1));
  const drop = async () => {
    FakeES.last.readyState = FakeES.CLOSED;
    await act(async () => FakeES.last.emit("error", {}));
    await act(() => vi.advanceTimersByTimeAsync(2000));
  };
  await drop();
  expect(FakeES.instances.length).toBe(2);
  expect(result.current.state).toBe("running");
  state = "complete";
  await drop();
  expect(result.current.state).toBe("complete");
  expect(FakeES.instances.length).toBe(2);
});
