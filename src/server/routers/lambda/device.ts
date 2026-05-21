import { z } from 'zod';

import { authedProcedure, router } from '@/libs/trpc/lambda';
import { deviceProxy } from '@/server/services/toolExecution/deviceProxy';

const CAPABILITY_TIMEOUT_MS = 5_000;

const deviceProcedure = authedProcedure.use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: { userId: ctx.userId },
  });
});

export const deviceRouter = router({
  /**
   * Probe whether a specific agent platform (openclaw / hermes) is available
   * on the given device. Dispatches a `checkPlatformCapability` tool call to
   * the device via the gateway and waits up to 5 s for a response.
   */
  checkCapability: deviceProcedure
    .input(
      z.object({
        deviceId: z.string(),
        platform: z.enum(['hermes', 'openclaw']),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceProxy.executeToolCall(
        { deviceId: input.deviceId, userId: ctx.userId },
        {
          apiName: 'checkPlatformCapability',
          arguments: JSON.stringify({ platform: input.platform }),
          identifier: 'local',
        },
        CAPABILITY_TIMEOUT_MS,
      );

      if (!result.success) {
        return { available: false, reason: result.error ?? 'Device tool call failed' };
      }

      try {
        return JSON.parse(result.content) as {
          available: boolean;
          reason?: string;
          version?: string;
        };
      } catch {
        return { available: false, reason: 'Invalid response from device' };
      }
    }),

  getDeviceSystemInfo: deviceProcedure
    .input(z.object({ deviceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return deviceProxy.queryDeviceSystemInfo(ctx.userId, input.deviceId);
    }),

  listDevices: deviceProcedure.query(async ({ ctx }) => {
    return deviceProxy.queryDeviceList(ctx.userId);
  }),

  status: deviceProcedure.query(async ({ ctx }) => {
    return deviceProxy.queryDeviceStatus(ctx.userId);
  }),
});
