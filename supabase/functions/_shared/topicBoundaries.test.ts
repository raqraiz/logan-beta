import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mayBeBoundaryRequest } from "./topicBoundaries.ts";

const MUST_PASS = [
  "No I’m feeling good. Don’t remind me of the loss every time I open the app bc it can sometimes trigger me",
  "Please don’t remind me any more about the loss. I don’t need to see it each time I open Logan",
  "Stop! Don’t bring it up?",
  "I'm not in menopause, I'm 37 and have an IUD, please stop saying I'm in menopause",
  "You can stop talking about the exam btw it's long over",
  "Stop listing all my headache records every time I mention a headache!!",
];
const MUST_FAIL = [
  "What day am I on?",
  "I can't stop snacking today",
  "Remind me what luteal means",
];

for (const m of MUST_PASS) {
  Deno.test(`pre-filter PASS: ${m}`, () => assertEquals(mayBeBoundaryRequest(m), true));
}
for (const m of MUST_FAIL) {
  Deno.test(`pre-filter FAIL: ${m}`, () => assertEquals(mayBeBoundaryRequest(m), false));
}
