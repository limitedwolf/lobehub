'use client';

import { Flexbox } from '@lobehub/ui';
import { debounce } from 'es-toolkit/compat';
import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { AutoSaveHint } from '@/features/EditorCanvas';
import FloatingChatPanel from '@/features/FloatingChatPanel';
import TopicCanvas from '@/features/TopicCanvas';
import { useAutoCreateTopicDocument } from '@/features/TopicCanvas/useAutoCreateTopicDocument';
import { mutate, useClientDataSWR } from '@/libs/swr';
import HeaderSlot from '@/routes/(main)/agent/(chat)/_layout/HeaderSlot';
import { agentDocumentSWRKeys } from '@/services/agentDocument';
import { documentService } from '@/services/document';
import { useAgentStore } from '@/store/agent';
import { documentEvents, useDocumentStore } from '@/store/document';
import { SWR_USE_FETCH_NOTEBOOK_DOCUMENTS } from '@/store/notebook/action';

const MAX_PANEL_WIDTH = 1024;
const TITLE_SAVE_DEBOUNCE = 500;

const TopicPage = memo(() => {
  const { aid, topicId, docId } = useParams<{ aid?: string; docId?: string; topicId?: string }>();
  const navigate = useNavigate();

  const agentId = useAgentStore((s) => s.activeAgentId);
  const { document: topicDocument } = useAutoCreateTopicDocument(topicId, agentId);

  const [titleDraft, setTitleDraft] = useState<string | undefined>();

  const {
    data: documentMeta,
    error: documentError,
    isLoading: isDocLoading,
  } = useClientDataSWR(docId ? ['page-document-meta', docId] : null, () =>
    documentService.getDocumentById(docId!),
  );

  const isInvalidDoc = docId && !isDocLoading && (documentError || documentMeta === null);

  useEffect(() => {
    if (!aid || !topicId) return;
    if (!isInvalidDoc) return;
    if (!topicDocument?.id) return;
    if (topicDocument.id === docId) return;
    navigate(`/agent/${aid}/${topicId}/page/${topicDocument.id}`, { replace: true });
  }, [aid, topicId, docId, isInvalidDoc, topicDocument?.id, navigate]);

  useEffect(() => {
    setTitleDraft(undefined);
  }, [docId]);

  const debouncedSaveTitle = useMemo(
    () =>
      debounce(
        async (
          id: string,
          nextTitle: string,
          ctx: { agentId: string | undefined; topicId: string | undefined },
        ) => {
          await documentService.updateDocument({
            id,
            saveSource: 'autosave',
            title: nextTitle,
          });
          if (ctx.agentId) await mutate(agentDocumentSWRKeys.documentsList(ctx.agentId));
          if (ctx.topicId) await mutate([SWR_USE_FETCH_NOTEBOOK_DOCUMENTS, ctx.topicId]);
          await mutate(['page-document-meta', id]);
        },
        TITLE_SAVE_DEBOUNCE,
      ),
    [],
  );

  const handleTitleChange = (next: string) => {
    setTitleDraft(next);
    if (docId) debouncedSaveTitle(docId, next, { agentId, topicId });
  };

  // Refresh the editor when this document is mutated by an agent-documents
  // write. Emissions come from two places:
  //   - `src/services/agentDocument.ts` (UI actions / client-dispatched tools):
  //     targeted events carrying `documentId`.
  //   - `src/store/chat/.../gatewayEventHandler.ts` (server-executed tools):
  //     broadcast events without `documentId` — we can't map agent_documents.id
  //     back to documents.id cheaply there.
  // See `src/store/document/events.ts` for the contract.
  useEffect(() => {
    if (!docId) return;
    return documentEvents.subscribe((event) => {
      // Ignore targeted events aimed at a different document. Broadcast events
      // (no documentId) fall through and refresh the current page.
      if (event.documentId && event.documentId !== docId) return;

      void mutate(['document/editor', docId]);
      void mutate(['page-document-meta', docId]);

      // Only re-hydrate the live editor for operations that change content.
      // `rename` / `updateLoadRule` / `copy` leave content untouched — skip
      // them to avoid stomping cursor state.
      const contentMutating =
        event.operation === 'edit' || event.operation === 'upsert' || event.operation === 'create';
      if (!contentMutating) return;

      const { activeDocumentId, editor, onEditorInit } = useDocumentStore.getState();
      if (activeDocumentId === docId && editor) {
        void onEditorInit(editor);
      }
    });
  }, [docId]);

  if (!aid || !topicId) return null;

  const displayTitle = titleDraft ?? documentMeta?.title ?? '';

  return (
    <Flexbox
      align={'center'}
      data-testid="agent-page-container"
      height={'100%'}
      style={{ minHeight: 0, minWidth: 0, position: 'relative' }}
      width={'100%'}
    >
      {docId && (
        <HeaderSlot>
          <AutoSaveHint documentId={docId} />
        </HeaderSlot>
      )}
      <Flexbox
        align={'center'}
        flex={1}
        style={{ minHeight: 0, overflowX: 'hidden', overflowY: 'auto' }}
        width={'100%'}
      >
        <Flexbox style={{ maxWidth: MAX_PANEL_WIDTH, paddingBlockEnd: 16 }} width={'100%'}>
          <TopicCanvas
            agentId={aid}
            documentId={docId}
            title={displayTitle}
            topicId={topicId}
            onTitleChange={handleTitleChange}
          />
        </Flexbox>
      </Flexbox>
      <Flexbox style={{ maxWidth: MAX_PANEL_WIDTH }} width={'100%'}>
        <FloatingChatPanel
          agentId={aid}
          documentId={docId}
          maxHeight={0.92}
          minHeight={320}
          scope={'page'}
          topicId={topicId}
          variant={'embedded'}
        />
      </Flexbox>
    </Flexbox>
  );
});

export default TopicPage;
