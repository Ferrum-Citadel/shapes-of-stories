const cache = new Map<string, Promise<string>>();
// Chunked because spreading a whole font into fromCharCode overflows Safari's 65536-argument limit.
const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
function dataUri(path: string): Promise<string> {
  if (!cache.has(path))
    cache.set(
      path,
      fetch(path)
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.arrayBuffer();
        })
        .then((buf) => `data:font/woff2;base64,${toBase64(buf)}`)
        .catch((e) => {
          cache.delete(path);
          throw e;
        }),
    );
  return cache.get(path)!;
}
export const loadFonts = () =>
  Promise.all([
    dataUri("/fonts/Fraunces-600.woff2"),
    dataUri("/fonts/Fraunces-Variable.woff2"),
    dataUri("/fonts/Fraunces-Italic-Variable.woff2"),
  ]).then(([title, text, italic]) => ({ title, text, italic }));
