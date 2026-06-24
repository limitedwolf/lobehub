/**
 * @vitest-environment happy-dom
 */
import { act, render } from '@testing-library/react';
import type * as ReactModule from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EditorCanvas from './index';

const mocks = vi.hoisted(() => {
  const agentListeners = new Set<() => void>();
  const updateAgentConfig = vi.fn();
  const agentState = {
    config: {
      editorData: undefined,
      systemRole: 'readonly prompt',
    },
    streamingSystemRole: undefined as string | undefined,
    streamingSystemRoleInProgress: false,
    updateAgentConfig,
  };

  return {
    agentListeners,
    agentState,
    editor: {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
    },
    editorProps: {
      last: undefined as any,
    },
    handleContentChange: vi.fn(),
    permission: {
      allowed: false,
      reason: 'requires member',
    },
    profileState: {
      hasEdited: false,
      lockState: { holderId: null, lockedByOther: false, pending: false },
      setHasEdited: vi.fn(),
    },
    setAgentState: (partial: Partial<typeof agentState>) => {
      Object.assign(agentState, partial);
      for (const listener of agentListeners) listener();
    },
    updateAgentConfig,
  };
});

vi.mock('@lobehub/editor/react', () => ({
  Editor: Object.assign(
    vi.fn((props: any) => {
      mocks.editorProps.last = props;
      return <div data-testid="profile-editor" />;
    }),
    { withProps: (_plugin: unknown, props: unknown) => ({ props }) },
  ),
}));

vi.mock('@lobehub/editor', () => ({
  ReactMentionPlugin: vi.fn(),
  ReactTablePlugin: vi.fn(),
  ReactToolbarPlugin: vi.fn(),
}));

vi.mock('@/features/ChatInput/InputEditor/plugins', () => ({
  createChatInputRichPlugins: () => [],
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => mocks.permission,
}));

vi.mock('@/store/agent', async () => {
  const React = (await vi.importActual('react')) as typeof ReactModule;

  return {
    useAgentStore: (selector: any) =>
      React.useSyncExternalStore(
        (listener) => {
          mocks.agentListeners.add(listener);
          return () => {
            mocks.agentListeners.delete(listener);
          };
        },
        () => selector(mocks.agentState),
        () => selector(mocks.agentState),
      ),
  };
});

vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    currentAgentConfig: (s: any) => s.config,
  },
}));

vi.mock('../ProfileEditor/MentionList', () => ({
  useMentionOptions: () => undefined,
}));

vi.mock('../store', () => ({
  useProfileStore: (selector: any) =>
    selector({
      editor: mocks.editor,
      handleContentChange: mocks.handleContentChange,
      ...mocks.profileState,
    }),
}));

vi.mock('./TypoBar', () => ({
  default: () => <div />,
}));

vi.mock('./useSlashItems', () => ({
  useSlashItems: () => [],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Agent profile EditorCanvas', () => {
  beforeEach(() => {
    mocks.agentState.config = {
      editorData: undefined,
      systemRole: 'readonly prompt',
    };
    mocks.agentState.streamingSystemRole = undefined;
    mocks.agentState.streamingSystemRoleInProgress = false;
    mocks.editor.getDocument.mockReset();
    mocks.editor.setDocument.mockReset();
    mocks.editorProps.last = undefined;
    mocks.handleContentChange.mockReset();
    mocks.permission.allowed = false;
    mocks.permission.reason = 'requires member';
    mocks.profileState.lockState = { holderId: null, lockedByOther: false, pending: false };
    mocks.profileState.setHasEdited.mockReset();
    mocks.updateAgentConfig.mockReset();
    vi.useRealTimers();
  });

  it('passes editable=false to the editor when workspace permission blocks edits', () => {
    render(<EditorCanvas />);

    expect(mocks.editorProps.last?.editable).toBe(false);
  });

  it('uses the rich-editor placeholder key', () => {
    render(<EditorCanvas />);

    expect(mocks.editorProps.last?.lineEmptyPlaceholder).toBe(
      'settingAgent.prompt.editorPlaceholder',
    );
    expect(mocks.editorProps.last?.placeholder).toBe('settingAgent.prompt.editorPlaceholder');
  });

  it('keeps the existing prompt visible while streaming starts with empty content', () => {
    mocks.permission.allowed = true;

    render(<EditorCanvas />);

    act(() => {
      mocks.editorProps.last?.onInit();
    });

    mocks.editor.setDocument.mockClear();
    act(() => {
      mocks.setAgentState({
        streamingSystemRole: '',
        streamingSystemRoleInProgress: true,
      });
    });

    expect(mocks.editor.setDocument).not.toHaveBeenCalled();
  });

  it('replaces the editor with the completed prompt after streaming finishes', async () => {
    vi.useFakeTimers();
    mocks.permission.allowed = true;

    render(<EditorCanvas />);

    act(() => {
      mocks.editorProps.last?.onInit();
    });

    mocks.editor.setDocument.mockClear();
    await act(async () => {
      mocks.setAgentState({
        streamingSystemRole: 'generated prompt',
        streamingSystemRoleInProgress: true,
      });
    });

    expect(mocks.editor.setDocument).not.toHaveBeenCalled();

    await act(async () => {
      mocks.setAgentState({
        config: {
          editorData: undefined,
          systemRole: 'generated prompt',
        },
        streamingSystemRole: undefined,
        streamingSystemRoleInProgress: false,
      });
    });

    expect(mocks.editor.setDocument).toHaveBeenCalledWith('markdown', 'generated prompt');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mocks.handleContentChange).toHaveBeenCalledWith(mocks.updateAgentConfig);
  });
});
