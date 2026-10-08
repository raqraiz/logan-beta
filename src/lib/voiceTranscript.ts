// Pure helpers for dictation. Android Chrome (continuous mode) returns each
// final result as the whole sentence so far ("hey", "hey today", ...), while
// desktop Chrome returns distinct chunks. mergeTranscript handles both: a piece
// that extends the text so far replaces it; a new chunk is appended with a space.

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

export function mergeTranscript(soFar: string, piece: string): string {
  const a = norm(soFar);
  const b = norm(piece);
  if (!b) return a;
  if (!a) return b;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (bl.startsWith(al)) return b; // cumulative result: replace
  if (al.endsWith(bl)) return a; // exact repeat of the tail: ignore
  return `${a} ${b}`;
}

// Joins text the user already typed with the dictated text.
export function joinWithBase(base: string, dictated: string): string {
  const d = norm(dictated);
  if (!d) return base;
  if (!base.trim()) return d;
  return `${base.replace(/\s+$/, "")} ${d}`;
}
