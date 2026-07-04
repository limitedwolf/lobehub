import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hourlyWorkflowHandler } from '../hourly';

const mocks = vi.hoisted(() => ({
  createExecutor: vi.fn(),
  getUsersForHourlyExtraction: vi.fn(),
  hourlyEnabled: true,
  triggerHourly: vi.fn(),
  triggerProcessUsers: vi.fn(),
}));

vi.mock('@/envs/app', () => ({
  appEnv: {
    APP_URL: 'https://app.example.com',
    INTERNAL_APP_URL: undefined,
  },
}));

vi.mock('@/server/globalConfig/parseMemoryExtractionConfig', () => ({
  parseMemoryExtractionConfig: () => ({
    hourlyEnabled: mocks.hourlyEnabled,
    upstashWorkflowExtraHeaders: {},
    webhook: { baseUrl: 'https://app.example.com' },
  }),
}));

vi.mock('@/server/services/memory/userMemory/extract', () => ({
  buildWorkflowPayloadInput: (payload: unknown) => payload,
  MemoryExtractionExecutor: {
    create: mocks.createExecutor,
  },
  MemoryExtractionWorkflowService: {
    triggerHourly: mocks.triggerHourly,
    triggerProcessUsers: mocks.triggerProcessUsers,
  },
  normalizeMemoryExtractionPayload: (payload: unknown) => payload,
}));

vi.mock('../runGuard', () => ({
  assertMemoryWorkflowContextAllowed: vi.fn(),
}));

describe('hourlyWorkflowHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hourlyEnabled = true;
    mocks.createExecutor.mockResolvedValue({
      getUsersForHourlyExtraction: mocks.getUsersForHourlyExtraction,
    });
    mocks.triggerHourly.mockResolvedValue({ workflowRunId: 'next-page-run' });
    mocks.triggerProcessUsers.mockResolvedValue({ workflowRunId: 'process-users-run' });
  });

  it('bails out before any fan-out when the hourly kill switch is disabled', async () => {
    mocks.hourlyEnabled = false;

    const context = {
      requestPayload: { dryRun: false },
      run: vi.fn((_name: string, callback: () => unknown) => callback()),
    };

    await expect(hourlyWorkflowHandler(context as never)).resolves.toMatchObject({
      processedUsers: 0,
    });
    // No user listing, no per-user fan-out, no next-page scheduling.
    expect(context.run).not.toHaveBeenCalled();
    expect(mocks.createExecutor).not.toHaveBeenCalled();
    expect(mocks.getUsersForHourlyExtraction).not.toHaveBeenCalled();
    expect(mocks.triggerProcessUsers).not.toHaveBeenCalled();
    expect(mocks.triggerHourly).not.toHaveBeenCalled();
  });

  it('continues pagination when Upstash restores the user batch cursor as JSON', async () => {
    /**
     * @example
     * await expect(hourlyWorkflowHandler(context)).resolves.toMatchObject({ hasNextPage: true });
     */
    // ROOT CAUSE:
    //
    // Upstash Workflow persists context.run results as JSON between steps.
    // Date values returned from the user listing step come back as ISO strings.
    //
    // Before the fix, hourlyWorkflowHandler called:
    // userBatch.cursor.createdAt.toISOString()
    //
    // We should normalize that boundary before scheduling the next page.
    mocks.getUsersForHourlyExtraction.mockResolvedValue({
      cursor: {
        createdAt: '2024-07-02T09:36:44.073Z',
        id: 'user_2igX4ULK7Q2tADwibFkEpng0xRc',
      },
      ids: ['user_2gmT7yMAt730UeHuzNpjZiw4Z2X'],
    });

    const context = {
      requestPayload: { dryRun: true },
      run: vi.fn((_name: string, callback: () => unknown) => callback()),
    };

    await expect(hourlyWorkflowHandler(context as never)).resolves.toMatchObject({
      dryRun: true,
      hasNextPage: true,
      processedUsers: 1,
      scheduledBatches: 0,
    });
    expect(mocks.triggerHourly).toHaveBeenCalledWith(
      {
        baseUrl: 'https://app.example.com',
        cursor: {
          createdAt: '2024-07-02T09:36:44.073Z',
          id: 'user_2igX4ULK7Q2tADwibFkEpng0xRc',
        },
        dryRun: true,
      },
      { extraHeaders: {} },
    );
  });
});
