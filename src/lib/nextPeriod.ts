import { addDays, differenceInCalendarDays, isValid, parseISO } from "date-fns";

/** Parses YYYY-MM-DD as local midnight (safe for differenceInCalendarDays). */
export function parseLocalDate(value: string, fallback: Date): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : fallback;
}

/**
 * Single source for the predicted next period, shared by the Cycle forecast
 * calendar and the Logan Today ring. Overdue cycles predict tomorrow; otherwise
 * periodStart + cycleLength.
 */
export function getNextPeriodStart(periodStart: Date, cycleLengthDays: number, today: Date): Date {
  const unwrappedDay = differenceInCalendarDays(today, periodStart) + 1;
  return unwrappedDay > cycleLengthDays ? addDays(today, 1) : addDays(periodStart, cycleLengthDays);
}

export function daysUntilNextPeriod(lastPeriodStart: string, cycleLengthDays: number, today = new Date()): number {
  const start = parseLocalDate(lastPeriodStart, today);
  return differenceInCalendarDays(getNextPeriodStart(start, cycleLengthDays, today), today);
}
