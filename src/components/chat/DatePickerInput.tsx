import { useState } from "react";
import { format, startOfDay, subYears } from "date-fns";
import { CalendarIcon, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseTypedDate, formatDateEcho, formatMonthEcho } from "@/lib/dateParsing";

interface DatePickerInputProps {
  onSubmit: (date: Date) => void;
  isSubmitting: boolean;
  minDate?: Date;
  maxDate?: Date;
  isDueDate?: boolean;
}

export const DatePickerInput = ({
  onSubmit,
  isSubmitting,
  minDate,
  maxDate,
  isDueDate = false,
}: DatePickerInputProps) => {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [monthView, setMonthView] = useState<Date | undefined>(undefined);

  // Bounds shared by the calendar dropdowns AND the typed-input validation.
  const today = new Date();
  const fromDate = minDate ?? subYears(today, 5);
  const toDate = maxDate ?? today;

  const handleTyped = (value: string) => {
    setTyped(value);
    const result = parseTypedDate(value, { isDueDate, minDate: fromDate, maxDate: toDate });

    if (result.kind === "empty") {
      setError(null);
      setHint(date ? `Selected: ${formatDateEcho(date)}` : null);
      return;
    }
    if (result.kind === "error") {
      setError(result.error);
      setHint(null);
      setDate(undefined);
      return;
    }
    if (result.kind === "exact") {
      setError(null);
      setDate(result.date);
      setHint(`${formatDateEcho(result.date)} — tap send to confirm`);
      return;
    }
    // month-only or relative: needs a specific day
    setError(null);
    setDate(undefined);
    setMonthView(result.month);
    setHint(`Pick the day in ${formatMonthEcho(result.month)}`);
    setOpen(true);
  };

  const handleSelect = (d: Date | undefined) => {
    setDate(d);
    setError(null);
    setHint(d ? `Selected: ${formatDateEcho(d)}` : null);
    if (d) setOpen(false);
  };

  const isOutOfRange = (d: Date) =>
    d < startOfDay(fromDate) || d > startOfDay(toDate);

  const canSubmit = !!date && !isOutOfRange(date) && !error && !isSubmitting;

  const handleSubmit = () => {
    if (date && !isOutOfRange(date)) onSubmit(date);
  };

  return (
    <div className="p-4 bg-card/50 rounded-2xl border border-border space-y-3">
      <div>
        <Input
          value={typed}
          onChange={(e) => handleTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          inputMode="text"
          placeholder="Type a date, e.g. 14 May 2025"
          className="h-11 text-base"
          aria-label="Type a date"
        />
        {error && (
          <p className="mt-1.5 text-xs text-destructive">{error}</p>
        )}
        {!error && hint && (
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "flex-1 h-11 justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">{date ? format(date, "PPP") : "Pick a date"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleSelect}
              month={monthView}
              onMonthChange={setMonthView}
              defaultMonth={date ?? (isDueDate ? today : toDate)}
              captionLayout="dropdown-buttons"
              fromDate={fromDate}
              toDate={toDate}
              disabled={(d) => isOutOfRange(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="icon"
          className="h-11 w-11 shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
