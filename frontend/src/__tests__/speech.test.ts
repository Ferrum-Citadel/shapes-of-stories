import { act, renderHook } from "@testing-library/react";
import { useReadAloud } from "../lib/speech";
import { stubSpeech, type FakeUtterance } from "./fixtures";

let spoken: FakeUtterance[];
let synth: ReturnType<typeof stubSpeech>["synth"];

beforeEach(() => ({ spoken, synth } = stubSpeech()));

const paras = ["One.", "Two.", "Three."];

test("plays paragraph by paragraph, pauses keeping its place, resumes there and stops", () => {
  const { result } = renderHook(() => useReadAloud(paras));
  expect(result.current.supported).toBe(true);
  expect(result.current.state).toBe("idle");
  act(() => result.current.toggle());
  expect(spoken.map((u) => u.text)).toEqual(["One."]);
  expect(spoken[0].voice?.name).toBe("Local");
  expect(result.current).toMatchObject({ state: "playing", index: 0 });
  act(() => spoken[0].onend!());
  expect(spoken.map((u) => u.text)).toEqual(["One.", "Two."]);
  expect(result.current.index).toBe(1);
  act(() => result.current.toggle());
  expect(synth.cancel).toHaveBeenCalled();
  expect(result.current).toMatchObject({ state: "paused", index: 1 });
  // The cancelled utterance's end must not move the queue on.
  act(() => spoken[1].onend!());
  expect(spoken).toHaveLength(2);
  act(() => result.current.toggle());
  expect(spoken.map((u) => u.text)).toEqual(["One.", "Two.", "Two."]);
  expect(result.current).toMatchObject({ state: "playing", index: 1 });
  const cancels = synth.cancel.mock.calls.length;
  act(() => result.current.stop());
  expect(synth.cancel.mock.calls.length).toBeGreaterThan(cancels);
  expect(result.current).toMatchObject({ state: "idle", index: null });
});

test("the last paragraph's end returns to idle", () => {
  const { result } = renderHook(() => useReadAloud(["Only."]));
  act(() => result.current.toggle());
  act(() => spoken[0].onend!());
  expect(result.current).toMatchObject({ state: "idle", index: null });
  expect(spoken).toHaveLength(1);
});

test("unmounting cancels the queue", () => {
  const { result, unmount } = renderHook(() => useReadAloud(paras));
  act(() => result.current.toggle());
  synth.cancel.mockClear();
  unmount();
  expect(synth.cancel).toHaveBeenCalled();
});

test("a new paragraphs array cancels the queue and returns to idle", () => {
  const { result, rerender } = renderHook(({ p }) => useReadAloud(p), {
    initialProps: { p: paras },
  });
  act(() => result.current.toggle());
  synth.cancel.mockClear();
  rerender({ p: ["Other."] });
  expect(synth.cancel).toHaveBeenCalled();
  expect(result.current).toMatchObject({ state: "idle", index: null });
  act(() => spoken[0].onend!());
  expect(spoken).toHaveLength(1);
});

test("without speechSynthesis it is unsupported", () => {
  vi.stubGlobal("speechSynthesis", undefined);
  const { result } = renderHook(() => useReadAloud(paras));
  expect(result.current.supported).toBe(false);
});

test("an error from the utterance being read returns to idle", () => {
  const { result } = renderHook(() => useReadAloud(paras));
  act(() => result.current.toggle());
  act(() => spoken[0].onerror!());
  expect(result.current).toMatchObject({ state: "idle", index: null });
  expect(spoken).toHaveLength(1);
});

test("stop while paused returns to idle", () => {
  const { result } = renderHook(() => useReadAloud(paras));
  act(() => result.current.toggle());
  act(() => result.current.toggle());
  expect(result.current.state).toBe("paused");
  act(() => result.current.stop());
  expect(result.current).toMatchObject({ state: "idle", index: null });
  act(() => result.current.toggle());
  expect(spoken.map((u) => u.text)).toEqual(["One.", "One."]);
});

test("a local English voice reads, the default first, never a network one", () => {
  const pick = (voices: Parameters<typeof stubSpeech>[0]) => {
    ({ spoken } = stubSpeech(voices));
    const { result, unmount } = renderHook(() => useReadAloud(paras));
    act(() => result.current.toggle());
    unmount();
    return spoken[0].voice?.name;
  };
  const network = { name: "Network", lang: "en-US", localService: false, default: true };
  expect(
    pick([
      network,
      { name: "French default", lang: "fr-FR", localService: true, default: true },
      { name: "English other", lang: "en-GB", localService: true, default: false },
      { name: "English default", lang: "en-US", localService: true, default: true },
    ]),
  ).toBe("English default");
  expect(
    pick([
      network,
      { name: "French default", lang: "fr-FR", localService: true, default: true },
      { name: "English", lang: "en-GB", localService: true, default: false },
    ]),
  ).toBe("English");
  expect(
    pick([
      network,
      { name: "French", lang: "fr-FR", localService: true, default: false },
      { name: "German default", lang: "de-DE", localService: true, default: true },
    ]),
  ).toBe("German default");
});

test("with only network voices it is unsupported, and it follows the voice list as it arrives", () => {
  ({ synth } = stubSpeech([
    { name: "Network", lang: "en-US", localService: false, default: true },
  ]));
  const { result } = renderHook(() => useReadAloud(paras));
  expect(result.current.supported).toBe(false);
  synth.voices = [];
  act(() => synth.fireVoicesChanged());
  expect(result.current.supported).toBe(false);
  synth.voices = [{ name: "Local", lang: "it-IT", localService: true, default: false }];
  act(() => synth.fireVoicesChanged());
  expect(result.current.supported).toBe(true);
});

test("a voice list that fills in before the listener is added is still read", () => {
  ({ synth } = stubSpeech([]));
  let calls = 0;
  const local = [{ name: "Local", lang: "en-US", localService: true, default: true }];
  synth.getVoices = () => (calls++ ? local : []);
  const { result } = renderHook(() => useReadAloud(paras));
  expect(result.current.supported).toBe(true);
});
