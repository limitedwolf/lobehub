'use client';

import type { BuiltinRenderProps } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { CheckCircle, ListChecks, MessageSquare } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { GenerateOpeningMessageParams, GenerateOpeningMessageState } from '../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    margin-inline-start: 12px;
    padding: 12px;
    border-inline-start: 3px solid ${cssVar.colorSuccess};
    background: ${cssVar.colorFillTertiary};
  `,
  container: css`
    font-size: 13px;
  `,
  content: css`
    overflow: auto;

    max-height: 180px;
    margin-inline: -12px;
    margin-inline-start: 20px;
    padding-inline: 12px;

    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorText};
    word-break: break-word;
    white-space: pre-wrap;
  `,
  icon: css`
    color: ${cssVar.colorTextTertiary};
  `,
  label: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
  questionList: css`
    margin: 0;
    margin-inline-start: 20px;
    padding-inline-start: 18px;
    color: ${cssVar.colorText};

    li + li {
      margin-block-start: 4px;
    }
  `,
  statusRow: css`
    margin-block-end: 6px;
    margin-inline-start: 9px;
    color: ${cssVar.colorSuccess};
  `,
  statusText: css`
    font-weight: 500;
  `,
}));

const clip = (value: string, max = 500) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const GenerateOpeningMessage = memo<
  BuiltinRenderProps<GenerateOpeningMessageParams, GenerateOpeningMessageState>
>(({ pluginState }) => {
  const { t } = useTranslation('plugin');
  const { openingMessage, openingQuestions = [] } = pluginState || {};

  if (!openingMessage) return null;

  return (
    <Flexbox className={styles.container} gap={8}>
      <Flexbox horizontal align={'center'} className={styles.statusRow} gap={6}>
        <CheckCircle size={14} />
        <span className={styles.statusText}>
          {t('builtins.lobe-agent-builder.render.generateOpeningMessage.updated')}
        </span>
      </Flexbox>

      <Flexbox className={styles.card} gap={8}>
        <Flexbox horizontal align={'center'} gap={6}>
          <MessageSquare className={styles.icon} size={14} />
          <span className={styles.label}>
            {t('builtins.lobe-agent-builder.render.generateOpeningMessage.message')}
          </span>
        </Flexbox>
        <div className={styles.content}>{clip(openingMessage)}</div>
      </Flexbox>

      {openingQuestions.length > 0 && (
        <Flexbox className={styles.card} gap={8}>
          <Flexbox horizontal align={'center'} gap={6}>
            <ListChecks className={styles.icon} size={14} />
            <span className={styles.label}>
              {t('builtins.lobe-agent-builder.render.generateOpeningMessage.questions')}
            </span>
          </Flexbox>
          <ol className={styles.questionList}>
            {openingQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </Flexbox>
      )}
    </Flexbox>
  );
});

export default GenerateOpeningMessage;
