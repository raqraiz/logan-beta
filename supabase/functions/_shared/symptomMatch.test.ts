import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCatalog, matchSymptoms } from "./symptomMatch.ts";

const cat = buildCatalog([
  { alias: "muffled hearing", main_name: "Muffled hearing" },
  { alias: "hearing loss", main_name: "Hearing loss" },
  { alias: "headache", main_name: "Headache" },
  { alias: "head hurts", main_name: "Headache" },
  { alias: "cramps", main_name: "Cramps" },
  { alias: "insomnia", main_name: "Trouble sleeping" },
]);

Deno.test("matches main names and aliases", () => {
  assertEquals(matchSymptoms("log hearing loss for april 15", cat), ["Hearing loss"]);
  assertEquals(matchSymptoms("my head hurts and I had insomnia", cat), ["Headache", "Trouble sleeping"]);
});
Deno.test("hearing loss stays separate from muffled hearing", () => {
  assertEquals(matchSymptoms("my muffled hearing is back", cat), ["Muffled hearing"]);
});
Deno.test("skips negations", () => {
  assertEquals(matchSymptoms("No chin acne, migraines, muffled hearing nor anxiety", cat), []);
  assertEquals(matchSymptoms("no cramps today but a headache", cat), ["Headache"]);
});
Deno.test("unknown symptom returns nothing", () => {
  assertEquals(matchSymptoms("log the thing for april 15", cat), []);
});
