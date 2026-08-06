// Display-layer safety net for symptom names that predate server-side
// validation or arrive from other sources with markdown / overlong text.

export function cleanSymptomLabel(raw: string): string {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateAtWord(s: string, max = 28): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:.\-—]+$/, "") + "…";
}
