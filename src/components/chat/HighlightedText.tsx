interface HighlightedTextProps {
  text: string;
  query: string;
}

/**
 * Renders text with case-insensitive query matches wrapped in a
 * teal <mark> highlight. If query is empty, renders text unchanged.
 */
export function HighlightedText({ text, query }: HighlightedTextProps) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  const lower = query.toLowerCase();
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lower ? (
          <mark
            key={i}
            className="bg-primary/40 text-inherit rounded px-0.5"
            style={{ fontFamily: "inherit" }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
