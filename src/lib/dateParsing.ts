import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

export type ParsedDateResult =
  | { kind: "exact"; date: Date; echo: string; error: null }
  | { kind: "month"; month: Date; echo: string; error: null }
  | { kind: "empty"; error: null }
  | { kind: "error"; error: string };

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const formatDateEcho = (d: Date) => format(d, "d MMMM yyyy");
export const formatMonthEcho = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

const isValidDate = (d: Date) => !Number.isNaN(d.getTime());

const makeDate = (year: number, monthIndex: number, day: number): Date | null => {
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(year, monthIndex, day, 12, 0, 0, 0);
  if (!isValidDate(d) || d.getMonth() !== monthIndex || d.getDate() !== day) return null;
  return d;
};

const normalizeYear = (raw: number): number => {
  if (raw >= 1000) return raw;
  if (raw >= 100) return raw; // unlikely, keep as-is
  // two-digit year: assume recent past/near future
  const currentTwo = new Date().getFullYear() % 100;
  return raw <= currentTwo + 5 ? 2000 + raw : 1900 + raw;
};

interface ParseOptions {
  isDueDate?: boolean;
  minDate?: Date;
  maxDate?: Date;
}

const rangeError = (date: Date, minDate?: Date, maxDate?: Date): string | null => {
  if (maxDate && date > endOfDay(maxDate)) {
    return date > endOfDay(new Date())
      ? "That date's in the future"
      : `That date is outside the allowed range`;
  }
  if (minDate && date < startOfDay(minDate)) {
    return "That date is outside the allowed range";
  }
  return null;
};

/**
 * Parses a typed date. Returns either an exact date (safe to save),
 * a month to navigate the calendar to (day still required), or an error.
 */
export function parseTypedDate(input: string, options: ParseOptions = {}): ParsedDateResult {
  const { isDueDate = false, minDate, maxDate } = options;
  const raw = (input || "").trim();
  if (!raw) return { kind: "empty", error: null };

  const lower = raw.toLowerCase();
  const now = new Date();

  const exact = (d: Date): ParsedDateResult => {
    const err = rangeError(d, minDate, maxDate);
    if (err) return { kind: "error", error: err };
    return { kind: "exact", date: startOfDay(d), echo: formatDateEcho(d), error: null };
  };

  const monthJump = (d: Date): ParsedDateResult => {
    const first = startOfMonth(d);
    const last = endOfMonth(d);
    if (maxDate && first > endOfDay(maxDate)) {
      return {
        kind: "error",
        error: first > endOfDay(now) ? "That date's in the future" : "That date is outside the allowed range",
      };
    }
    if (minDate && last < startOfDay(minDate)) {
      return { kind: "error", error: "That date is outside the allowed range" };
    }
    return { kind: "month", month: first, echo: formatMonthEcho(first), error: null };
  };

  // today / yesterday — exact
  if (/\btoday\b/.test(lower)) return exact(now);
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return exact(d);
  }

  // relative: "16 months ago", "2 weeks ago", "in 3 months" (due date)
  const agoMatch = lower.match(/(\d{1,3})\s*(day|week|month|year)s?\s*ago\b/);
  if (agoMatch) {
    const num = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2];
    const d = new Date(now);
    if (unit === "day") d.setDate(d.getDate() - num);
    else if (unit === "week") d.setDate(d.getDate() - num * 7);
    else if (unit === "month") d.setMonth(d.getMonth() - num);
    else d.setFullYear(d.getFullYear() - num);
    return monthJump(d);
  }

  const inMatch = lower.match(/\b(?:in\s*)?(\d{1,3})\s*(day|week|month)s?\s*(?:from now|away|to go|left)?\b/);
  if (isDueDate && inMatch && /(in\s|from now|away|to go|left)/.test(lower)) {
    const num = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const d = new Date(now);
    if (unit === "day") d.setDate(d.getDate() + num);
    else if (unit === "week") d.setDate(d.getDate() + num * 7);
    else d.setMonth(d.getMonth() + num);
    return monthJump(d);
  }

  // ISO: 2025-05-14
  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const d = makeDate(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
    if (!d) return { kind: "error", error: "Couldn't read that date, try '14 May 2025'" };
    return exact(d);
  }

  // ISO month: 2025-05
  const isoMonth = raw.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (isoMonth) {
    const m = parseInt(isoMonth[2], 10) - 1;
    if (m < 0 || m > 11) return { kind: "error", error: "Couldn't read that date, try '14 May 2025'" };
    return monthJump(new Date(parseInt(isoMonth[1], 10), m, 1, 12));
  }

  // Month name forms
  const monthNameMatch = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (monthNameMatch) {
    const monthIndex = MONTHS[monthNameMatch[1]];
    const numbers = (raw.match(/\d{1,4}/g) || []).map((n) => parseInt(n, 10));
    const yearNum = numbers.find((n) => n >= 1000);
    const dayNum = numbers.find((n) => n >= 1 && n <= 31 && n !== yearNum);

    const year = yearNum ?? (() => {
      // no year given: pick the nearest sensible year
      const candidate = new Date(now.getFullYear(), monthIndex, dayNum ?? 1, 12);
      if (isDueDate) {
        if (candidate < now) return now.getFullYear() + 1;
        return now.getFullYear();
      }
      if (candidate > now) return now.getFullYear() - 1;
      return now.getFullYear();
    })();

    if (dayNum !== undefined) {
      const d = makeDate(year, monthIndex, dayNum);
      if (!d) return { kind: "error", error: "Couldn't read that date, try '14 May 2025'" };
      return exact(d);
    }
    return monthJump(new Date(year, monthIndex, 1, 12));
  }

  // Numeric: 14/05/2025, 03/04/2025, 14-5-25
  const numeric3 = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numeric3) {
    const a = parseInt(numeric3[1], 10);
    const b = parseInt(numeric3[2], 10);
    const year = normalizeYear(parseInt(numeric3[3], 10));
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    const d = makeDate(year, month - 1, day);
    if (!d) return { kind: "error", error: "Couldn't read that date, try '14 May 2025'" };
    return exact(d);
  }

  // Numeric month/year: 05/2025
  const numeric2 = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (numeric2) {
    const m = parseInt(numeric2[1], 10) - 1;
    if (m < 0 || m > 11) return { kind: "error", error: "Couldn't read that date, try '14 May 2025'" };
    return monthJump(new Date(parseInt(numeric2[2], 10), m, 1, 12));
  }

  return { kind: "error", error: "Couldn't read that date, try '14 May 2025'" };
}
