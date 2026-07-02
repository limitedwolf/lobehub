import { type ScannedProcess } from '@lobechat/electron-client-ipc';
import { Icon } from '@lobehub/ui';
import { Button as BaseButton } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Activity, X } from 'lucide-react';
import React, { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { shellCommandService } from '@/services/electron/shellCommand';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    font-size: 12px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadow};
  `,
  closeButton: css`
    all: unset;

    cursor: pointer;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    inline-size: 24px;
    block-size: 24px;
    border-radius: 6px;

    color: ${cssVar.colorTextTertiary};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  container: css`
    position: fixed;
    z-index: 1000;
    inset-block-end: 16px;
    inset-inline-start: 16px;
  `,
}));

type Phase = 'idle' | 'cleaning' | 'done' | 'hidden';

const OrphanCleanupNotification: React.FC = memo(() => {
  const { t } = useTranslation('chat');
  const [orphans, setOrphans] = useState<ScannedProcess[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    let cancelled = false;
    shellCommandService
      .getStartupOrphans()
      .then((result) => {
        if (!cancelled) setOrphans(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'hidden' || orphans.length === 0) return null;

  if (phase === 'done') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          {t('backgroundProcesses.notification.done')}
          <button
            aria-label={'Close'}
            className={styles.closeButton}
            type={'button'}
            onClick={() => setPhase('hidden')}
          >
            <Icon icon={X} style={{ fontSize: 14 }} />
          </button>
        </div>
      </div>
    );
  }

  const handleEndAll = async () => {
    setPhase('cleaning');
    await Promise.allSettled(
      orphans.map((orphan) => shellCommandService.killProcess({ force: true, pid: orphan.pid })),
    );
    setPhase('done');
    setTimeout(() => setPhase('hidden'), 5000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Icon icon={Activity} style={{ fontSize: 16 }} />
        {t('backgroundProcesses.notification.desc', { count: orphans.length })}
        <BaseButton size={'small'} type={'text'} onClick={() => setPhase('hidden')}>
          {t('backgroundProcesses.notification.dismiss')}
        </BaseButton>
        <BaseButton
          loading={phase === 'cleaning'}
          size={'small'}
          type={'primary'}
          onClick={handleEndAll}
        >
          {t('backgroundProcesses.notification.endAll')}
        </BaseButton>
      </div>
    </div>
  );
});

OrphanCleanupNotification.displayName = 'OrphanCleanupNotification';

export default OrphanCleanupNotification;
