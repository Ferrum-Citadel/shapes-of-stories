// The nearest whole unit ahead, from minutes up to days: "in 23 hours".
export function relativeTime(to: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat("en");
  const min = Math.max(1, Math.round((to - now) / 60_000));
  if (min < 60) return rtf.format(min, "minute");
  const h = Math.round(min / 60);
  return h < 48 ? rtf.format(h, "hour") : rtf.format(Math.round(h / 24), "day");
}
