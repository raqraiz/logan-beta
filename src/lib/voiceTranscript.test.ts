import { describe, it, expect } from "vitest";
import { mergeTranscript, joinWithBase } from "./voiceTranscript";

const fold = (pieces: string[]) => pieces.reduce(mergeTranscript, "");

describe("mergeTranscript", () => {
  it("collapses Android cumulative finals", () => {
    expect(fold(["hey", "hey today", "hey today is", "hey today is a difficult day"])).toBe(
      "hey today is a difficult day",
    );
  });
  it("appends distinct desktop chunks with spaces", () => {
    expect(fold(["hello there", "how are you"])).toBe("hello there how are you");
  });
  it("ignores an exact repeat and empty pieces", () => {
    expect(fold(["it hurts", "it hurts", ""])).toBe("it hurts");
  });
});

describe("joinWithBase", () => {
  it("keeps typed text and adds dictation after it", () => {
    expect(joinWithBase("I feel ", "tired")).toBe("I feel tired");
    expect(joinWithBase("", "tired")).toBe("tired");
    expect(joinWithBase("typed", "")).toBe("typed");
  });
});
