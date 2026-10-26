import { parseContentWithLinks, ParsedTextPart } from "@/lib/linkUtils";
import { ExternalLink, AlertTriangle } from "lucide-react";

interface FormattedContentProps {
  content: string;
  className?: string;
}

const FormattedContent = ({ content, className = "" }: FormattedContentProps) => {
  const parts = parseContentWithLinks(content);
  
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={index}>{part.content}</span>;
        }
        
        if (part.isBlocked) {
          return (
            <span
              key={index}
              title="this link was blocked for safety"
              aria-label="blocked link"
              className="text-destructive/70 line-through cursor-not-allowed inline-flex items-center gap-1"
            >
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              blocked link
            </span>
          );
        }
        
        return (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 decoration-blue-400/50 hover:decoration-blue-300 transition-colors inline-flex items-center gap-1"
          >
            {part.content}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        );
      })}
    </span>
  );
};

export default FormattedContent;
