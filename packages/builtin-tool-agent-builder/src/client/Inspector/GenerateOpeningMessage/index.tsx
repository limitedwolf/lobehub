'use client';

import type { BuiltinInspectorProps } from '@lobechat/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Check } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { GenerateOpeningMessageParams, GenerateOpeningMessageState } from '../../../types';

const styles = createStaticStyles(({ css }) => ({
  statusIcon: css`
    margin-block-end: -2px;
    margin-inline-start: 4px;
  `,
}));

export const GenerateOpeningMessageInspector = memo<
  BuiltinInspectorProps<GenerateOpeningMessageParams, GenerateOpeningMessageState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const styleHint = args?.styleHint || partialArgs?.styleHint;
  const isSuccess = pluginState?.success;

  return (
    <div
      className={cx(
        inspectorTextStyles.root,
        (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
      )}
    >
      <span>{t('builtins.lobe-agent-builder.apiName.generateOpeningMessage')}</span>
      {styleHint && (
        <>
          :<span className={highlightTextStyles.primary}>{styleHint}</span>
        </>
      )}
      {!isLoading && !isArgumentsStreaming && isSuccess && (
        <Check className={styles.statusIcon} color={cssVar.colorSuccess} size={14} />
      )}
    </div>
  );
});

GenerateOpeningMessageInspector.displayName = 'GenerateOpeningMessageInspector';

export default GenerateOpeningMessageInspector;
