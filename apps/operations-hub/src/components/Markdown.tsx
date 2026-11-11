import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';

/** Renders agent markdown as sanitised HTML. */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
