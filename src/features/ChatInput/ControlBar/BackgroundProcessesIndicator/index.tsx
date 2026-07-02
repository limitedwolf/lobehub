import { type ShellProcessMeta, useWatchBroadcast } from '@lobechat/electron-client-ipc';
import { ActionIcon, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Button, Popover } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Activity, X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { shellCommandService } from '@/services/electron/shellCommand';

const SWR_KEY = 'desktop-background-processes';

const styles = createStaticStyles(({ css, cssVar }) => ({
  command: css`
    overflow: hidden;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  list: css`
    overflow-y: auto;
    max-height: 320px;
    padding: 4px;
  `,
  row: css`
    padding-block: 6px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  sub: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextDescription};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  title: css`
    padding-block: 10px 6px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
  trigger: css`
    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextSecondary};
  `,
}));

const formatAge = (startedAt: number) => {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

interface ProcessRowProps {
  killing: boolean;
  onKill: (shellId: string) => void;
  process: ShellProcessMeta;
}

const ProcessRow = memo<ProcessRowProps>(({ killing, onKill, process }) => {
  const { t } = useTranslation('chat');

  return (
    <Flexbox horizontal align={'center'} className={styles.row} gap={8}>
      <Flexbox flex={1} style={{ minWidth: 0 }}>
        <div className={styles.command}>{process.command}</div>
        <div className={styles.sub}>
          {[process.cwd, formatAge(process.startedAt)].filter(Boolean).join(' · ')}
        </div>
      </Flexbox>
      <ActionIcon
        icon={X}
        loading={killing}
        size={'small'}
        title={t('backgroundProcesses.stop')}
        onClick={() => onKill(process.shellId)}
      />
    </Flexbox>
  );
});

const BackgroundProcessesIndicator = memo(() => {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [killingIds, setKillingIds] = useState<Set<string>>(() => new Set());

  const { data, mutate } = useSWR(SWR_KEY, () => shellCommandService.listProcesses(), {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
  });

  useWatchBroadcast('shellProcessesChanged', ({ processes }) => {
    void mutate(processes, { revalidate: false });
  });

  const handleKill = useCallback(
    async (shellId: string) => {
      setKillingIds((prev) => new Set(prev).add(shellId));
      try {
        await shellCommandService.killShell(shellId);
        await mutate();
      } finally {
        setKillingIds((prev) => {
          const next = new Set(prev);
          next.delete(shellId);
          return next;
        });
      }
    },
    [mutate],
  );

  const processes = (data ?? []).filter((process) => process.runInBackground);

  if (processes.length === 0) return null;

  const button = (
    <Button
      className={styles.trigger}
      icon={<Icon icon={Activity} size={'small'} />}
      size={'small'}
      type={'text'}
    >
      {processes.length}
    </Button>
  );

  return (
    <Popover
      arrow={false}
      open={open}
      placement={'bottomRight'}
      styles={{ content: { padding: 0, width: 360 } }}
      trigger={['click']}
      content={
        <Flexbox>
          <div className={styles.title}>{t('backgroundProcesses.title')}</div>
          <Flexbox className={styles.list}>
            {processes.map((process) => (
              <ProcessRow
                key={process.shellId}
                killing={killingIds.has(process.shellId)}
                process={process}
                onKill={handleKill}
              />
            ))}
          </Flexbox>
        </Flexbox>
      }
      onOpenChange={setOpen}
    >
      {open ? button : <Tooltip title={t('backgroundProcesses.title')}>{button}</Tooltip>}
    </Popover>
  );
});

BackgroundProcessesIndicator.displayName = 'BackgroundProcessesIndicator';

export default BackgroundProcessesIndicator;
