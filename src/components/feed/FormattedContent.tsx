import { parseContentWithLinks, ParsedTextPart } from "@/lib/linkUtils";
import { ExternalLink, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <span className="text-red-500/60 line-through cursor-not-allowed inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  [blocked link]
                </span>
              </TooltipTrigger>
              <TooltipContent className="glass-panel border">
                <p className="text-sm">This link has been blocked for safety</p>
              </TooltipContent>
            </Tooltip>
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
