type Area = "localStorage" | "sessionStorage";
// With site data blocked even reaching the storage throws; a failed read is a miss and a failed write is dropped.
export function readStore(area: Area, key: string): string | null {
  try {
    return window[area].getItem(key);
  } catch {
    return null;
  }
}
export function writeStore(area: Area, key: string, value: string | null): void {
  try {
    if (value === null) window[area].removeItem(key);
    else window[area].setItem(key, value);
  } catch {
    /* blocked or full */
  }
}
export const hasSeen = (key: string) => readStore("localStorage", key) === "1";
export const markSeen = (key: string) => writeStore("localStorage", key, "1");
