// Filenames only; the title itself is still shown verbatim wherever it appears.
export function sanitizeFilename(title: string, fallback = "poster"): string {
  // Control characters are exactly what a filename must not carry.
  // eslint-disable-next-line no-control-regex
  const clean = title.replace(/[/\\\x00-\x1f]/g, "_").trim();
  // Cut to 120 code points, so a long title gives a name of usual length without splitting a character.
  return [...clean].slice(0, 120).join("").trimEnd() || fallback;
}
export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  // Some browsers start the download only after click returns, so the URL is let go a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
