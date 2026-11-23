/**
 * Renders a message body through the formatting AST: React elements and text nodes only, never HTML strings. Text
 * leaves are scanned for links; code spans are not.
 */
import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { parseText, type LineSpan, type TextSpan } from '../../../core/text-format';
import { splitLinks } from '../../components/linkify';

/** Text with links turned into safe anchors. */
function Linkified({ text }: { readonly text: string }) {
  return (
    <>
      {splitLinks(text).map((segment, index) =>
        segment.kind === 'text' ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link-on-bubble underline underline-offset-2"
          >
            {segment.text}
          </a>
        ),
      )}
    </>
  );
}

function renderInline(spans: readonly TextSpan[]): ReactNode {
  return spans.map((span, index) => {
    switch (span.type) {
      case 'text':
        return <Linkified key={index} text={span.text} />;
      case 'bold':
        return <strong key={index}>{renderInline(span.children)}</strong>;
      case 'italic':
        return <em key={index}>{renderInline(span.children)}</em>;
      case 'strike':
        return <s key={index}>{renderInline(span.children)}</s>;
      case 'mono':
        return (
          <code key={index} className="bg-surface/60 rounded px-1 font-mono text-[0.9em]">
            {span.text}
          </code>
        );
      case 'monoblock':
        return (
          <code key={index} className="block font-mono text-[0.9em] whitespace-pre-wrap">
            {span.text}
          </code>
        );
    }
  });
}

/** True for a line-break marker the tokenizer puts between lines. */
function isLineBreak(span: LineSpan): boolean {
  const only = span.spans[0];
  return (
    span.type === 'paragraph' &&
    span.spans.length === 1 &&
    only?.type === 'text' &&
    only.text === '\n'
  );
}

/** Groups the AST into lines (the tokenizer separates them with '\n'). */
function toLines(spans: readonly LineSpan[]): readonly LineSpan[] {
  return spans.filter((span) => !isLineBreak(span));
}

function Line({ line }: { readonly line: LineSpan }) {
  switch (line.type) {
    case 'quote':
      return (
        <span className="border-text-muted-on-bubble block border-s-2 ps-2 italic">
          {renderInline(line.spans)}
        </span>
      );
    case 'bullet':
      return (
        <span className="flex gap-2">
          <span aria-hidden="true">{'•'}</span>
          <span className="min-w-0 flex-1">{renderInline(line.spans)}</span>
        </span>
      );
    case 'numbered':
      return (
        <span className="flex gap-2">
          <span className="tabular-nums">{`${String(line.number)}.`}</span>
          <span className="min-w-0 flex-1">{renderInline(line.spans)}</span>
        </span>
      );
    case 'paragraph':
      // An empty paragraph keeps its line's height (a blank line).
      return <span className="block min-h-[1lh]">{renderInline(line.spans)}</span>;
  }
}

/** Props for {@link RichText}. */
export interface RichTextProps {
  readonly body: string;
  readonly className?: string;
}

/** A formatted message body; direction follows its content. */
export const RichText = memo(function RichText({ body, className }: RichTextProps) {
  const lines = useMemo(() => toLines(parseText(body).spans), [body]);
  return (
    <div dir="auto" className={`break-words [unicode-bidi:plaintext] ${className ?? ''}`}>
      {lines.map((line, index) => (
        <Line key={index} line={line} />
      ))}
    </div>
  );
});
