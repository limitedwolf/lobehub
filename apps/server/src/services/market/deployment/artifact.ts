import { ARTIFACT_TAG } from '@lobechat/const';

const CODE_FENCE_START_REGEX = /^\s*```[^\n]*(?:\n|$)/;
const CODE_FENCE_END_REGEX = /\n```\s*$/;
const HTML_ARTIFACT_TYPES = new Set(['html', 'text/html']);

export interface ExtractedHtmlArtifact {
  content: string;
  title?: string;
  type?: string;
}

const escapeRegExp = (value: string) => value.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&');

const getAttribute = (attrs: string, name: string) => {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
  const match = attrs.match(regex);

  return match?.[1] ?? match?.[2];
};

const unwrapArtifactCodeBlock = (content: string) => {
  if (!CODE_FENCE_START_REGEX.test(content)) return content;

  return content.replace(CODE_FENCE_START_REGEX, '').replace(CODE_FENCE_END_REGEX, '');
};

export const extractHtmlArtifact = (
  messageContent: string | null | undefined,
  identifier: string,
): ExtractedHtmlArtifact | null => {
  if (!messageContent || !identifier) return null;

  const regex = new RegExp(
    `<${ARTIFACT_TAG}\\b(?=[^>]*\\bidentifier=(["'])${escapeRegExp(
      identifier,
    )}\\1)(?<attrs>[^>]*)>(?<content>[\\S\\s]*?)<\\/${ARTIFACT_TAG}>`,
  );
  const result = messageContent.match(regex);

  if (!result?.groups) return null;

  const attrs = result.groups.attrs ?? '';
  const type = getAttribute(attrs, 'type');

  if (type && !HTML_ARTIFACT_TYPES.has(type)) return null;

  return {
    content: unwrapArtifactCodeBlock(result.groups.content ?? ''),
    title: getAttribute(attrs, 'title'),
    type,
  };
};
