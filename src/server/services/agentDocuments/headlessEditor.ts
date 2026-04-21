/* eslint-disable @typescript-eslint/consistent-type-imports */
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { isValidEditorData } from '@/libs/editor/isValidEditorData';

export type AgentDocumentEditorData = Record<string, any>;

export type AgentDocumentLiteXMLOperation =
  | {
      action: 'insert';
      afterId: string;
      litexml: string;
    }
  | {
      action: 'insert';
      beforeId: string;
      litexml: string;
    }
  | {
      action: 'modify';
      litexml: string | string[];
    }
  | {
      action: 'remove';
      id: string;
    };

export interface AgentDocumentEditorSnapshot {
  content: string;
  editorData: AgentDocumentEditorData;
  litexml?: string;
}

interface LoadEditorStateParams {
  editorData?: AgentDocumentEditorData | null;
  fallbackContent?: string;
}

const exportSnapshot = (
  editor: ReturnType<(typeof import('@lobehub/editor/headless'))['createHeadlessEditor']>,
  litexml = false,
): AgentDocumentEditorSnapshot => {
  const snapshot = editor.export({ litexml });

  return {
    content: snapshot.markdown,
    editorData: snapshot.editorData as SerializedEditorState<SerializedLexicalNode>,
    litexml: snapshot.litexml,
  };
};

const loadEditorState = (
  editor: ReturnType<(typeof import('@lobehub/editor/headless'))['createHeadlessEditor']>,
  { editorData, fallbackContent = '' }: LoadEditorStateParams,
) => {
  if (isValidEditorData(editorData)) {
    editor.hydrateEditorData(
      editorData as unknown as SerializedEditorState<SerializedLexicalNode>,
      {
        keepId: true,
      },
    );
    return;
  }

  editor.hydrateMarkdown(fallbackContent, { keepId: true });
};

export const createMarkdownEditorSnapshot = async (
  content: string,
): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    editor.hydrateMarkdown(content);
    return exportSnapshot(editor);
  } finally {
    editor.destroy();
  }
};

export const exportEditorDataSnapshot = async (
  params: LoadEditorStateParams & { litexml?: boolean },
): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    loadEditorState(editor, params);
    return exportSnapshot(editor, params.litexml);
  } finally {
    editor.destroy();
  }
};

export const applyLiteXMLOperations = async ({
  editorData,
  fallbackContent,
  operations,
}: LoadEditorStateParams & {
  operations: AgentDocumentLiteXMLOperation[];
}): Promise<AgentDocumentEditorSnapshot> => {
  const { createHeadlessEditor } = await import('@lobehub/editor/headless');
  const editor = createHeadlessEditor();

  try {
    loadEditorState(editor, { editorData, fallbackContent });
    await editor.applyLiteXMLBatch(operations);
    return exportSnapshot(editor, true);
  } finally {
    editor.destroy();
  }
};
