import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerInputProps {
  onSubmit: (date: Date) => void;
  isSubmitting: boolean;
}

export const DatePickerInput = ({ onSubmit, isSubmitting }: DatePickerInputProps) => {
  const [date, setDate] = useState<Date | undefined>(undefined);

  const handleSubmit = () => {
    if (date) {
      onSubmit(date);
    }
  };

  return (
    <div className="flex items-center gap-3 p-4 bg-card/50 rounded-2xl border border-border">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "flex-1 justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            disabled={(d) => d > new Date()}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      
      <Button
        onClick={handleSubmit}
        disabled={!date || isSubmitting}
        size="icon"
        className="h-10 w-10 shrink-0"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );
};
