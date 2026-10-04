import { useCallback, useEffect, useRef, useState } from "react";

type Run = { paras: string[]; state: "playing" | "paused"; index: number };

// Only a voice that runs on the device may read the text, since a network voice would send it away; the texts are English.
function localVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window.speechSynthesis === "undefined") return undefined;
  const local = window.speechSynthesis.getVoices().filter((v) => v.localService);
  const english = local.filter((v) => v.lang.startsWith("en"));
  return english.find((v) => v.default) ?? english[0] ?? local.find((v) => v.default) ?? local[0];
}

// One utterance per paragraph so the one being read can be shown; pause is cancel plus the index because iOS ignores pause().
export function useReadAloud(paragraphs: string[]) {
  const [supported, setSupported] = useState(() => localVoice() !== undefined);
  // The voice list often arrives after the page loads.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (typeof synth === "undefined") return;
    const check = () => setSupported(localVoice() !== undefined);
    check();
    synth.addEventListener("voiceschanged", check);
    return () => synth.removeEventListener("voiceschanged", check);
  }, []);
  const [run, setRun] = useState<Run | null>(null);
  // Each start or stop bumps the generation, so the end event of a cancelled utterance is ignored.
  const gen = useRef(0);
  // Held so Chrome cannot collect the utterance mid-speech and drop its end event.
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const halt = useCallback(() => {
    gen.current++;
    current.current = null;
    if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel();
  }, []);
  useEffect(() => halt, [paragraphs, halt]);
  // A run started on other paragraphs is over, whatever its last state.
  const live = run && run.paras === paragraphs ? run : null;

  const playFrom = (start: number) => {
    halt();
    const voice = localVoice();
    if (!voice) {
      setSupported(false);
      setRun(null);
      return;
    }
    const g = gen.current;
    const say = (i: number) => {
      if (g !== gen.current) return;
      if (i >= paragraphs.length) {
        current.current = null;
        setRun(null);
        return;
      }
      setRun({ paras: paragraphs, state: "playing", index: i });
      const u = new SpeechSynthesisUtterance(paragraphs[i]);
      u.voice = voice;
      u.onend = () => say(i + 1);
      u.onerror = () => {
        if (g === gen.current) setRun(null);
      };
      current.current = u;
      window.speechSynthesis.speak(u);
    };
    say(start);
  };

  const toggle = () => {
    if (!live) playFrom(0);
    else if (live.state === "paused") playFrom(live.index);
    else {
      halt();
      setRun({ ...live, state: "paused" });
    }
  };
  const stop = () => {
    halt();
    setRun(null);
  };
  return {
    supported,
    state: live?.state ?? ("idle" as const),
    index: live?.index ?? null,
    toggle,
    stop,
  };
}
