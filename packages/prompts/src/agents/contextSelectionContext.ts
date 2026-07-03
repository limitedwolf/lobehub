import type { ContextSelection } from '@lobechat/types';

const escapeAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const formatLineRange = (selection: ContextSelection): string => {
  const range = selection.lineRange;
  if (!range) return '';

  return ` lines="${range.startLine}-${range.endLine ?? range.startLine}"`;
};

const formatSelectionAttributes = (selection: ContextSelection): string => {
  const attrs = [`source="${selection.source}"`];

  if (selection.title) attrs.push(`title="${escapeAttribute(selection.title)}"`);
  if (selection.source === 'page') attrs.push(`pageId="${escapeAttribute(selection.pageId)}"`);
  if (selection.source === 'code') {
    attrs.push(`filePath="${escapeAttribute(selection.filePath)}"`);
    if (selection.language) attrs.push(`language="${escapeAttribute(selection.language)}"`);
    if (selection.side) attrs.push(`side="${selection.side}"`);
    if (selection.workingDirectory) {
      attrs.push(`workingDirectory="${escapeAttribute(selection.workingDirectory)}"`);
    }
  }

  return `${attrs.join(' ')}${formatLineRange(selection)}`;
};

const getSelectionBody = (selection: ContextSelection): string => {
  if (selection.source === 'page') return selection.xml || selection.content;

  return selection.content;
};

/**
 * Format generic context selections into a system prompt context.
 * Each selection carries source metadata so non-page selections, such as code
 * diff lines, can be injected without overloading PageSelection.
 */
export const formatContextSelections = (selections: ContextSelection[]): string => {
  if (!selections || selections.length === 0) return '';

  const formattedSelections = selections
    .map(
      (selection) => `<context_selection ${formatSelectionAttributes(selection)}>
${getSelectionBody(selection)}
</context_selection>`,
    )
    .join('\n');

  return `<user_context_selections count="${selections.length}">
${formattedSelections}
</user_context_selections>`;
};
