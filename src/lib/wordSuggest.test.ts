import { describe, expect, it } from "vitest";
import { localSuggestions } from "@/lib/wordSuggest";
import type { TogetherWord } from "@/lib/togetherWords";

const words: TogetherWord[] = [
  { word: "Brain zaps", label: "exact", women_count: 14, mine: false },
  { word: "Heavy eyelids", label: "single", women_count: null, mine: false },
  { word: "Tight chest", label: "few", women_count: null, mine: false },
];

describe("localSuggestions", () => {
  it("catches typos of shared words and shows the count label", () => {
    expect(localSuggestions("brain zapz", words)).toEqual([{ name: "Brain zaps", label: "14 women" }]);
  });
  it("uses the server label for a single woman and for 3 to 9", () => {
    expect(localSuggestions("heavy eyelidz", words)[0].label).toBe("Named by a woman like you");
    expect(localSuggestions("tight chesst", words)[0].label).toBe("A few women");
  });
  it("matches aliases and gives no label for list words", () => {
    expect(localSuggestions("insomnia", words)[0]).toEqual({ name: "Trouble sleeping", label: null });
  });
  it("shows nothing for its own exact word or an unrelated one", () => {
    expect(localSuggestions("brain zaps", words)).toEqual([]);
    expect(localSuggestions("purple giraffe", words)).toEqual([]);
  });
  it("shows at most 3 rows", () => {
    expect(localSuggestions("pain", words).length).toBeLessThanOrEqual(3);
  });
});
