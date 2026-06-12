import { Flexbox, Highlighter } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo, useEffect, useMemo } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors, messageStateSelectors } from '@/store/chat/selectors';
import { ArtifactDisplayMode } from '@/store/chat/slices/portal/initialState';
import { ArtifactType } from '@/types/artifact';

import Renderer from './Renderer';
import { useArtifactCodeAutoScroll } from './useArtifactCodeAutoScroll';

const styles = createStaticStyles(({ css }) => ({
  codeScroll: css`
    pre.shiki {
      overflow: visible !important;
    }
  `,
}));

const ArtifactsUI = memo(() => {
  const [
    messageId,
    artifactIdentifier,
    displayMode,
    isMessageGenerating,
    artifactType,
    artifactContent,
    artifactCodeLanguage,
    isArtifactTagClosed,
  ] = useChatStore((s) => {
    const messageId = chatPortalSelectors.artifactMessageId(s) || '';
    const identifier = chatPortalSelectors.artifactIdentifier(s);

    return [
      messageId,
      identifier,
      s.portalArtifactDisplayMode,
      messageStateSelectors.isMessageGenerating(messageId)(s),
      chatPortalSelectors.artifactType(s),
      chatPortalSelectors.artifactCode(messageId, identifier)(s),
      chatPortalSelectors.artifactCodeLanguage(s),
      chatPortalSelectors.isArtifactTagClosed(messageId, identifier)(s),
    ];
  });

  useEffect(() => {
    // When generation completes, switch from the live source stream to the final preview.
    if (isMessageGenerating && displayMode === ArtifactDisplayMode.Code && isArtifactTagClosed) {
      useChatStore.setState({ portalArtifactDisplayMode: ArtifactDisplayMode.Preview });
    }
  }, [isMessageGenerating, displayMode, isArtifactTagClosed]);

  const language = useMemo(() => {
    switch (artifactType) {
      case ArtifactType.React: {
        return 'tsx';
      }

      case ArtifactType.Code: {
        return artifactCodeLanguage;
      }

      case ArtifactType.Python: {
        return 'python';
      }

      default: {
        return 'html';
      }
    }
  }, [artifactType, artifactCodeLanguage]);

  // Keep incomplete artifacts in code mode so users can inspect and scroll the generated source.
  const showCode =
    artifactType === ArtifactType.Code ||
    !isArtifactTagClosed ||
    displayMode === ArtifactDisplayMode.Code;
  const isStreamingCode = showCode && !isArtifactTagClosed;
  const isStreamingArtifact = isMessageGenerating && !isArtifactTagClosed;
  const { handleScroll: handleCodeScroll, ref: codeScrollRef } =
    useArtifactCodeAutoScroll<HTMLDivElement>({
      content: artifactContent,
      enabled: isStreamingCode,
      resetKey: `${messageId}:${artifactIdentifier}`,
    });

  // make sure the message and id is valid
  if (!messageId) return;

  return (
    <Flexbox
      className={'portal-artifact'}
      flex={1}
      gap={8}
      height={'100%'}
      paddingInline={12}
      style={{ overflow: 'hidden' }}
    >
      {showCode ? (
        <Flexbox
          className={styles.codeScroll}
          flex={1}
          ref={codeScrollRef}
          style={{ minHeight: 0, overflow: 'auto' }}
          onScroll={handleCodeScroll}
        >
          <Highlighter
            animated={isStreamingCode}
            language={language || 'txt'}
            style={{ fontSize: 12, minHeight: '100%', overflow: 'visible' }}
          >
            {artifactContent}
          </Highlighter>
        </Flexbox>
      ) : (
        <Renderer animated={isStreamingArtifact} content={artifactContent} type={artifactType} />
      )}
    </Flexbox>
  );
});

export default ArtifactsUI;
