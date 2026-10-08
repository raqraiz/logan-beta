import { describe, expect, it } from "vitest";
import { displayName, replyStarter, stateLabel, timeAgo } from "./feedback";

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
  it("starter has no em dash and uses her first name", () => {
    expect(replyStarter("Dana")).toMatch(/^Hi Dana, /);
    expect(replyStarter(null)).toMatch(/^Hi, /);
    expect(replyStarter("Dana")).not.toMatch(/[—–]/);
  });
});
