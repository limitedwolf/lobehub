import {
  type BinarySession,
  type ShellProcessMeta,
  useWatchBroadcast,
} from '@lobechat/electron-client-ipc';
import { ActionIcon, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Button, Popover } from '@lobehub/ui/base-ui';
import { Activity, X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { binaryService } from '@/services/electron/binary';
import { shellCommandService } from '@/services/electron/shellCommand';

import OrphanSection from './OrphanSection';
import SessionsSection from './SessionsSection';
import { styles } from './styles';

const SWR_KEY = 'desktop-background-processes';

const fetchBackgroundProcesses = async () => {
  const [processes, sessions] = await Promise.all([
    shellCommandService.listProcesses(),
    binaryService.listAllSessions().catch(() => ({}) as Record<string, BinarySession[]>),
  ]);
  return { processes, sessions };
};

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

  const { data, mutate } = useSWR(SWR_KEY, fetchBackgroundProcesses, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
  });

  useWatchBroadcast('shellProcessesChanged', ({ processes }) => {
    void mutate((prev) => ({ processes, sessions: prev?.sessions ?? {} }), { revalidate: false });
  });

  const revalidate = useCallback(() => void mutate(), [mutate]);

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

  const processes = (data?.processes ?? []).filter((process) => process.runInBackground);
  const sessions = data?.sessions ?? {};
  const count = processes.length + Object.values(sessions).flat().length;

  if (count === 0) return null;

  const button = (
    <Button
      className={styles.trigger}
      icon={<Icon icon={Activity} size={'small'} />}
      size={'small'}
      type={'text'}
    >
      {count}
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
          {processes.length > 0 && (
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
          )}
          <SessionsSection sessions={sessions} onChanged={revalidate} />
          <OrphanSection />
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
