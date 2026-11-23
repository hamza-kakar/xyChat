/**
 * Text with search matches wrapped in `<mark>`: React text
 * nodes only, never FTS markup or HTML strings.
 */
import { splitHighlights } from '../../core/text-format/highlight';

/** Props for {@link HighlightedText}. */
export interface HighlightedTextProps {
  readonly text: string;
  readonly query: string;
}

export function HighlightedText({ text, query }: HighlightedTextProps) {
  return (
    <>
      {splitHighlights(text, query).map((segment, index) =>
        segment.isMatch ? (
          // Segments never reorder, so the index is a stable key.
          <mark key={index} className="bg-highlight text-text rounded-sm">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
