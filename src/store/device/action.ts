import { type SWRResponse } from 'swr';

import {
  nextWorkingDirs,
  type WorkingDirEntry,
} from '@/features/ChatInput/RuntimeConfig/deviceCwd';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';
import { type StoreSetter } from '@/store/types';

import { type DeviceListItem } from './initialState';
import { type DeviceStore } from './store';

const FETCH_DEVICES_KEY = 'device:listDevices';

type Setter = StoreSetter<DeviceStore>;

export const deviceSlice = (set: Setter, get: () => DeviceStore, _api?: unknown) =>
  new DeviceActionImpl(set, get, _api);

export class DeviceActionImpl {
  readonly #get: () => DeviceStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => DeviceStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  /**
   * Persist a working-directory choice to a device (`defaultCwd` + `workingDirs`)
   * with an optimistic store update, then revalidate from the server. Pass
   * `setDefault: false` to record the dir in the recent list without repointing
   * the device's default cwd.
   */
  updateDeviceCwd = async (
    deviceId: string,
    entry: WorkingDirEntry,
    options: { setDefault?: boolean } = {},
  ): Promise<void> => {
    const trimmed = entry.path.trim();
    if (!trimmed) return;
    const setDefault = options.setDefault ?? true;

    const device = this.#get().devices.find((d) => d.deviceId === deviceId);
    const updatedDirs = nextWorkingDirs(entry, device?.workingDirs ?? []);

    // Optimistic: patch the touched device in place. Spreading widens the item
    // out of the listDevices union, so re-assert the element type.
    this.#set(
      {
        devices: this.#get().devices.map((d) =>
          d.deviceId === deviceId
            ? { ...d, ...(setDefault ? { defaultCwd: trimmed } : {}), workingDirs: updatedDirs }
            : d,
        ) as DeviceListItem[],
      },
      false,
      'updateDeviceCwd',
    );

    try {
      await lambdaClient.device.updateDevice.mutate({
        deviceId,
        ...(setDefault ? { defaultCwd: trimmed } : {}),
        workingDirs: updatedDirs,
      });
    } finally {
      // Re-fetch the truth (self-corrects a failed optimistic write).
      await mutate(FETCH_DEVICES_KEY);
    }
  };

  useFetchDevices = (enabled = true): SWRResponse<DeviceListItem[]> =>
    useClientDataSWR<DeviceListItem[]>(
      enabled ? FETCH_DEVICES_KEY : null,
      () => lambdaClient.device.listDevices.query(),
      {
        fallbackData: [],
        onSuccess: (data) => {
          this.#set({ devices: data, isDevicesInit: true }, false, 'fetchDevices');
        },
      },
    );
}

export type DeviceAction = Pick<DeviceActionImpl, keyof DeviceActionImpl>;
