import { ArtifactType } from '@lobechat/types';
import { ActionIcon, copyToClipboard, Flexbox, Icon, Segmented, Text } from '@lobehub/ui';
import { App, ConfigProvider } from 'antd';
import { cx } from 'antd-style';
import {
  ArrowLeft,
  CloudUploadIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { ArtifactDisplayMode } from '@/store/chat/slices/portal/initialState';
import { useGlobalStore } from '@/store/global';
import { useMarketDeploymentStore } from '@/store/marketDeployment';
import { oneLineEllipsis } from '@/styles';

const TEXT_HTML_ARTIFACT_TYPE = 'text/html';

const Title = () => {
  const { t } = useTranslation('portal');
  const { message } = App.useApp();
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string>();
  const publishDeploymentArtifact = useMarketDeploymentStore((s) => s.publishArtifact);
  const [toggleRightPanel, setWorkingSidebarTab] = useGlobalStore((s) => [
    s.toggleRightPanel,
    s.setWorkingSidebarTab,
  ]);

  const [
    messageId,
    artifactIdentifier,
    topicId,
    displayMode,
    artifactType,
    artifactTitle,
    isArtifactTagClosed,
    closeArtifact,
  ] = useChatStore((s) => {
    const messageId = chatPortalSelectors.artifactMessageId(s) || '';
    const identifier = chatPortalSelectors.artifactIdentifier(s);

    return [
      messageId,
      identifier,
      s.activeTopicId,
      s.portalArtifactDisplayMode,
      chatPortalSelectors.artifactType(s),
      chatPortalSelectors.artifactTitle(s),
      chatPortalSelectors.isArtifactTagClosed(messageId, identifier)(s),
      s.closeArtifact,
    ];
  });

  // show switch only when artifact is closed and the type is not code
  const showSwitch = isArtifactTagClosed && artifactType !== ArtifactType.Code;
  const canPublish =
    isArtifactTagClosed &&
    !!messageId &&
    !!artifactIdentifier &&
    !!topicId &&
    (!artifactType ||
      artifactType === ArtifactType.Default ||
      artifactType === TEXT_HTML_ARTIFACT_TYPE);

  const publishArtifact = async () => {
    if (!canPublish || !topicId) return;

    setPublishing(true);

    try {
      const deployment = await publishDeploymentArtifact({
        artifactIdentifier,
        messageId,
        requestedSlug: artifactTitle,
        topicId,
      });

      setPublishedUrl(deployment.publicUrl);
      setWorkingSidebarTab('deployments');
      toggleRightPanel(true);
      message.success(t('artifacts.deploy.success'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('artifacts.deploy.failed'));
    } finally {
      setPublishing(false);
    }
  };

  const copyPublishedUrl = async () => {
    if (!publishedUrl) return;

    await copyToClipboard(publishedUrl);
    message.success(t('artifacts.deploy.copySuccess'));
  };

  return (
    <Flexbox horizontal align={'center'} flex={1} gap={12} justify={'space-between'} width={'100%'}>
      <Flexbox horizontal align={'center'} gap={4}>
        <ActionIcon icon={ArrowLeft} size={'small'} onClick={() => closeArtifact()} />
        <Text className={cx(oneLineEllipsis)} type={'secondary'}>
          {artifactTitle}
        </Text>
      </Flexbox>
      <ConfigProvider
        theme={{
          token: {
            borderRadiusSM: 16,
            borderRadiusXS: 16,
            fontSize: 12,
          },
        }}
      >
        <Flexbox horizontal align={'center'} gap={4}>
          {publishedUrl && (
            <>
              <ActionIcon
                icon={CopyIcon}
                size={'small'}
                title={t('artifacts.deploy.copy')}
                onClick={copyPublishedUrl}
              />
              <ActionIcon
                icon={ExternalLinkIcon}
                size={'small'}
                title={t('artifacts.deploy.open')}
                onClick={() => window.open(publishedUrl, '_blank', 'noopener,noreferrer')}
              />
            </>
          )}
          {canPublish && (
            <ActionIcon
              icon={CloudUploadIcon}
              loading={publishing}
              size={'small'}
              title={t('artifacts.deploy.publish')}
              onClick={publishArtifact}
            />
          )}
          {showSwitch && (
            <Segmented
              size={'small'}
              value={displayMode}
              options={[
                {
                  icon: <Icon icon={EyeIcon} />,
                  label: t('artifacts.display.preview'),
                  value: ArtifactDisplayMode.Preview,
                },
                {
                  icon: <Icon icon={CodeIcon} />,
                  label: t('artifacts.display.code'),
                  value: ArtifactDisplayMode.Code,
                },
              ]}
              onChange={(value) => {
                useChatStore.setState({ portalArtifactDisplayMode: value as ArtifactDisplayMode });
              }}
            />
          )}
        </Flexbox>
      </ConfigProvider>
    </Flexbox>
  );
};

export default Title;
