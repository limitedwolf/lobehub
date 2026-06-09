import { ActionIcon, copyToClipboard, Flexbox, Text } from '@lobehub/ui';
import { App, Button, Empty, Tag } from 'antd';
import { createStaticStyles } from 'antd-style';
import { CopyIcon, ExternalLinkIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useClientDataSWR } from '@/libs/swr';
import { marketDeploymentService } from '@/services/marketDeployment';
import { useChatStore } from '@/store/chat';

const styles = createStaticStyles(({ css, cssVar }) => ({
  item: css`
    padding-block: 10px;
    border-block-end: 1px solid ${cssVar.colorSplit};
  `,
  list: css`
    min-height: 0;
  `,
  meta: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  title: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  url: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

const DEPLOYMENTS_SWR_KEY = 'market-deployments';

const Deployments = memo(() => {
  const { t } = useTranslation('chat');
  const { message } = App.useApp();
  const topicId = useChatStore((s) => s.activeTopicId);

  const {
    data = [],
    isLoading,
    mutate,
  } = useClientDataSWR(
    topicId ? [DEPLOYMENTS_SWR_KEY, topicId] : null,
    async ([, topicId]: [string, string]) => marketDeploymentService.listByTopic(topicId),
  );

  const copyUrl = async (url: string) => {
    await copyToClipboard(url);
    message.success(t('workingPanel.deployments.copySuccess'));
  };

  const unpublish = async (id: string) => {
    await marketDeploymentService.unpublish(id);
    message.success(t('workingPanel.deployments.unpublishSuccess'));
    await mutate();
  };

  return (
    <Flexbox
      data-testid="workspace-deployments"
      flex={1}
      gap={8}
      paddingBlock={8}
      paddingInline={'8px 12px'}
      style={{ minHeight: 0 }}
    >
      <Flexbox horizontal align={'center'} justify={'space-between'}>
        <Text strong>{t('workingPanel.deployments.title')}</Text>
        <ActionIcon
          icon={RefreshCwIcon}
          loading={isLoading}
          size={'small'}
          title={t('workingPanel.deployments.refresh')}
          onClick={() => mutate()}
        />
      </Flexbox>
      {!topicId || data.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t(
            topicId ? 'workingPanel.deployments.empty' : 'workingPanel.deployments.noTopic',
          )}
        />
      ) : (
        <Flexbox className={styles.list}>
          {data.map((deployment) => (
            <Flexbox className={styles.item} gap={8} key={deployment.id}>
              <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
                <Flexbox className={styles.title} flex={1}>
                  {deployment.title || deployment.artifactIdentifier || deployment.id}
                </Flexbox>
                <Tag color={deployment.status === 'active' ? 'success' : 'default'}>
                  {t(`workingPanel.deployments.status.${deployment.status}`)}
                </Tag>
              </Flexbox>
              <a
                className={styles.url}
                href={deployment.publicUrl}
                rel="noreferrer"
                target="_blank"
              >
                {deployment.publicUrl}
              </a>
              <Flexbox horizontal align={'center'} justify={'space-between'}>
                <span className={styles.meta}>
                  {deployment.sizeBytes
                    ? t('workingPanel.deployments.size', { size: deployment.sizeBytes })
                    : t('workingPanel.deployments.noRelease')}
                </span>
                <Flexbox horizontal gap={4}>
                  <Button
                    icon={<CopyIcon size={14} />}
                    size="small"
                    title={t('workingPanel.deployments.copy')}
                    type="text"
                    onClick={() => copyUrl(deployment.publicUrl)}
                  />
                  <Button
                    href={deployment.publicUrl}
                    icon={<ExternalLinkIcon size={14} />}
                    size="small"
                    target="_blank"
                    title={t('workingPanel.deployments.open')}
                    type="text"
                  />
                  <Button
                    danger
                    disabled={deployment.status !== 'active'}
                    icon={<Trash2Icon size={14} />}
                    size="small"
                    title={t('workingPanel.deployments.unpublish')}
                    type="text"
                    onClick={() => unpublish(deployment.id)}
                  />
                </Flexbox>
              </Flexbox>
            </Flexbox>
          ))}
        </Flexbox>
      )}
    </Flexbox>
  );
});

Deployments.displayName = 'Deployments';

export default Deployments;
