import { describe, expect, it } from "vitest";
import { REPLY_PLACEHOLDER, displayName, replyStarter, stateLabel, timeAgo } from "./feedback";

describe("feedback display", () => {
  it("shows first name and last initial to super admins, first name only to admins", () => {
    const p = { firstName: "Dana", lastInitial: "K" };
    expect(displayName(p, true)).toBe("Dana K.");
    expect(displayName(p, false)).toBe("Dana");
    expect(displayName({ firstName: null, lastInitial: null }, true)).toBe("A member");
  });
  it("labels health state for super admins only", () => {
    expect(stateLabel("hidden", true)).toBe("Health details hidden");
    expect(stateLabel("shared", true)).toBe("Health details shared with consent");
    expect(stateLabel("before_question", true)).toBe("Sent before consent question");
    expect(stateLabel("none", true)).toBeNull();
    expect(stateLabel("hidden", false)).toBeNull();
    expect(stateLabel("before_question", false)).toBeNull();
  });
  it("formats relative time", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    expect(timeAgo("2026-10-12T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-12T11:15:00Z", now)).toBe("45m ago");
    expect(timeAgo("2026-10-12T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-09T12:00:00Z", now)).toBe("3d ago");
  });
  it("starter uses the topic, falls back to the theme, and never blocks send when filled", () => {
    expect(replyStarter("Dana", "none", "the new cycle chart", "feature")).toBe(
      "Hi Dana, thank you for your feedback! We read your note about the new cycle chart.",
    );
    expect(replyStarter("Dana", "none", null, "bug")).toContain("about the issue you hit.");
    expect(replyStarter("Dana", "none", null, "feature")).toContain("about your feature idea.");
    expect(replyStarter("Dana", "none", null, "praise")).toContain("about your kind words.");
    expect(replyStarter("Dana", "none", null, "content")).toContain("about the content.");
    expect(replyStarter("Dana", "none", "  ", "other")).toContain("about what you shared.");
    expect(replyStarter(null, "none", "the login screen", "bug")).toMatch(/^Hi, thank you/);
    expect(replyStarter("Dana", "none", null, "other")).not.toContain(REPLY_PLACEHOLDER);
  });
  it("hidden health details add the second paragraph, with no em dashes anywhere", () => {
    const hidden = replyStarter("Dana", "hidden", "the new cycle chart", "feature");
    expect(hidden).toBe(
      "Hi Dana, thank you for your feedback! We read your note about the new cycle chart.\n\nYou chose to keep some health details private, so we didn't see those parts. That's completely fine.",
    );
    expect(hidden).not.toMatch(/[\u2014\u2013]/);
    expect(replyStarter("Dana", "shared", "x y z", "bug")).not.toContain("health details private");
  });
});
