import { Flexbox, Tag } from '@lobehub/ui';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding-block: 12px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorSplit};

    &:hover {
      background: ${cssVar.colorFillTertiary};
      box-shadow: inset 2px 0 0 ${cssVar.colorPrimary};
    }
  `,
  meta: css`
    font-size: 12px;
    font-weight: 400;
    color: ${cssVar.colorTextDescription};
  `,
  text: css`
    font-size: 14px;
    line-height: 24px;
  `,
  title: css`
    font-size: 15px;
    font-weight: 600;
  `,
}));

interface ChunkCardProps {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  pageNumber?: number | null;
  similarity?: number;
  text: string | null;
  type: string | null;
}

const ChunkCard = memo<ChunkCardProps>(
  ({ text, type, similarity, pageNumber, onMouseEnter, onMouseLeave }) => {
    const { t } = useTranslation('file');

    return (
      <Flexbox
        className={styles.container}
        gap={8}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className={cx(type === 'Title' ? styles.title : styles.text)}>{text}</div>

        {similarity !== undefined && (
          <Flexbox
            horizontal
            align={'center'}
            className={styles.meta}
            distribution={'space-between'}
          >
            <Tag variant={'filled'}>{similarity.toFixed(2)}</Tag>
            {typeof pageNumber === 'number' && (
              <span>{t('chunkDrawer.page', { page: pageNumber })}</span>
            )}
          </Flexbox>
        )}
      </Flexbox>
    );
  },
);

export default ChunkCard;
