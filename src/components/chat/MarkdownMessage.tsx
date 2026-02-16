import ReactMarkdown from "react-markdown";
import { AnnotatedText } from "./CycleGlossary";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Renders an assistant message with markdown support + cycle term glossary.
 * Handles bold, bullets, headers, and inline glossary tooltips.
 */
export function MarkdownMessage({ content, className = "" }: MarkdownMessageProps) {
  return (
    <div className={`prose prose-sm prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          // Render paragraphs with glossary annotations
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed">
              {processChildren(children)}
            </p>
          ),
          // Styled bullet lists
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
          // Bold text
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          // Italic
          em: ({ children }) => (
            <em className="text-muted-foreground italic">{children}</em>
          ),
          // Headers as small section dividers
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
          // Ordered lists
          ol: ({ children }) => (
            <ol className="my-2 ml-1 space-y-1.5 list-none counter-reset-item">
              {children}
            </ol>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Process children to annotate string nodes with glossary terms.
 */
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
