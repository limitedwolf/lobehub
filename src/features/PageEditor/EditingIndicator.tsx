'use client';

import { Flexbox, Icon, Text, Tooltip } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { CloudOffIcon, Loader2Icon } from 'lucide-react';
import { type CSSProperties, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePageEditorStore } from './store';

const labelStyle: CSSProperties = {
  color: 'inherit',
  fontSize: 12,
  maxWidth: 160,
};

/**
 * Compact collaboration status for workspace pages. Renders only while the
 * CRDT provider is connecting, reconnecting, unsynced, or errored.
 */
const EditingIndicator = memo(() => {
  const { t } = useTranslation('file');
  const isWorkspacePage = usePageEditorStore((s) => s.isWorkspacePage);
  const collaborationStatus = usePageEditorStore((s) => s.collaborationStatus);
  const isCollaborationSynced = usePageEditorStore((s) => s.isCollaborationSynced);

  if (!isWorkspacePage) return null;
  if (collaborationStatus === 'connected' && isCollaborationSynced) return null;
  if (!collaborationStatus || collaborationStatus === 'idle') return null;

  const isError = collaborationStatus === 'error';
  const label = isError
    ? t('pageEditor.collaboration.error')
    : t('pageEditor.collaboration.syncing');

  return (
    <Tooltip title={label}>
      <Flexbox horizontal align={'center'} gap={4} style={{ color: cssVar.colorTextTertiary }}>
        <Icon icon={isError ? CloudOffIcon : Loader2Icon} size={14} spin={!isError} />
        <Text ellipsis style={labelStyle}>
          {label}
        </Text>
      </Flexbox>
    </Tooltip>
  );
});

export default EditingIndicator;
