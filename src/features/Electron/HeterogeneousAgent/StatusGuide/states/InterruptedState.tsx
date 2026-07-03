// Matches the sibling guide states (OverloadedState / AuthRequiredState / …): the
// base-ui Button pulls createStaticStyles through its Tooltip, which the guide
// unit test's antd-style mock doesn't provide. Keep the root Button until the
// whole StatusGuide dir migrates together.
// eslint-disable-next-line no-restricted-imports
import { Button, Flexbox, Highlighter, Icon, Text } from '@lobehub/ui';
import { Ban, Loader2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import GuideActions from '../GuideActions';
import GuideShell from '../GuideShell';
import type { HeterogeneousAgentGuideStateProps } from '../types';

/**
 * Renders the guide for an `interrupted` terminal error (connection dropped
 * mid-response, unexpected CLI exit, or any otherwise-unclassified failure).
 * Mirrors {@link OverloadedState}: a compact auto-retry progress card while a
 * retry is pending, otherwise a manual retry card with the raw error details.
 * The retry resumes the session and continues, so prior work is preserved.
 */
const InterruptedState = ({
  autoRetry,
  config,
  error,
  onRetry,
  variant,
}: HeterogeneousAgentGuideStateProps) => {
  const { t } = useTranslation('chat');
  const rawErrorDetails = error?.stderr || error?.message;

  if (autoRetry) {
    return (
      <GuideShell
        compact
        icon={<Icon spin icon={Loader2} size={18} />}
        title={t('cliInterruptedGuide.autoRetry.title', { name: config.title })}
        variant={variant}
        actions={
          <Flexbox horizontal gap={8} justify="flex-end" style={{ flexWrap: 'wrap' }}>
            <Button icon={<Ban size={14} />} size="small" type="text" onClick={autoRetry.onCancel}>
              {t('cliInterruptedGuide.autoRetry.actions.cancel')}
            </Button>
            <Button icon={<RotateCcw size={14} />} size="small" onClick={autoRetry.onRetryNow}>
              {t('cliInterruptedGuide.autoRetry.actions.retryNow')}
            </Button>
          </Flexbox>
        }
        headerDescription={
          <Text style={{ fontSize: 12 }} type="secondary">
            {t('cliInterruptedGuide.autoRetry.status', {
              attempt: autoRetry.attempt,
              max: autoRetry.maxAttempts,
              seconds: autoRetry.secondsLeft,
            })}
          </Text>
        }
      />
    );
  }

  return (
    <GuideShell
      icon={<config.icon size={24} />}
      title={t('cliInterruptedGuide.title', { name: config.title })}
      variant={variant}
      actions={
        <GuideActions retryLabel={t('cliInterruptedGuide.actions.retry')} onRetry={onRetry} />
      }
      headerDescription={
        <Text type="secondary">{t('cliInterruptedGuide.desc', { name: config.title })}</Text>
      }
    >
      <Text style={{ fontSize: 12 }} type="secondary">
        {t('cliInterruptedGuide.retryHint')}
      </Text>

      {rawErrorDetails && (
        <Flexbox gap={6}>
          <Text strong style={{ fontSize: 12 }}>
            {t('cliInterruptedGuide.errorDetails')}
          </Text>
          <Highlighter
            wrap
            actionIconSize={'small'}
            language={'log'}
            padding={12}
            style={{ maxHeight: 200, overflow: 'auto' }}
            variant={'outlined'}
          >
            {rawErrorDetails}
          </Highlighter>
        </Flexbox>
      )}
    </GuideShell>
  );
};

export default InterruptedState;
