import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskTemplateRecommendationsUIState } from '@/features/RecommendTaskTemplates/useTaskTemplateRecommendationsUI';

import { DEFAULT_TASK_LIST_VIEW_OPTIONS } from './listViewOptions';
import TaskList from './TaskList';

const mocks = vi.hoisted(() => ({
  recommendationsState: { mode: 'hidden' } as TaskTemplateRecommendationsUIState,
  taskState: {
    isTaskListInit: true,
    tasks: [] as Array<{ identifier: string; status: string }>,
  },
  useTaskTemplateRecommendationsUI: vi.fn(),
}));

vi.mock('@lobehub/ui', () => {
  const Div = ({ children, ...props }: any) => <div {...props}>{children}</div>;

  return {
    Accordion: Div,
    AccordionItem: ({ children, title }: any) => (
      <section>
        <header>{title}</header>
        {children}
      </section>
    ),
    Block: Div,
    Center: Div,
    Empty: ({ description }: { description: string }) => <div>{description}</div>,
    Flexbox: Div,
    Icon: () => <span data-testid="icon" />,
    Skeleton: {
      Avatar: () => <div data-testid="skeleton-avatar" />,
      Button: () => <div data-testid="skeleton-button" />,
      Input: () => <div data-testid="skeleton-input" />,
    },
    Text: Div,
  };
});

vi.mock('antd', () => ({
  Divider: () => <hr />,
}));

vi.mock('antd-style', () => ({
  cssVar: {
    colorBorder: '#ddd',
    colorTextDescription: '#999',
    orange: '#f60',
  },
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

vi.mock('@/features/RecommendTaskTemplates/TaskTemplateRecommendationsView', () => ({
  TaskTemplateRecommendationsView: ({ state }: { state: TaskTemplateRecommendationsUIState }) => (
    <div data-testid="task-template-recommendations">{state.mode}</div>
  ),
}));

vi.mock('@/features/RecommendTaskTemplates/useTaskTemplateRecommendationsUI', () => ({
  useTaskTemplateRecommendationsUI: mocks.useTaskTemplateRecommendationsUI,
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: typeof mocks.taskState) => unknown) => selector(mocks.taskState),
}));

vi.mock('../features/AgentTaskItem', () => ({
  default: ({ task }: { task: { identifier: string } }) => <div>{task.identifier}</div>,
}));

vi.mock('../features/AssigneeAvatar', () => ({
  default: () => <span data-testid="assignee-avatar" />,
}));

vi.mock('../features/icons/PriorityHighIcon', () => ({
  default: () => <span data-testid="priority-high-icon" />,
}));

vi.mock('../features/icons/PriorityLowIcon', () => ({
  default: () => <span data-testid="priority-low-icon" />,
}));

vi.mock('../features/icons/PriorityMediumIcon', () => ({
  default: () => <span data-testid="priority-medium-icon" />,
}));

vi.mock('../features/icons/PriorityNoneIcon', () => ({
  default: () => <span data-testid="priority-none-icon" />,
}));

vi.mock('../features/icons/PriorityUrgentIcon', () => ({
  default: () => <span data-testid="priority-urgent-icon" />,
}));

vi.mock('../features/TaskStatusIcon', () => ({
  default: () => <span data-testid="task-status-icon" />,
}));

vi.mock('../shared/useAgentDisplayMeta', () => ({
  useAgentDisplayMeta: () => ({ title: 'Agent' }),
}));

describe('TaskList recommendations empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recommendationsState = { mode: 'hidden' };
    mocks.taskState = {
      isTaskListInit: true,
      tasks: [],
    };
    mocks.useTaskTemplateRecommendationsUI.mockImplementation(() => mocks.recommendationsState);
  });

  it('renders recommended task templates on the empty task list', () => {
    mocks.recommendationsState = {
      mode: 'cards',
      onCreated: vi.fn(),
      onDismiss: vi.fn(),
      recommendationBatchId: 'batch-1',
      templates: [],
      userInterestCount: 0,
    };

    render(<TaskList options={DEFAULT_TASK_LIST_VIEW_OPTIONS} />);

    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(screen.getByText('Try these tasks')).toBeInTheDocument();
    expect(screen.getByTestId('task-template-recommendations')).toHaveTextContent('cards');
    expect(mocks.useTaskTemplateRecommendationsUI).toHaveBeenCalledWith({ enabled: true });
  });

  it('keeps the recommendation request disabled while the task list is still loading', () => {
    mocks.taskState = {
      isTaskListInit: false,
      tasks: [],
    };

    render(<TaskList options={DEFAULT_TASK_LIST_VIEW_OPTIONS} />);

    expect(mocks.useTaskTemplateRecommendationsUI).toHaveBeenCalledWith({ enabled: false });
    expect(screen.queryByTestId('task-template-recommendations')).not.toBeInTheDocument();
  });
});
