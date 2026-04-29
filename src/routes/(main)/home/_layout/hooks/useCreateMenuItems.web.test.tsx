/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateMenuItems } from './useCreateMenuItems';

const createAgentMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ agentId: 'agent-cloud-claude' }),
);
const refreshAgentListMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const addGroupMock = vi.hoisted(() => vi.fn());
const switchToGroupMock = vi.hoisted(() => vi.fn());
const createGroupMock = vi.hoisted(() => vi.fn());
const loadGroupsMock = vi.hoisted(() => vi.fn());
const createNewPageMock = vi.hoisted(() => vi.fn());
const messageErrorMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const prepareCloudClaudeCodeSetupMock = vi.hoisted(() => vi.fn());

vi.mock('@lobechat/const', () => ({
  isDesktop: false,
}));

vi.mock('@lobechat/heterogeneous-agents/client', () => ({
  HETEROGENEOUS_AGENT_CLIENT_CONFIGS: [],
  getHeterogeneousAgentClientConfig: vi.fn(() => ({
    avatar: 'claude-desktop-avatar',
  })),
}));

vi.mock('@lobehub/ui', () => ({
  Icon: () => null,
}));

vi.mock('@lobehub/ui/icons', () => ({
  GroupBotSquareIcon: () => null,
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: { error: messageErrorMock },
      notification: { error: vi.fn() },
    }),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('swr/mutation', () => ({
  default: () => ({
    isMutating: false,
    trigger: vi.fn(),
  }),
}));

vi.mock('@/components/ChatGroupWizard/templates', () => ({
  useGroupTemplates: () => [],
}));

vi.mock('@/features/CloudClaudeCode/SetupModal', () => ({
  prepareCloudClaudeCodeSetup: prepareCloudClaudeCodeSetupMock,
}));

vi.mock('@/routes/(main)/home/_layout/Body/Agent/ModalProvider', () => ({
  useOptionalAgentModal: () => undefined,
}));

vi.mock('@/services/chatGroup', () => ({
  chatGroupService: {
    createGroupWithMembers: vi.fn(),
  },
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      createAgent: createAgentMock,
    }),
}));

vi.mock('@/store/agentGroup', () => ({
  useAgentGroupStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      createGroup: createGroupMock,
      loadGroups: loadGroupsMock,
    }),
}));

vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      addGroup: addGroupMock,
      refreshAgentList: refreshAgentListMock,
      switchToGroup: switchToGroupMock,
    }),
}));

vi.mock('@/store/page', () => ({
  usePageStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      createNewPage: createNewPageMock,
    }),
}));

const isActionItem = (
  item: unknown,
): item is {
  key: string;
  onClick?: (info: { domEvent?: { stopPropagation?: () => void } }) => Promise<void>;
} => !!item && typeof item === 'object' && 'key' in item;

describe('useCreateMenuItems (web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the Cloud Claude Code agent only after setup succeeds', async () => {
    prepareCloudClaudeCodeSetupMock.mockResolvedValue(true);

    const { result } = renderHook(() => useCreateMenuItems());
    const item = result.current.createCloudClaudeCodeMenuItem();

    if (!isActionItem(item)) {
      throw new Error('Expected Cloud Claude Code menu item');
    }

    await act(async () => {
      await item.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    expect(prepareCloudClaudeCodeSetupMock).toHaveBeenCalledTimes(1);
    expect(createAgentMock).toHaveBeenCalledWith({
      config: {
        agencyConfig: {
          heterogeneousProvider: {
            type: 'cloud-claude-code',
          },
        },
        avatar: 'claude-desktop-avatar',
        systemRole: '',
        title: 'Cloud Claude Code',
      },
      groupId: undefined,
    });
    expect(refreshAgentListMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/agent/agent-cloud-claude');
  });

  it('does not create the Cloud Claude Code agent when setup is cancelled', async () => {
    prepareCloudClaudeCodeSetupMock.mockResolvedValue(false);

    const { result } = renderHook(() => useCreateMenuItems());
    const item = result.current.createCloudClaudeCodeMenuItem();

    if (!isActionItem(item)) {
      throw new Error('Expected Cloud Claude Code menu item');
    }

    await act(async () => {
      await item.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    expect(prepareCloudClaudeCodeSetupMock).toHaveBeenCalledTimes(1);
    expect(createAgentMock).not.toHaveBeenCalled();
    expect(refreshAgentListMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
