import { render } from '@testing-library/react';
import type { ReactNode, Ref } from 'react';
import { useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalStore } from '@/store/global';
import { initialState } from '@/store/global/initialState';

import Files from '../index';

// ─── shared mutable handle spies ──────────────────────────────────────────────

const handleSpies = {
  focus: vi.fn(),
  select: vi.fn(),
  setExpanded: vi.fn(),
};

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/features/ExplorerTree', () => {
  const MockExplorerTree = ({ ref, ...props }: { ref?: Ref<unknown>; [key: string]: unknown }) => {
    useImperativeHandle(ref, () => ({
      focus: handleSpies.focus,
      getSelectedIds: vi.fn(() => []),
      deselect: vi.fn(),
      select: handleSpies.select,
      setExpanded: handleSpies.setExpanded,
      startRenaming: vi.fn(),
    }));
    return <div data-testid="explorer-tree" />;
  };
  MockExplorerTree.displayName = 'MockExplorerTree';
  return {
    ExplorerTree: MockExplorerTree,
  };
});

vi.mock('../useProjectFiles', () => ({
  useProjectFiles: () => ({
    data: {
      entries: [
        { isDirectory: true, name: 'src', path: '/repo/src', relativePath: 'src/' },
        { isDirectory: true, name: 'foo', path: '/repo/src/foo', relativePath: 'src/foo/' },
        {
          isDirectory: false,
          name: 'bar.ts',
          path: '/repo/src/foo/bar.ts',
          relativePath: 'src/foo/bar.ts',
        },
        {
          isDirectory: false,
          name: 'root.ts',
          path: '/repo/root.ts',
          relativePath: 'root.ts',
        },
      ],
      indexedAt: '2026-01-01',
      root: '/repo',
      source: 'git',
      totalCount: 2,
    },
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ openLocalFile: vi.fn() }),
}));

const messageSpy = vi.hoisted(() => ({ warning: vi.fn() }));

vi.mock('antd', () => ({
  message: messageSpy,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@lobehub/ui', () => ({
  ActionIcon: ({ onClick }: { onClick?: () => void }) => <button type="button" onClick={onClick} />,
  Center: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Empty: ({ description }: { description?: ReactNode }) => <div>{description}</div>,
  Flexbox: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('antd-style', () => ({
  createStaticStyles: () => () => ({}),
}));

vi.mock('@/components/NeuralNetworkLoading', () => ({
  default: () => <div />,
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

const setReveal = (path: string, nonce: number) => {
  useGlobalStore.setState({
    status: {
      ...useGlobalStore.getState().status,
      workingSidebarRevealRequest: { nonce, path },
    },
  });
};

// ─── tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  handleSpies.focus.mockClear();
  handleSpies.select.mockClear();
  handleSpies.setExpanded.mockClear();
  messageSpy.warning.mockClear();
  useGlobalStore.setState({
    ...initialState,
    status: { ...initialState.status, workingSidebarRevealRequest: undefined },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Files — reveal request integration', () => {
  it('(a) reveals existing path: calls setExpanded with ancestors, then select and focus', async () => {
    render(<Files workingDirectory="/repo" />);

    setReveal('src/foo/bar.ts', 1);

    await vi.waitFor(() => {
      expect(handleSpies.setExpanded).toHaveBeenCalled();
    });

    const expandedArg: string[] = handleSpies.setExpanded.mock.calls[0][0];
    expect(expandedArg).toContain('src/');
    expect(expandedArg).toContain('src/foo/');

    expect(handleSpies.select).toHaveBeenCalledWith('src/foo/bar.ts');
    expect(handleSpies.focus).toHaveBeenCalledWith('src/foo/bar.ts');
    expect(messageSpy.warning).not.toHaveBeenCalled();
  });

  it('(a-root) reveals root-level file: no ancestor dirs, only select+focus', async () => {
    render(<Files workingDirectory="/repo" />);

    setReveal('root.ts', 1);

    await vi.waitFor(() => {
      expect(handleSpies.select).toHaveBeenCalledWith('root.ts');
    });

    expect(handleSpies.focus).toHaveBeenCalledWith('root.ts');
    // root.ts has no ancestor dirs; setExpanded is still called but must not include 'root.ts'
    expect(handleSpies.setExpanded).toHaveBeenCalled();
    const expandedArg: string[] = handleSpies.setExpanded.mock.calls[0][0];
    expect(expandedArg).not.toContain('root.ts');
    expect(messageSpy.warning).not.toHaveBeenCalled();
  });

  it('(b) missing path triggers message.warning with localized key', async () => {
    render(<Files workingDirectory="/repo" />);

    setReveal('nonexistent/deep/file.ts', 1);

    await vi.waitFor(() => {
      expect(messageSpy.warning).toHaveBeenCalledWith('workingPanel.review.revealNotFound');
    });

    expect(handleSpies.setExpanded).not.toHaveBeenCalled();
    expect(handleSpies.select).not.toHaveBeenCalled();
    expect(handleSpies.focus).not.toHaveBeenCalled();
  });

  it('(c) bumping nonce with same path retriggers reveal', async () => {
    render(<Files workingDirectory="/repo" />);

    setReveal('src/foo/bar.ts', 1);
    await vi.waitFor(() => {
      expect(handleSpies.select).toHaveBeenCalledTimes(1);
    });

    handleSpies.select.mockClear();
    handleSpies.focus.mockClear();
    handleSpies.setExpanded.mockClear();

    // Same path, new nonce → should fire again
    setReveal('src/foo/bar.ts', 2);
    await vi.waitFor(() => {
      expect(handleSpies.select).toHaveBeenCalledTimes(1);
    });

    expect(handleSpies.focus).toHaveBeenCalledWith('src/foo/bar.ts');
    expect(handleSpies.setExpanded).toHaveBeenCalled();
  });

  it('no-op when revealRequest is null/undefined (initial state)', () => {
    // revealRequest is already undefined from beforeEach
    render(<Files workingDirectory="/repo" />);

    expect(handleSpies.setExpanded).not.toHaveBeenCalled();
    expect(handleSpies.select).not.toHaveBeenCalled();
    expect(handleSpies.focus).not.toHaveBeenCalled();
    expect(messageSpy.warning).not.toHaveBeenCalled();
  });
});
