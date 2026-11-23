import type { SummaryResponse } from '../../../shared/api.types';

/** The summary as Markdown, for "Copy as Markdown". */
export function toMarkdown({ source, summary }: SummaryResponse): string {
  const linkText = source.title.replace(/[[\]]/g, '\\$&');
  return [
    `## ${summary.title}`,
    '',
    summary.tldr,
    '',
    '**Key points**',
    '',
    ...summary.keyPoints.map((point) => `- ${point}`),
    '',
    `Source: [${linkText}](${source.url}) · ${summary.readingTimeMin} min read`,
  ].join('\n');
}

/** The summary as plain text, for "Copy". */
export function toPlainText({ source, summary }: SummaryResponse): string {
  return [
    summary.title,
    '',
    summary.tldr,
    '',
    ...summary.keyPoints.map((point) => `• ${point}`),
    '',
    `Source: ${source.url}`,
  ].join('\n');
}
