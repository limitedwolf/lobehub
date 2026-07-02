import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  command: css`
    overflow: hidden;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  empty: css`
    padding-block: 8px;
    padding-inline: 12px;
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
  `,
  footer: css`
    padding: 4px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
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
  sectionTitle: css`
    padding-block: 6px 2px;
    padding-inline: 8px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
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
