import { describe, expect, it } from "vitest";
import { formatLongDate, formatPosterDate } from "./format";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

describe("formatPosterDate", () => {
  /**
   * The weekday comes from a hand-rolled Zeller's congruence rather than from
   * Date, because Date drags in the host timezone and the preview would then
   * disagree with the render. Hand-rolled means it has to be checked against
   * something independent.
   */
  it("agrees with UTC Date across four years, every day", () => {
    const mismatches: string[] = [];

    const cursor = new Date(Date.UTC(2024, 0, 1));
    const end = Date.UTC(2028, 0, 1);

    while (cursor.getTime() < end) {
      const iso = cursor.toISOString().slice(0, 10);
      const expected = WEEKDAYS[cursor.getUTCDay()];
      const got = formatPosterDate(iso)?.split(" ")[0];
      if (got !== expected) mismatches.push(`${iso}: got ${got}, expected ${expected}`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it("handles leap days", () => {
    expect(formatPosterDate("2024-02-29")).toBe("Thursday 29 February");
    expect(formatPosterDate("2028-02-29")).toBe("Tuesday 29 February");
  });

  it("handles a century boundary", () => {
    // 2000 was a leap year; 1900 was not. Zeller has to get both right.
    expect(formatPosterDate("2000-02-29")).toBe("Tuesday 29 February");
    expect(formatPosterDate("2100-03-01")).toBe("Monday 1 March");
  });

  it("does not shift the day for a timezone", () => {
    // The classic failure: parsing as a Date in a western zone rolls back a day.
    expect(formatPosterDate("2026-08-30")).toBe("Sunday 30 August");
    expect(formatPosterDate("2026-01-01")).toBe("Thursday 1 January");
  });

  it("accepts a full ISO timestamp, using only the calendar part", () => {
    expect(formatPosterDate("2026-08-30T23:30:00.000Z")).toBe("Sunday 30 August");
  });

  it("returns null for anything it cannot read", () => {
    expect(formatPosterDate(undefined)).toBeNull();
    expect(formatPosterDate("")).toBeNull();
    expect(formatPosterDate("30 August 2026")).toBeNull();
    expect(formatPosterDate("2026-13-01")).toBeNull();
    expect(formatPosterDate("2026-08-32")).toBeNull();
  });
});

describe("formatLongDate", () => {
  it("reads as a notice-sheet date", () => {
    expect(formatLongDate("2026-09-06")).toBe("6 September 2026");
    expect(formatLongDate("2026-12-25")).toBe("25 December 2026");
  });

  it("returns null for anything it cannot read", () => {
    expect(formatLongDate("nope")).toBeNull();
  });
});
