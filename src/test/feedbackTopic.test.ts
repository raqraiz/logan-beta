import { describe, expect, it } from "vitest";
import { tidyTopic } from "../../supabase/functions/_shared/feedbackClean";

describe("tidyTopic", () => {
  it("keeps 3 to 8 words, lowercases the start, drops the full stop and dashes", () => {
    expect(tidyTopic("The new cycle chart.")).toBe("the new cycle chart");
    expect(tidyTopic("reminders — arriving too late")).toBe("reminders, arriving too late");
    expect(tidyTopic("  the   login   screen  ")).toBe("the login screen");
  });
  it("rejects too short, too long, markers and non-strings", () => {
    expect(tidyTopic("charts")).toBeNull();
    expect(tidyTopic("one two three four five six seven eight nine")).toBeNull();
    expect(tidyTopic("my [health detail] and the app")).toBeNull();
    expect(tidyTopic(null)).toBeNull();
    expect(tidyTopic(42)).toBeNull();
  });
});
