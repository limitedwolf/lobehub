import { isDesktop } from '@lobechat/const';
import { type RuntimeEnvMode } from '@lobechat/types';
import { Github } from '@lobehub/icons';
import { Flexbox, Icon, Popover, Skeleton, Tooltip } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  BoxIcon,
  ChevronDownIcon,
  CloudIcon,
  FolderIcon,
  GitBranchIcon,
  LaptopIcon,
  MonitorOffIcon,
  SquircleDashed,
} from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceService } from '@/services/device';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors, chatConfigByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import ContextWindow from '../ActionBar/Token';
import { useAgentId } from '../hooks/useAgentId';
import { useUpdateAgentConfig } from '../hooks/useUpdateAgentConfig';
import { useChatInputStore } from '../store';
import ApprovalMode from './ApprovalMode';
import CloudRepoSwitcher from './CloudRepoSwitcher';
import { DeviceSelector, SectionHeader } from './DeviceSelector';
import GitStatus from './GitStatus';
import ModeSelector from './ModeSelector';
import { useRepoType } from './useRepoType';
import WorkingDirectory from './WorkingDirectory';

const MODE_ICONS: Record<RuntimeEnvMode, typeof LaptopIcon> = {
  cloud: CloudIcon,
  local: LaptopIcon,
  none: MonitorOffIcon,
  sandbox: BoxIcon,
};

