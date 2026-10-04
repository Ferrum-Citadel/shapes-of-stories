import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, errorMessage, getKey, keyRemembered, setKey } from "../api/client";
import { INDEX, forgetFile, galleryFile, keptFile, preloadWall } from "../lib/gallery";
import { analyzedBefore, saveLocal } from "../lib/local";
import { QUESTION_SET } from "../lib/definitions";
import type { GalleryEntry, LocalWork, Preview } from "../types";
import { boxButton, boxField, focusRingOffset, link, note, pageTitle } from "../lib/ui";
import KeyField, { plausibleKey } from "../components/KeyField";
import PreviewCard from "../components/PreviewCard";
import TextChoice from "../components/TextChoice";

export default function Import() {
  const [keepText, setKeepText] = useState(true);
  const nav = useNavigate();
  const [input, setInput] = useState<File | string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [seen, setSeen] = useState<LocalWork>();
  const [stopped, setStopped] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKeyState] = useState(() => getKey() ?? "");
  const [remember, setRemember] = useState(keyRemembered);
  const [busy, setBusy] = useState(false);
  const [gallery, setGallery] = useState<GalleryEntry[]>([]);
  useEffect(() => {
    galleryFile<GalleryEntry[]>(INDEX)
      .then(setGallery)
      .catch(() => forgetFile(INDEX));
  }, []);
  const fail = (e: unknown) => setErr(errorMessage(e));
  const inGallery = (p: Preview, g = gallery) => g.some((e) => e.content_hash === p.content_hash);
  // Any input change drops the preview, and a preview still on its way for an earlier input is ignored; Analyze saves the preview's text.
  const asked = useRef<File | string | null>(null);
  const pick = (i: File | string | null) => {
    asked.current = i;
    setInput(i);
    setPreview(null);
    setSeen(undefined);
    setStopped(false);
    setErr(null);
  };
  const doPreview = async () => {
    if (!input) return null;
    setErr(null);
    setBusy(true);
    try {
      const p = await api.preview(input);
      // A store the browser refuses only means the earlier analysis goes unmentioned.
      const s = await analyzedBefore(p.content_hash).catch(() => undefined);
      // A wall index still on its way is given its usual 300 ms, so a gallery book is not missed.
      await preloadWall();
      if (asked.current !== input) return null;
      const g = keptFile<GalleryEntry[]>(INDEX) ?? gallery;
      setGallery(g);
      setSeen(s);
      setPreview(p);
      return { p, known: !!s || inGallery(p, g) };
    } catch (e) {
      if (asked.current !== input) return null;
      setPreview(null);
      setSeen(undefined);
      fail(e);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const analyze = async () => {
    if (!input || !plausibleKey(key)) return;
    // Without a preview yet, Analyze takes one itself; a text analyzed before, here or in the gallery, stops at its card, which offers no second run.
    let p = preview;
    if (!p) {
      const r = await doPreview();
      if (r?.known) setStopped(true);
      if (!r || r.known) return;
      p = r.p;
    }
    setBusy(true);
    setKey(key, remember);
    const created = await api.createWork(input, key).catch((e: unknown) => {
      fail(e);
      setBusy(false);
      return null;
    });
    if (!created) return;
    // The run is under way on the key by now, so a failed save here must not offer a second one; the passages just will not open.
    await saveLocal({
      id: created.work_id,
      title: p.title,
      author: p.author,
      text: keepText ? p.normalized_text : "",
      content_hash: p.content_hash,
      structure: created.structure,
      analysis: null,
      answers: {},
      savedAt: Date.now(),
      // The server stamps the same set on a new work; the refresh corrects it after a restart.
      question_set_version: QUESTION_SET,
    }).catch(() => {});
    void nav(`/works/${created.work_id}`, { viewTransition: true });
  };
  // A preview failure belongs under the input; once a preview exists, the failure came from the analysis and belongs under the key.
  const errorLine = err && (
    <p role="alert" className="text-[13px] text-[var(--bad)]">
      {err}
    </p>
  );
  return (
    <div className="max-w-[40rem] space-y-5">
      <title>Analyze a book · Shapes of Stories</title>
      <h1 className={pageTitle}>Analyze a book</h1>
      <div className="space-y-3">
        <label
          className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--rule)] px-4 py-6 text-center hover:border-[var(--muted)] ${focusRingOffset}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) pick(f);
          }}
        >
          {/* A touch screen has nothing to drop a file with. */}
          <span className="serif opsz-14 text-[17px] [@media(pointer:coarse)]:hidden">
            Drop a book here, or paste it below.
          </span>
          <span className="serif opsz-14 hidden text-[17px] [@media(pointer:coarse)]:inline">
            Choose a book, or paste it below.
          </span>
          <span className={note}>
            txt, md, epub, docx, Fountain screenplay, srt or vtt subtitles
          </span>
          {input && typeof input !== "string" && <span className="text-[13px]">{input.name}</span>}
          {/* Emptied after each pick, so choosing the same file again after an edit still counts. */}
          <input
            type="file"
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          aria-label="paste text"
          className={`serif opsz-14 h-32 text-[15px] ${boxField}`}
          value={typeof input === "string" ? input : ""}
          onChange={(e) => pick(e.target.value || null)}
        />
        <button
          type="button"
          className={`block ${boxButton}`}
          disabled={!input || busy}
          onClick={() => void doPreview()}
        >
          Preview
        </button>
        {!preview && errorLine}
      </div>
      <div aria-live="polite" className="empty:sr-only">
        {preview && (
          <PreviewCard preview={preview} gallery={gallery} seen={seen} stopped={stopped} />
        )}
      </div>
      <div className="space-y-2">
        <KeyField value={key} onChange={setKeyState} remember={remember} onRemember={setRemember} />
        {preview && errorLine}
      </div>
      <TextChoice keep={keepText} onKeep={setKeepText} />
      <p className={note}>
        Private analysis: your text and key are deleted when analysis finishes; results vanish in
        one hour unless you Keep them. Passages are sent to TypeSafe for scoring under your own
        agreement with them.{" "}
        <Link className={link} to="/privacy" viewTransition>
          How this works
        </Link>
        .
      </p>
      {!(seen || (preview && inGallery(preview))) && (
        <button
          type="button"
          className="min-h-[40px] rounded-md bg-[var(--ink)] px-4 py-2 text-[var(--bg)] hover:opacity-90 disabled:opacity-40"
          disabled={!input || !plausibleKey(key) || busy}
          onClick={() => void analyze()}
        >
          Analyze
        </button>
      )}
    </div>
  );
}
