'use client';

import type { ChatMessageError } from '@lobechat/types';
import { Alert, Flexbox, Highlighter, Icon, Tabs } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import isEqual from 'fast-deep-equal';
import {
  AudioLines,
  BoltIcon,
  Grid3x3Icon,
  ImageIcon,
  MessageSquareTextIcon,
  MicIcon,
  VideoIcon,
} from 'lucide-react';
import { memo, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsMobile } from '@/hooks/useIsMobile';
import { useProviderName } from '@/hooks/useProviderName';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';
import { getRuntimeErrorMessage } from '@/utils/locale/runtimeErrorMessage';

import DisabledModels from './DisabledModels';
import EmptyModels from './EmptyModels';
import EnabledModelList from './EnabledModelList';
import ModelTitle from './ModelTitle';
import type { ProviderSettingsContextValue } from './ProviderSettingsContext';
import { ProviderSettingsContext } from './ProviderSettingsContext';
import SearchResult from './SearchResult';
import SkeletonList from './SkeletonList';

interface ContentProps {
  id: string;
  onFetchError?: (error: ChatMessageError) => void;
  onFetchStart?: () => void;
  onFetchSuccess?: () => void;
}

const Content = memo<ContentProps>(({ id, onFetchError, onFetchStart, onFetchSuccess }) => {
  // preload common namespace to avoid Suspense remount when child components start using it (e.g. infinite scroll loading text)
  const { t } = useTranslation(['modelProvider', 'common']);
  const [activeTab, setActiveTab] = useState('all');

  const [isSearching, isEmpty, useFetchAiProviderModels] = useAiInfraStore((s) => [
    !!s.modelSearchKeyword,
    aiModelSelectors.isEmptyAiProviderModelList(s),
    s.useFetchAiProviderModels,
  ]);

  const allModels = useAiInfraStore(aiModelSelectors.filteredAiProviderModelList, isEqual);

  const { isLoading } = useFetchAiProviderModels(id);

  // Count models by type (for all models, not just enabled)
  const modelCounts = useMemo(() => {
    const counts = {
      all: allModels.length,
      chat: 0,
      embedding: 0,
      image: 0,
      stt: 0,
      tts: 0,
      video: 0,
    };

    allModels.forEach((model) => {
      const type = model.type;
      if (type && Object.prototype.hasOwnProperty.call(counts, type)) {
        counts[type as keyof typeof counts]++;
      }
    });

    return counts;
  }, [allModels]);

  // Tab definitions with counts (only show tabs with models > 0, except 'all' tab)
  const tabs = useMemo(() => {
    const formatTabLabel = (baseLabel: string, count: number) =>
      count > 0 ? `${baseLabel} (${count})` : baseLabel;

    const allTabs = [
      {
        count: modelCounts.all,
        icon: <Icon icon={Grid3x3Icon} size={16} />,
        key: 'all',
        label: formatTabLabel(t('providerModels.tabs.all'), modelCounts.all),
      },
      {
        count: modelCounts.chat,
        icon: <Icon icon={MessageSquareTextIcon} size={16} />,
        key: 'chat',
        label: formatTabLabel(t('providerModels.tabs.chat'), modelCounts.chat),
      },
      {
        count: modelCounts.image,
        icon: <Icon icon={ImageIcon} size={16} />,
        key: 'image',
        label: formatTabLabel(t('providerModels.tabs.image'), modelCounts.image),
      },
      {
        count: modelCounts.video,
        icon: <Icon icon={VideoIcon} size={16} />,
        key: 'video',
        label: formatTabLabel(t('providerModels.tabs.video'), modelCounts.video),
      },
      {
        count: modelCounts.embedding,
        icon: <Icon icon={BoltIcon} size={16} />,
        key: 'embedding',
        label: formatTabLabel(t('providerModels.tabs.embedding'), modelCounts.embedding),
      },
      {
        count: modelCounts.stt,
        icon: <Icon icon={MicIcon} size={16} />,
        key: 'stt',
        label: formatTabLabel(t('providerModels.tabs.stt'), modelCounts.stt),
      },
      {
        count: modelCounts.tts,
        icon: <Icon icon={AudioLines} size={16} />,
        key: 'tts',
        label: formatTabLabel(t('providerModels.tabs.tts'), modelCounts.tts),
      },
    ];

    // Only show tabs that have models (count > 0), but always show 'all' tab
    return allTabs.filter((tab) => tab.key === 'all' || tab.count > 0);
  }, [modelCounts]);

  // Ensure active tab is available, fallback to 'all' if current tab is hidden
  const availableTabKeys = tabs.map((tab) => tab.key);
  const currentActiveTab = availableTabKeys.includes(activeTab) ? activeTab : 'all';

  if (isLoading) return <SkeletonList />;

  if (isSearching) return <SearchResult />;

  return isEmpty ? (
    <EmptyModels
      provider={id}
      onFetchError={onFetchError}
      onFetchStart={onFetchStart}
      onFetchSuccess={onFetchSuccess}
    />
  ) : (
    <Flexbox>
      <Tabs
        activeKey={currentActiveTab}
        items={tabs}
        size="small"
        style={{ marginBottom: 12, marginLeft: -6 }}
        onChange={setActiveTab}
      />
      <EnabledModelList activeTab={currentActiveTab} />
      <DisabledModels activeTab={currentActiveTab} providerId={id} />
    </Flexbox>
  );
});

