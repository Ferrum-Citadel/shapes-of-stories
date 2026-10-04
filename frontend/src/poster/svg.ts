// Control characters are illegal in XML and would blank the whole file, so they go before escaping.
const xmlChar = (c: string) => {
  const n = c.codePointAt(0)!;
  return (n >= 0x20 || n === 0x9 || n === 0xa || n === 0xd) && n !== 0xfffe && n !== 0xffff;
};
export const esc = (s: string) =>
  [...s]
    .filter(xmlChar)
    .join("")
    .replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
export function wrap(text: string, width: number, size: number, em: number, max: number): string[] {
  const per = Math.max(1, Math.floor(width / (size * em)));
  const lines: string[] = [];
  // A word longer than a line is cut into line-long pieces.
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => w.match(new RegExp(`.{1,${per}}`, "gu")) ?? []);
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= per)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length <= max) return lines;
  const cut = lines.slice(0, max);
  const end = cut[max - 1].replace(/[\s,;:.]+$/, "");
  // The ellipsis takes the last word's place only when it would not fit beside it.
  const shorter = end.includes(" ")
    ? end.replace(/\s+\S+$/, "").replace(/[\s,;:.]+$/, "")
    : end.slice(0, per - 1);
  cut[max - 1] = `${end.length + 1 <= per ? end : shorter}…`;
  return cut;
}
export const text = (x: number, y: number, size: number, fill: string, body: string, extra = "") =>
  `<text x="${x}" y="${y}" font-family="Fraunces" font-size="${size}" fill="${fill}" ${extra}>${body}</text>`;
export const lines = (
  ls: string[],
  x: number,
  y: number,
  size: number,
  lead: number,
  fill: string,
  extra = "",
) => ls.map((l, i) => text(x, y + i * lead, size, fill, esc(l), extra)).join("");
export const label = (x: number, y: number, fill: string, body: string, anchor = "start") =>
  text(x, y, 13, fill, body, `letter-spacing="2.2" text-anchor="${anchor}"`);

export async function svgToPng(svg: string, w: number, h: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("svg render failed"));
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