const styles = createStaticStyles(({ css }) => ({
  bar: css`
    padding-block: 0;
    padding-inline: 4px;
  `,
  button: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    height: 28px;
    padding-inline: 8px;
    border-radius: 6px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    transition: all 0.2s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  divider: css`
    height: 1px;
    margin-block: 4px;
    background: ${cssVar.colorBorderSecondary};
  `,
  modeDesc: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  modeOption: css`
    cursor: pointer;

    width: 100%;
    padding-block: 8px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    transition: background-color 0.2s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  modeOptionActive: css`
    background: ${cssVar.colorFillTertiary};
  `,
  modeOptionDesc: css`
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
  `,
  modeOptionIcon: css`
    border: 1px solid ${cssVar.colorFillTertiary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorBgElevated};
  `,
  modeOptionTitle: css`
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

const RuntimeConfig = memo(() => {
  const { t } = useTranslation('chat');
  const { t: tPlugin } = useTranslation('plugin');
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();
  const [dirPopoverOpen, setDirPopoverOpen] = useState(false);
  const [modePopoverOpen, setModePopoverOpen] = useState(false);
  const [devices, setDevices] = useState<Awaited<ReturnType<typeof deviceService.listDevices>>>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const showContextWindow = useChatInputStore((s) =>
    s.rightActions.flat().includes('contextWindow'),
  );

  const [isLoading, runtimeMode, isHeterogeneous, enableAgentMode, deviceId] = useAgentStore(
    (s) => [
      agentByIdSelectors.isAgentConfigLoadingById(agentId)(s),
      chatConfigByIdSelectors.getRuntimeModeById(agentId)(s),
      agentId ? agentByIdSelectors.isAgentHeterogeneousById(agentId)(s) : false,
      agentByIdSelectors.getAgentEnableModeById(agentId)(s),
      chatConfigByIdSelectors.getDeviceIdById(agentId)(s),
    ],
  );

  const topicWorkingDirectory = useChatStore(topicSelectors.currentTopicWorkingDirectory);
  const agentWorkingDirectory = useAgentStore((s) =>
    agentId ? agentByIdSelectors.getAgentWorkingDirectoryById(agentId)(s) : undefined,
  );
  const effectiveWorkingDirectory = topicWorkingDirectory || agentWorkingDirectory;

  const repoType = useRepoType(effectiveWorkingDirectory);

  // Fetch device list when popover opens (desktop only)
  useEffect(() => {
    if (modePopoverOpen && isDesktop) {
      setDevicesLoading(true);
      deviceService.listDevices().then((list) => {
        setDevices(list);
        setDevicesLoading(false);
      });
    }
  }, [modePopoverOpen]);

  const dirIconNode = useMemo((): ReactNode => {
    if (!effectiveWorkingDirectory) return <Icon icon={SquircleDashed} size={14} />;
    if (repoType === 'github') return <Github size={14} />;
    if (repoType === 'git') return <Icon icon={GitBranchIcon} size={14} />;
    return <Icon icon={FolderIcon} size={14} />;
  }, [effectiveWorkingDirectory, repoType]);

  const switchMode = useCallback(
    async (mode: RuntimeEnvMode, opts?: { deviceId?: string }) => {
      if (mode === runtimeMode && opts?.deviceId === deviceId) return;

      const platform = isDesktop ? 'desktop' : 'web';

      await updateAgentChatConfig({
        runtimeEnv: {
          deviceId: opts?.deviceId,
          runtimeMode: { [platform]: mode },
        },
      });
    },
    [runtimeMode, deviceId, updateAgentChatConfig],
  );

  // Compute the display label for the mode button
  const activeDevice = useMemo(
    () => (deviceId ? devices.find((d) => d.deviceId === deviceId) : undefined),
    [deviceId, devices],
  );

  const ModeIcon = MODE_ICONS[runtimeMode] || LaptopIcon;

  const modeLabel = useMemo(() => {
    // When running on a specific device, show device hostname
    if (runtimeMode === 'local' && activeDevice) {
      return activeDevice.hostname;
    }
    return t(`runtimeEnv.mode.${runtimeMode}`);
  }, [runtimeMode, activeDevice, t]);

  const displayName = effectiveWorkingDirectory
    ? effectiveWorkingDirectory.split('/').findLast(Boolean) || effectiveWorkingDirectory
    : tPlugin('localSystem.workingDirectory.notSet');

  const hasDevices = devices.length > 0;

  // Skeleton placeholder to prevent layout jump during loading
  if (!agentId || isLoading) {
    return (
      <Flexbox horizontal align={'center'} className={styles.bar} gap={4}>
        <Skeleton.Button active size="small" style={{ height: 22, minWidth: 64, width: 64 }} />
        <Skeleton.Button active size="small" style={{ height: 22, minWidth: 100, width: 100 }} />
      </Flexbox>
    );
  }

  // ─── Popover Content ───

  const modeContent = (
    <Flexbox gap={4} style={{ minWidth: 280 }}>
      {/* ── Device section (desktop only) ── */}
      {isDesktop && (
        <>
          <SectionHeader label={t('runtimeEnv.section.device')} />
          {devicesLoading ? (
            <Flexbox paddingBlock={12} paddingInline={8}>
              <Skeleton.Button
                active
                size="small"
                style={{ height: 16, marginBottom: 4, width: '60%' }}
              />
              <Skeleton.Button active size="small" style={{ height: 12, width: '40%' }} />
            </Flexbox>
          ) : hasDevices ? (
            <DeviceSelector
              activeDeviceId={deviceId}
              devices={devices}
              onSelect={(id) => switchMode('local', { deviceId: id })}
            />
          ) : (
            <Flexbox
              className={styles.modeOptionDesc}
              paddingBlock={8}
              paddingInline={8}
            >
              {t('runtimeEnv.device.empty')}
            </Flexbox>
          )}

          <div className={styles.divider} />
        </>
      )}

      {/* ── Sandbox ── */}
      <Flexbox
        horizontal
        align={'flex-start'}
        gap={12}
        className={cx(
          styles.modeOption,
          (runtimeMode === 'sandbox' || runtimeMode === 'cloud') && styles.modeOptionActive,
        )}
        onClick={() => switchMode('sandbox')}
      >
        <Flexbox
          align={'center'}
          className={styles.modeOptionIcon}
          flex={'none'}
          height={32}
          justify={'center'}
          width={32}
        >
          <Icon icon={BoxIcon} />
        </Flexbox>
        <Flexbox flex={1}>
          <div className={styles.modeOptionTitle}>{t('runtimeEnv.mode.sandbox')}</div>
          <div className={styles.modeOptionDesc}>{t('runtimeEnv.mode.sandboxDesc')}</div>
        </Flexbox>
      </Flexbox>

      {/* ── Disabled ── */}
      <Flexbox
        horizontal
        align={'flex-start'}
        className={cx(styles.modeOption, runtimeMode === 'none' && styles.modeOptionActive)}
        gap={12}
        onClick={() => switchMode('none')}
      >
        <Flexbox
          align={'center'}
          className={styles.modeOptionIcon}
          flex={'none'}
          height={32}
          justify={'center'}
          width={32}
        >
          <Icon icon={MonitorOffIcon} />
        </Flexbox>
        <Flexbox flex={1}>
          <div className={styles.modeOptionTitle}>{t('runtimeEnv.mode.none')}</div>
          <div className={styles.modeOptionDesc}>{t('runtimeEnv.mode.noneDesc')}</div>
        </Flexbox>
      </Flexbox>
    </Flexbox>
  );

  const modeButton = (
    <div className={styles.button}>
      <Icon icon={ModeIcon} size={14} />
      <span>{modeLabel}</span>
      <Icon icon={ChevronDownIcon} size={12} />
    </div>
  );

  const dirButton = (
    <div className={styles.button}>
      {dirIconNode}
      <span>{displayName}</span>
      <Icon icon={ChevronDownIcon} size={12} />
    </div>
  );

  const rightContent = () => {
    // Web + heterogeneous agent always shows the cloud repo switcher,
    // regardless of the stored runtimeMode (which may be 'local' from desktop).
    if (!isDesktop && isHeterogeneous && agentId) {
      return <CloudRepoSwitcher agentId={agentId} />;
    }

    // Desktop local mode: show working directory picker
    if (runtimeMode === 'local') {
      return (
        <>
          <Popover
            open={dirPopoverOpen}
            placement="bottomLeft"
            styles={{ content: { padding: 4 } }}
            trigger="click"
            content={
              <WorkingDirectory agentId={agentId} onClose={() => setDirPopoverOpen(false)} />
            }
            onOpenChange={setDirPopoverOpen}
          >
            <div>
              {dirPopoverOpen ? (
                dirButton
              ) : (
                <Tooltip
                  title={
                    effectiveWorkingDirectory || tPlugin('localSystem.workingDirectory.notSet')
                  }
                >
                  {dirButton}
                </Tooltip>
              )}
            </div>
          </Popover>
          {effectiveWorkingDirectory && repoType && (
            <GitStatus isGithub={repoType === 'github'} path={effectiveWorkingDirectory} />
          )}
        </>
      );
    }

    return null;
  };

  return (
    <Flexbox horizontal align={'center'} className={styles.bar} justify={'space-between'}>
      {/* Left: Chat mode switcher + (agent-only) runtime env + working directory */}
      <Flexbox horizontal align={'center'} gap={4}>
        <ModeSelector />
        {enableAgentMode && (
          <>
            <Popover
              content={modeContent}
              open={modePopoverOpen}
              placement="top"
              styles={{ content: { padding: 4 } }}
              trigger="click"
              onOpenChange={setModePopoverOpen}
            >
              <div>
                {modePopoverOpen ? (
                  modeButton
                ) : (
                  <Tooltip title={t('runtimeEnv.selectMode')}>{modeButton}</Tooltip>
                )}
              </div>
            </Popover>
            {rightContent()}
          </>
        )}
      </Flexbox>

      <Flexbox horizontal align={'center'} gap={4}>
        {enableAgentMode && <ApprovalMode />}
        {showContextWindow && <ContextWindow />}
      </Flexbox>
    </Flexbox>
  );
});

RuntimeConfig.displayName = 'RuntimeConfig';

export default RuntimeConfig;
