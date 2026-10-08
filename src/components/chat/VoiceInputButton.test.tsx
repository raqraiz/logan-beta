import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { VoiceInputButton, type VoiceInputHandle } from "./VoiceInputButton";

let rec: any;
class FakeRecognition {
  stopEndsSession = true;
  constructor() { rec = this; }
  start() { this.onstart?.(); }
  stop() { if (this.stopEndsSession) setTimeout(() => this.onend?.(), 50); }
  abort() {}
  onstart: any; onresult: any; onend: any; onerror: any;
  say(parts: { t: string; final: boolean }[]) {
    this.onresult?.({ resultIndex: 0, results: parts.map((p) => Object.assign([{ transcript: p.t }], { isFinal: p.final })) });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  (window as any).webkitSpeechRecognition = FakeRecognition;
  Object.defineProperty(navigator, "userAgent", { value: "Android Chrome", configurable: true });
});
afterEach(() => vi.useRealTimers());

const setup = () => {
  const ref = createRef<VoiceInputHandle>();
  const cb = { onTranscript: vi.fn(), onPartial: vi.fn(), onListeningChange: vi.fn() };
  const { getByRole } = render(<VoiceInputButton ref={ref} {...cb} />);
  fireEvent.click(getByRole("button"));
  return { ref, cb };
};

describe("stopAndGetText", () => {
  it("returns the final sentence once and delivers nothing afterwards", async () => {
    const { ref, cb } = setup();
    act(() => rec.say([{ t: "hey", final: true }, { t: "hey today", final: true }, { t: "is hard", final: false }]));
    const p = ref.current!.stopAndGetText(600);
    act(() => rec.say([{ t: "hey today is hard", final: true }]));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(await p).toBe("hey today is hard");
    act(() => rec.say([{ t: "late words", final: true }]));
    act(() => rec.onend?.());
    expect(cb.onTranscript).not.toHaveBeenCalled();
    expect(cb.onPartial).toHaveBeenLastCalledWith("hey today is hard");
    expect(cb.onListeningChange).toHaveBeenLastCalledWith(false);
  });

  it("returns empty when nothing was heard", async () => {
    const { ref } = setup();
    const p = ref.current!.stopAndGetText(600);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(await p).toBe("");
  });

  it("gives up after the max wait if the engine never ends", async () => {
    const { ref } = setup();
    rec.stopEndsSession = false;
    act(() => rec.say([{ t: "still talking", final: false }]));
    const p = ref.current!.stopAndGetText(600);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(await p).toBe("still talking");
  });
});
