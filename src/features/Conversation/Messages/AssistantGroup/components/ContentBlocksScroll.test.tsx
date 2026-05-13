/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import ContentBlocksScroll from './ContentBlocksScroll';
import type { RenderableAssistantContentBlock } from './types';

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ScrollArea: ({
    children,
    contentProps,
    scrollbarProps,
  }: {
    children?: ReactNode;
    contentProps?: { style?: CSSProperties };
    scrollbarProps?: { style?: CSSProperties };
  }) => (
    <div
      data-content-style={JSON.stringify(contentProps?.style ?? {})}
      data-scrollbar-style={JSON.stringify(scrollbarProps?.style ?? {})}
      data-testid="scroll-area"
    >
      {children}
    </div>
  ),
}));

vi.mock('antd-style', () => ({
  createStaticStyles: () => ({
    scrollRoot: 'scroll-root',
    scrollTask: 'scroll-task',
    scrollWorkflow: 'scroll-workflow',
  }),
}));

vi.mock('./ContentBlock', () => ({
  default: ({ disableMarkdownStreaming, id }: RenderableAssistantContentBlock) => (
    <div
      data-block-id={id}
      data-disable-markdown-streaming={String(!!disableMarkdownStreaming)}
      data-testid="content-block"
    />
  ),
}));

describe('ContentBlocksScroll', () => {
  it('does not disable markdown streaming for the first block of a workflow subset', () => {
    render(
      <ContentBlocksScroll
        assistantId="assistant-1"
        blocks={[{ content: 'workflow block', id: 'block-2' }]}
        scroll={false}
        variant="workflow"
      />,
    );

    expect(screen.getByTestId('content-block')).toHaveAttribute(
      'data-disable-markdown-streaming',
      'false',
    );
  });

  it('preserves precomputed markdown streaming disable flag', () => {
    render(
      <ContentBlocksScroll
        assistantId="assistant-1"
        blocks={[{ content: 'first group block', disableMarkdownStreaming: true, id: 'block-1' }]}
        scroll={false}
        variant="workflow"
      />,
    );

    expect(screen.getByTestId('content-block')).toHaveAttribute(
      'data-disable-markdown-streaming',
      'true',
    );
  });

  it('reserves content space for the vertical scrollbar', () => {
    render(
      <ContentBlocksScroll
        assistantId="assistant-1"
        blocks={[{ content: 'workflow block', id: 'block-2' }]}
        variant="workflow"
      />,
    );

    expect(
      JSON.parse(screen.getByTestId('scroll-area').dataset.contentStyle || '{}'),
    ).toMatchObject({
      paddingInlineEnd: 16,
    });
    expect(
      JSON.parse(screen.getByTestId('scroll-area').dataset.scrollbarStyle || '{}'),
    ).toMatchObject({
      marginInlineEnd: 2,
      marginInlineStart: 0,
    });
  });
});
