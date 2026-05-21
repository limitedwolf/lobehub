import { type DeviceAttachment } from '@lobechat/builtin-tool-remote-device';

import { lambdaClient } from '@/libs/trpc/client';

export const deviceService = {
  /**
   * List all online devices bound to the current user.
   * Returns devices from the device-gateway via tRPC.
   */
  listDevices: async (): Promise<DeviceAttachment[]> => {
    try {
      return await lambdaClient.device.listDevices.query();
    } catch {
      return [];
    }
  },

  /**
   * Check if the user has any online devices.
   */
  getStatus: async (): Promise<{ deviceCount: number; online: boolean }> => {
    try {
      return await lambdaClient.device.status.query();
    } catch {
      return { deviceCount: 0, online: false };
    }
  },
};