interface ModelFetchErrorAlertProps {
  error?: ChatMessageError;
  provider: string;
}

const ModelFetchErrorAlert = memo<ModelFetchErrorAlertProps>(({ error, provider }) => {
  const { t } = useTranslation(['error', 'modelRuntime']);
  const providerName = useProviderName(error?.body?.provider || provider);

  if (!error) return null;

  const title = getRuntimeErrorMessage(t, error.type, { provider: providerName });
  const description = error.message && error.message !== title ? error.message : undefined;

  return (
    <Alert
      showIcon
      description={description}
      title={title}
      type={'error'}
      extra={
        <Flexbox paddingBlock={8} paddingInline={16}>
          <Highlighter wrap actionIconSize={'small'} language={'json'} variant={'borderless'}>
            {JSON.stringify(error.body?.error ?? error.body ?? error, null, 2)}
          </Highlighter>
        </Flexbox>
      }
    />
  );
});

interface ModelListProps extends ProviderSettingsContextValue {
  id: string;
}

const ModelList = memo<ModelListProps>(
  ({ id, showModelFetcher, sdkType, showAddNewModel, showDeployName, modelEditable = true }) => {
    const mobile = useIsMobile();
    const [fetchModelsError, setFetchModelsError] = useState<ChatMessageError>();

    useEffect(() => {
      setFetchModelsError(undefined);
    }, [id]);

    return (
      <ProviderSettingsContext
        value={{ modelEditable, sdkType, showAddNewModel, showDeployName, showModelFetcher }}
      >
        <Flexbox
          gap={16}
          paddingInline={mobile ? 12 : 0}
          style={{
            background: mobile ? cssVar.colorBgContainer : undefined,
            paddingBottom: 16,
            paddingTop: 8,
          }}
        >
          <ModelTitle
            provider={id}
            showAddNewModel={showAddNewModel}
            showModelFetcher={showModelFetcher}
            onFetchError={setFetchModelsError}
            onFetchStart={() => setFetchModelsError(undefined)}
            onFetchSuccess={() => setFetchModelsError(undefined)}
          />
          <ModelFetchErrorAlert error={fetchModelsError} provider={id} />
          <Suspense fallback={<SkeletonList />}>
            <Content
              id={id}
              onFetchError={setFetchModelsError}
              onFetchStart={() => setFetchModelsError(undefined)}
              onFetchSuccess={() => setFetchModelsError(undefined)}
            />
          </Suspense>
        </Flexbox>
      </ProviderSettingsContext>
    );
  },
);

export default ModelList;
