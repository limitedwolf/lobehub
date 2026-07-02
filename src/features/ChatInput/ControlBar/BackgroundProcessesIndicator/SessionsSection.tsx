import { type BinarySession } from '@lobechat/electron-client-ipc';
import { ActionIcon, Flexbox } from '@lobehub/ui';
import { X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { binaryService } from '@/services/electron/binary';

import { styles } from './styles';

interface SessionsSectionProps {
  onChanged: () => void;
  sessions: Record<string, BinarySession[]>;
}

const sessionKey = (name: string, id: string) => `${name}:${id}`;

const SessionsSection = memo<SessionsSectionProps>(({ onChanged, sessions }) => {
  const { t } = useTranslation('chat');
  const [closingKeys, setClosingKeys] = useState<Set<string>>(() => new Set());

  const handleClose = useCallback(
    async (name: string, id: string) => {
      const key = sessionKey(name, id);
      setClosingKeys((prev) => new Set(prev).add(key));
      try {
        await binaryService.closeSession({ id, name });
        onChanged();
      } finally {
        setClosingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [onChanged],
  );

  const entries = Object.entries(sessions).filter(([, list]) => list.length > 0);
  if (entries.length === 0) return null;

  return (
    <Flexbox className={styles.footer}>
      {entries.map(([name, list]) => (
        <Flexbox key={name}>
          <div className={styles.sectionTitle}>{name}</div>
          <Flexbox className={styles.list}>
            {list.map((session) => (
              <Flexbox horizontal align={'center'} className={styles.row} gap={8} key={session.id}>
                <Flexbox flex={1} style={{ minWidth: 0 }}>
                  <div className={styles.command}>{session.id}</div>
                  {session.pid !== undefined && (
                    <div className={styles.sub}>{`pid ${session.pid}`}</div>
                  )}
                </Flexbox>
                <ActionIcon
                  icon={X}
                  loading={closingKeys.has(sessionKey(name, session.id))}
                  size={'small'}
                  title={t('backgroundProcesses.sessions.close')}
                  onClick={() => handleClose(name, session.id)}
                />
              </Flexbox>
            ))}
          </Flexbox>
        </Flexbox>
      ))}
    </Flexbox>
  );
});

SessionsSection.displayName = 'SessionsSection';

export default SessionsSection;
