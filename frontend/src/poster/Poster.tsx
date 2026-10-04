import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Analysis, Axis } from "../types";
import { Icon } from "../components/icons";
import { loadFonts } from "./font";
import { posterSvg, SIZES, type Fonts, type Palette, type Size } from "./export";
import { svgToPng } from "./svg";
import { actionPill, boxButton, segment, textButton } from "../lib/ui";
import { downloadBlob, sanitizeFilename } from "../lib/download";

const NO_FONTS: Fonts = { title: "", text: "", italic: "" };
const SIZE_NAMES: Record<Size, string> = {
  portrait: "Portrait",
  landscape: "Landscape",
  square: "Square",
};
const PALETTE_NAMES: Record<Palette, string> = { paper: "Paper", ink: "Ink" };

type PosterProps = {
  title: string;
  subtitle: string;
  analysis: Analysis;
  // The layers drawn beside fortune, as selected in the viewer.
  axes: Axis[];
};

function Choice<T extends string>({
  label,
  names,
  value,
  onChange,
}: {
  label: string;
  names: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  const uid = useId();
  return (
    <fieldset aria-label={label} className={segment.group}>
      {(Object.keys(names) as T[]).map((k) => (
        <label key={k} className={segment.option}>
          <input
            type="radio"
            name={uid}
            className="sr-only"
            checked={value === k}
            onChange={() => onChange(k)}
          />
          {names[k]}
        </label>
      ))}
    </fieldset>
  );
}

// The poster dialog, modal from its first render; onClose runs however it closes.
function PosterDialog({
  title,
  subtitle,
  analysis,
  axes,
  onClose,
}: PosterProps & { onClose: () => void }) {
  const [size, setSize] = useState<Size>("portrait");
  // The poster starts in the palette of the theme the site resolved, dark by default.
  const [palette, setPalette] = useState<Palette>(() =>
    document.documentElement.dataset.theme === "light" ? "paper" : "ink",
  );
  const [pngFailed, setPngFailed] = useState(false);
  // A download in progress holds both buttons, so a press while the fonts load does not queue another.
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    dialogRef.current?.showModal();
    // The fonts are fetched as the dialog opens, so a download rarely waits for them.
    loadFonts().catch(() => {});
  }, []);
  const poster = (fonts: Fonts) =>
    posterSvg({ title, subtitle, analysis, axes, size, palette, fonts });
  // A download waits for the fonts, so the PNG is never drawn in a fallback face; without them it still downloads.
  const withFonts = () => loadFonts().catch(() => NO_FONTS);
  const download = (blob: Blob, ext: string) =>
    downloadBlob(blob, `${sanitizeFilename(title)}.${ext}`);
  const hold = (p: Promise<unknown>) => {
    setBusy(true);
    void p.finally(() => setBusy(false));
  };
  const [W, H] = SIZES[size];
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded-lg border border-[var(--rule)] bg-[var(--paper)] p-5 text-[var(--ink)] backdrop:bg-black/40"
      aria-labelledby={heading}
    >
      <div className="mb-4 flex items-center gap-3">
        <h2 id={heading} className="serif opsz-14 text-[22px] font-medium">
          Poster
        </h2>
        <button
          className={`${textButton} ml-auto min-w-[40px] justify-center`}
          onClick={() => dialogRef.current?.close()}
          aria-label="Close"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {/* The preview keeps the poster's proportions and fits whole, a print laid on the dialog. */}
      <div className="flex justify-center">
        <div
          aria-label={`${SIZE_NAMES[size]} poster preview, ${PALETTE_NAMES[palette].toLowerCase()}`}
          role="img"
          className="w-full shadow-[0_6px_28px_var(--shadow)] ring-1 ring-[var(--rule)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          style={{ aspectRatio: `${W} / ${H}`, maxWidth: `calc(58dvh * ${W / H})` }}
          dangerouslySetInnerHTML={{ __html: poster(NO_FONTS) }}
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 text-[13px]">
        <Choice label="Size" names={SIZE_NAMES} value={size} onChange={setSize} />
        <Choice label="Palette" names={PALETTE_NAMES} value={palette} onChange={setPalette} />
        <span className="ml-auto inline-flex items-center gap-3">
          <button
            className={boxButton}
            disabled={busy}
            onClick={() =>
              hold(
                withFonts().then((f) =>
                  download(new Blob([poster(f)], { type: "image/svg+xml" }), "svg"),
                ),
              )
            }
          >
            Download SVG
          </button>
          <button
            className={actionPill}
            disabled={busy}
            onClick={() => {
              setPngFailed(false);
              hold(
                withFonts()
                  .then((f) => svgToPng(poster(f), W, H))
                  .then(
                    (b) => download(b, "png"),
                    () => setPngFailed(true),
                  ),
              );
            }}
          >
            Download PNG
          </button>
        </span>
      </div>
      {pngFailed && (
        <p role="alert" className="mt-3 text-[14px] text-[var(--bad)]">
          The PNG could not be made in this browser; the SVG should still download.
        </p>
      )}
      <p className="serif mt-3 text-[14px] italic text-[var(--muted)]">
        A poster carries the curves, the events, the scores and chapter names, never the text.
      </p>
    </dialog>
  );
}

// The trigger takes its look and any icon from where it sits.
export default function PosterButton({
  className = textButton,
  children,
  ...props
}: PosterProps & { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {children}
        Poster
      </button>
      {open && <PosterDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
