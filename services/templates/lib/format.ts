/**
 * Date formatting for posters.
 *
 * Deliberately hand-rolled rather than `toLocaleDateString`. The preview iframe
 * runs in the person's browser and the render runs in a headless Chromium with
 * a fixed locale and timezone, so anything locale-aware would show one date
 * while typing and print another. A fixed table is the only way the preview can
 * promise what the PNG will say.
 *
 * The value is parsed as calendar parts, never as a Date, so a poster dated
 * "2026-08-30" cannot slide to the 29th because the renderer sits west of UTC.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type Parts = { year: number; month: number; day: number };

function parse(iso: string | undefined): Parts | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** "Saturday 30 August" — the way a church notice sheet says it. */
export function formatPosterDate(iso: string | undefined): string | null {
  const parts = parse(iso);
  if (!parts) return null;

  // Zeller's congruence. Avoids constructing a Date, so no timezone anywhere.
  const { year, month, day } = parts;
  const m = month < 3 ? month + 12 : month;
  const y = month < 3 ? year - 1 : year;
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h =
    (day + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
  // Zeller returns 0 = Saturday.
  const weekday = DAYS[(h + 6) % 7];

  return `${weekday} ${day} ${MONTHS[month - 1]}`;
}

/** "30 August 2026" for contexts where the weekday is noise. */
export function formatLongDate(iso: string | undefined): string | null {
  const parts = parse(iso);
  if (!parts) return null;
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}
