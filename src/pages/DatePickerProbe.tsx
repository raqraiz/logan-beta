import { subYears, addWeeks } from "date-fns";
import { DatePickerInput } from "@/components/chat/DatePickerInput";

// Temporary QA probe page for the date picker.
export default function DatePickerProbe() {
  return (
    <div className="p-4 space-y-8 bg-background min-h-screen">
      <div data-testid="postpartum">
        <p className="text-sm mb-2">Baby's birth date</p>
        <DatePickerInput
          onSubmit={(d) => console.log("SUBMIT postpartum", d.toISOString())}
          isSubmitting={false}
          minDate={subYears(new Date(), 5)}
          maxDate={new Date()}
        />
      </div>
      <div data-testid="due">
        <p className="text-sm mb-2">Due date</p>
        <DatePickerInput
          onSubmit={(d) => console.log("SUBMIT due", d.toISOString())}
          isSubmitting={false}
          minDate={new Date()}
          maxDate={addWeeks(new Date(), 42)}
          isDueDate
        />
      </div>
    </div>
  );
}
