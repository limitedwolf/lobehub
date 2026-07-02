import { type ScannedProcess } from '@lobechat/electron-client-ipc';
import { ActionIcon, Flexbox } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { shellCommandService } from '@/services/electron/shellCommand';
import { getPlatform } from '@/utils/platform';

import { styles } from './styles';

const OrphanRow = memo<{
  killing: boolean;
  onKill: (pid: number) => void;
  process: ScannedProcess;
}>(({ killing, onKill, process }) => {
  const { t } = useTranslation('chat');

  return (
    <Flexbox horizontal align={'center'} className={styles.row} gap={8}>
      <Flexbox flex={1} style={{ minWidth: 0 }}>
        <div className={styles.command}>{process.command}</div>
        <div className={styles.sub}>
          {[process.cwd, `pid ${process.pid}`].filter(Boolean).join(' · ')}
        </div>
      </Flexbox>
      <ActionIcon
        icon={X}
        loading={killing}
        size={'small'}
        title={t('backgroundProcesses.forceStop')}
        onClick={() => onKill(process.pid)}
      />
    </Flexbox>
  );
});

const OrphanSection = memo(() => {
  const { t } = useTranslation('chat');
  const [orphans, setOrphans] = useState<ScannedProcess[]>();
  const [scanning, setScanning] = useState(false);
  const [killingPids, setKillingPids] = useState<Set<number>>(() => new Set());

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      setOrphans(await shellCommandService.scanOrphans());
    } finally {
      setScanning(false);
    }
  }, []);

  const handleKill = useCallback(async (pid: number) => {
    setKillingPids((prev) => new Set(prev).add(pid));
    try {
      await shellCommandService.killProcess({ force: true, pid });
      setOrphans((prev) => prev?.filter((process) => process.pid !== pid));
    } finally {
      setKillingPids((prev) => {
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
    }
  }, []);

  if (getPlatform() === 'Windows') return null;

  return (
    <Flexbox className={styles.footer}>
      {orphans && orphans.length > 0 && (
        <>
          <div className={styles.sectionTitle}>{t('backgroundProcesses.orphans.title')}</div>
          <Flexbox className={styles.list}>
            {orphans.map((process) => (
              <OrphanRow
                key={process.pid}
                killing={killingPids.has(process.pid)}
                process={process}
                onKill={handleKill}
              />
            ))}
          </Flexbox>
        </>
      )}
      {orphans?.length === 0 && (
        <div className={styles.empty}>{t('backgroundProcesses.orphans.empty')}</div>
      )}
      <Button block loading={scanning} size={'small'} type={'text'} onClick={scan}>
        {t('backgroundProcesses.findOrphans')}
      </Button>
    </Flexbox>
  );
});

OrphanSection.displayName = 'OrphanSection';

export default OrphanSection;
