import { buildLocalFileUrl, isDesktop } from '@lobechat/const';
import { Center, Empty, Flexbox, Highlighter } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Loading from '@/components/Loading/CircleLoading';
import { useClientDataSWR } from '@/libs/swr';
import { localFileService } from '@/services/electron/localFileService';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import { extensionToLanguage, getFileExtension, isImageExtension } from './Body.helpers';

const MAX_PREVIEW_CHARS = 500_000;
const BINARY_CHECK_BYTES = 8192;

const hasBinaryContent = (content: string): boolean =>
  content.slice(0, BINARY_CHECK_BYTES).includes('\0');

// ============== ActiveFileView ==============

interface ActiveFileViewProps {
  filePath: string;
  workingDirectory: string;
}

const ActiveFileView = memo<ActiveFileViewProps>(({ filePath }) => {
  const { t } = useTranslation('chat');

  const filename = filePath.split('/').at(-1) ?? '';
  const ext = getFileExtension(filename);
  const isImage = isImageExtension(ext);

  const {
    data: result,
    isLoading,
    error,
  } = useClientDataSWR(
    !isImage ? ['local-file-content', filePath] : null,
    () => localFileService.readLocalFile({ fullContent: true, path: filePath }),
    { revalidateOnFocus: false },
  );

  if (isImage) {
    // Chromium blocks `file://` from a non-file origin (Electron renderer,
    // any web build) under default web security. The desktop main process
    // registers `localfile://` as a privileged custom scheme that streams
    // the bytes back with the correct MIME type. On web there's no equivalent
    // — we surface a friendly empty state instead of a broken <img>.
    const imageSrc = isDesktop ? buildLocalFileUrl(filePath) : null;

    if (!imageSrc) {
      return (
        <Center height={'100%'} width={'100%'}>
          <Empty description={t('workingPanel.localFile.binary')} />
        </Center>
      );
    }

    return (
      <Center height={'100%'} style={{ overflow: 'auto' }} width={'100%'}>
        <img alt={filename} src={imageSrc} style={{ maxWidth: '100%', objectFit: 'contain' }} />
      </Center>
    );
  }

  if (isLoading) return <Loading />;

  if (error || !result) {
    return (
      <Center height={'100%'} width={'100%'}>
        <Empty description={t('workingPanel.localFile.error')} />
      </Center>
    );
  }

  const isBinary =
    (result.charCount === 0 && result.totalCharCount > 0) || hasBinaryContent(result.content ?? '');

  if (isBinary) {
    return (
      <Center height={'100%'} width={'100%'}>
        <Empty description={t('workingPanel.localFile.binary')} />
      </Center>
    );
  }

  const content = result.content ?? '';
  const truncated = content.length > MAX_PREVIEW_CHARS;
  const displayContent = truncated ? content.slice(0, MAX_PREVIEW_CHARS) : content;

  return (
    <Flexbox flex={1} height={'100%'} style={{ minHeight: 0, overflow: 'auto' }}>
      {truncated && (
        <Center paddingBlock={4} style={{ flexShrink: 0 }}>
          <span style={{ fontSize: 12, opacity: 0.65 }}>
            {t('workingPanel.localFile.truncated', { limit: MAX_PREVIEW_CHARS.toLocaleString() })}
          </span>
        </Center>
      )}
      <Flexbox flex={1} style={{ minHeight: 0, overflow: 'auto' }}>
        <Highlighter
          language={extensionToLanguage(ext)}
          style={{ fontSize: 12, minHeight: '100%', overflow: 'visible' }}
        >
          {displayContent}
        </Highlighter>
      </Flexbox>
    </Flexbox>
  );
});

ActiveFileView.displayName = 'ActiveFileView';

// ============== Body ==============

const Body = memo(() => {
  const openLocalFiles = useChatStore(chatPortalSelectors.openLocalFiles);
  const activeFile = useChatStore(chatPortalSelectors.currentLocalFile);

  if (openLocalFiles.length === 0) return null;
  if (!activeFile) return null;

  return (
    <Flexbox flex={1} height={'100%'} style={{ minHeight: 0, overflow: 'hidden' }}>
      <ActiveFileView
        filePath={activeFile.filePath}
        workingDirectory={activeFile.workingDirectory}
      />
    </Flexbox>
  );
});

Body.displayName = 'LocalFileBody';

export default Body;
