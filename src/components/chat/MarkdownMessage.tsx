import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { AnnotatedText } from "./CycleGlossary";
import { ChevronDown, ChevronUp } from "lucide-react";

interface MarkdownMessageProps {
  content: string;
  className?: string;
  /** Number of characters before truncating. Default 400 */
  truncateAt?: number;
}

/**
 * Renders an assistant message with markdown support + cycle term glossary.
 * Long messages are truncated with a "See more" toggle.
 */
export function MarkdownMessage({ content, className = "", truncateAt = 200 }: MarkdownMessageProps) {
  const [expanded, setExpanded] = useState(false);

  const shouldTruncate = content.length > truncateAt;
  const displayContent = shouldTruncate && !expanded
    ? content.slice(0, truncateAt).replace(/\s+\S*$/, "") + "…"
    : content;

  return (
    <div className={`prose prose-sm prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed">
              {processChildren(children)}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-1 space-y-1.5 list-none">
              {children}
            </ul>
          ),
          li: ({ children }) => (
            <li className="flex gap-2 items-start text-sm">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span>{processChildren(children)}</span>
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-muted-foreground italic">{children}</em>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-foreground mt-3 mb-1.5 uppercase tracking-wide">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-medium text-foreground mt-2 mb-1">
              {children}
            </h4>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-1 space-y-1.5 list-none counter-reset-item">
              {children}
            </ol>
          ),
        }}
      >
        {displayContent}
      </ReactMarkdown>

      {shouldTruncate && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? (
            <>Show less <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>See more <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
      )}
    </div>
  );
}

function processChildren(children: React.ReactNode): React.ReactNode {
  if (!children) return children;

  if (typeof children === "string") {
    return <AnnotatedText text={children} />;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        return <AnnotatedText key={i} text={child} />;
      }
      return child;
    });
  }

  return children;
}
