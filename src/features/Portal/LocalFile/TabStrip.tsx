'use client';

import { ScrollArea } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { XIcon } from 'lucide-react';
import { memo } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  tabClose: css`
    cursor: pointer;

    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 3px;

    color: inherit;

    opacity: 0.6;
    background: transparent;

    &:hover {
      opacity: 1;
      background: ${cssVar.colorFillSecondary};
    }
  `,
  tabItem: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;

    max-width: 160px;
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 6px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    transition:
      color 0.15s,
      background 0.15s;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  tabItemActive: css`
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillTertiary};
  `,
  tabLabel: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

const SCROLL_AREA_STYLE = {
  background: 'transparent',
  borderRadius: 0,
  flex: 1,
  minWidth: 0,
};

const SCROLL_AREA_CONTENT_STYLE = {
  alignItems: 'center',
  display: 'flex',
  flexDirection: 'row' as const,
  gap: 4,
  paddingBlock: 8,
  paddingInlineStart: 8,
  width: 'max-content',
};

const SCROLL_AREA_SCROLLBAR_STYLE = {
  margin: 0,
};

const TabStrip = memo(() => {
  const openLocalFiles = useChatStore(chatPortalSelectors.openLocalFiles);
  const activeLocalFilePath = useChatStore(chatPortalSelectors.activeLocalFilePath);
  const setActiveLocalFile = useChatStore((s) => s.setActiveLocalFile);
  const closeLocalFileTab = useChatStore((s) => s.closeLocalFileTab);

  if (openLocalFiles.length === 0) return null;

  return (
    <ScrollArea
      contentProps={{ style: SCROLL_AREA_CONTENT_STYLE }}
      scrollFade="horizontal"
      scrollbarProps={{ orientation: 'horizontal', style: SCROLL_AREA_SCROLLBAR_STYLE }}
      style={SCROLL_AREA_STYLE}
    >
      {openLocalFiles.map(({ filePath }) => {
        const filename = filePath.split('/').at(-1) ?? filePath;
        const isActive = filePath === activeLocalFilePath;

        return (
          <div
            aria-selected={isActive}
            className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`}
            key={filePath}
            role="tab"
            tabIndex={0}
            title={filePath}
            onClick={() => setActiveLocalFile(filePath)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveLocalFile(filePath);
              }
            }}
          >
            <span className={styles.tabLabel}>{filename}</span>
            <button
              aria-label={`Close ${filename}`}
              className={styles.tabClose}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeLocalFileTab(filePath);
              }}
            >
              <XIcon size={12} />
            </button>
          </div>
        );
      })}
    </ScrollArea>
  );
});

TabStrip.displayName = 'LocalFileTabStrip';

export default TabStrip;
