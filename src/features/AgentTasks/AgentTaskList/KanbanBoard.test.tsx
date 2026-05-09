import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskTemplateRecommendationsUIState } from '@/features/RecommendTaskTemplates/useTaskTemplateRecommendationsUI';

import KanbanBoard from './KanbanBoard';

const mocks = vi.hoisted(() => ({
  recommendationsState: { mode: 'hidden' } as TaskTemplateRecommendationsUIState,
  taskState: {
    isTaskGroupListInit: true,
    taskGroups: [] as Array<{ key: string; tasks: unknown[]; total: number }>,
    updateTaskStatus: vi.fn(),
    useFetchTaskGroupList: vi.fn(),
  },
  useTaskTemplateRecommendationsUI: vi.fn(),
}));

vi.mock('@dnd-kit/core', () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  return {
    DndContext: Wrapper,
    DragOverlay: Wrapper,
    KeyboardSensor: vi.fn(),
    PointerSensor: vi.fn(),
    pointerWithin: vi.fn(),
    useSensor: vi.fn((sensor, options) => ({ options, sensor })),
    useSensors: vi.fn((...sensors) => sensors),
  };
});

vi.mock('@lobehub/ui', () => {
  const Div = ({ children, ...props }: any) => <div {...props}>{children}</div>;

  return {
    Block: Div,
    Center: Div,
    Empty: ({ description }: { description: string }) => <div>{description}</div>,
    Flexbox: Div,
    Icon: () => <span data-testid="icon" />,
    Text: Div,
  };
});

vi.mock('antd-style', () => ({
  cssVar: {
    colorFillSecondary: '#222',
    colorTextSecondary: '#999',
  },
  createStaticStyles: () => ({
    board: 'board',
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: (namespace: string) => ({
    t: (key: string) => {
      const translations: Record<string, Record<string, string>> = {
        chat: {
          'taskList.empty': 'No tasks yet',
        },
        taskTemplate: {
          'section.title': 'Try these tasks',
        },
      };

      return translations[namespace]?.[key] ?? key;
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/features/RecommendTaskTemplates/TaskTemplateRecommendationsView', () => ({
  TaskTemplateRecommendationsView: ({ state }: { state: TaskTemplateRecommendationsUIState }) => (
    <div data-testid="task-template-recommendations">{state.mode}</div>
  ),
}));

vi.mock('@/features/RecommendTaskTemplates/useTaskTemplateRecommendationsUI', () => ({
  useTaskTemplateRecommendationsUI: mocks.useTaskTemplateRecommendationsUI,
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (
    selector: (state: {
      hiddenColumns: string[];
      hiddenPanelCollapsed: boolean;
      updateSystemStatus: () => void;
    }) => unknown,
  ) =>
    selector({
      hiddenColumns: [],
      hiddenPanelCollapsed: false,
      updateSystemStatus: vi.fn(),
    }),
}));

vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: {
    taskKanbanHiddenColumns: (state: { hiddenColumns: string[] }) => state.hiddenColumns,
    taskKanbanHiddenPanelCollapsed: (state: { hiddenPanelCollapsed: boolean }) =>
      state.hiddenPanelCollapsed,
  },
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: typeof mocks.taskState) => unknown) => selector(mocks.taskState),
}));

vi.mock('../CreateTaskModal', () => ({
  createTaskModal: vi.fn(),
}));

vi.mock('../features/AgentTaskItem', () => ({
  default: ({ task }: { task: { identifier: string } }) => <div>{task.identifier}</div>,
}));

vi.mock('./HiddenColumnsPanel', () => ({
  default: () => <div data-testid="hidden-columns-panel" />,
}));

vi.mock('./KanbanColumn', () => ({
  COLUMN_I18N_KEYS: {
    backlog: 'taskList.status.backlog',
    canceled: 'taskList.status.canceled',
    done: 'taskList.status.done',
    needsInput: 'taskList.status.needsInput',
    running: 'taskList.status.running',
  },
  COLUMN_STATUS_ICON: {
    backlog: null,
    canceled: null,
    done: null,
    needsInput: null,
    running: null,
  },
  COLUMN_WIDTH: 280,
  default: ({ columnKey, loading }: { columnKey: string; loading?: boolean }) => (
    <div data-testid={`kanban-column-${columnKey}`}>{loading ? 'loading' : columnKey}</div>
  ),
}));

describe('KanbanBoard recommendations empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recommendationsState = { mode: 'hidden' };
    mocks.taskState = {
      isTaskGroupListInit: true,
      taskGroups: [],
      updateTaskStatus: vi.fn(),
      useFetchTaskGroupList: vi.fn(),
    };
    mocks.useTaskTemplateRecommendationsUI.mockImplementation(() => mocks.recommendationsState);
  });

  it('renders recommended task templates when the kanban task list is empty', () => {
    mocks.recommendationsState = {
      mode: 'cards',
      onCreated: vi.fn(),
      onDismiss: vi.fn(),
      recommendationBatchId: 'batch-1',
      templates: [],
      userInterestCount: 0,
    };

    render(<KanbanBoard />);

    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(screen.getByText('Try these tasks')).toBeInTheDocument();
    expect(screen.getByTestId('task-template-recommendations')).toHaveTextContent('cards');
    expect(mocks.useTaskTemplateRecommendationsUI).toHaveBeenCalledWith({ enabled: true });
  });

  it('keeps the recommendation request disabled while kanban columns are loading', () => {
    mocks.taskState = {
      isTaskGroupListInit: false,
      taskGroups: [],
      updateTaskStatus: vi.fn(),
      useFetchTaskGroupList: vi.fn(),
    };

    render(<KanbanBoard />);

    expect(mocks.useTaskTemplateRecommendationsUI).toHaveBeenCalledWith({ enabled: false });
    expect(screen.queryByTestId('task-template-recommendations')).not.toBeInTheDocument();
  });
});
