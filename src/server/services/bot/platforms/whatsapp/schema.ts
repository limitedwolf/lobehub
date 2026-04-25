import { DEFAULT_BOT_DEBOUNCE_MS, MAX_BOT_DEBOUNCE_MS } from '@lobechat/const';

import { displayToolCallsField, userIdField } from '../const';
import type { FieldSchema } from '../types';

export const schema: FieldSchema[] = [
  {
    key: 'applicationId',
    description: 'channel.whatsapp.phoneNumberIdHint',
    label: 'channel.whatsapp.phoneNumberId',
    placeholder: 'channel.whatsapp.phoneNumberIdPlaceholder',
    required: true,
    type: 'string',
  },
  {
    key: 'credentials',
    label: 'channel.credentials',
    properties: [
      {
        key: 'accessToken',
        description: 'channel.whatsapp.accessTokenHint',
        label: 'channel.whatsapp.accessToken',
        required: true,
        type: 'password',
      },
      {
        key: 'verifyToken',
        description: 'channel.whatsapp.verifyTokenHint',
        label: 'channel.whatsapp.verifyToken',
        required: true,
        type: 'password',
      },
      {
        key: 'appSecret',
        description: 'channel.whatsapp.appSecretHint',
        label: 'channel.whatsapp.appSecret',
        required: true,
        type: 'password',
      },
    ],
    type: 'object',
  },
  {
    key: 'settings',
    label: 'channel.settings',
    properties: [
      {
        key: 'charLimit',
        default: 4000,
        description: 'channel.charLimitHint',
        label: 'channel.charLimit',
        maximum: 4096,
        minimum: 100,
        type: 'number',
      },
      {
        key: 'concurrency',
        default: 'queue',
        description: 'channel.concurrencyHint',
        enum: ['queue', 'debounce'],
        enumLabels: ['channel.concurrencyQueue', 'channel.concurrencyDebounce'],
        label: 'channel.concurrency',
        type: 'string',
      },
      {
        key: 'debounceMs',
        default: DEFAULT_BOT_DEBOUNCE_MS,
        description: 'channel.debounceMsHint',
        label: 'channel.debounceMs',
        maximum: MAX_BOT_DEBOUNCE_MS,
        minimum: 100,
        type: 'number',
        visibleWhen: { field: 'concurrency', value: 'debounce' },
      },
      {
        key: 'showUsageStats',
        default: false,
        description: 'channel.showUsageStatsHint',
        label: 'channel.showUsageStats',
        type: 'boolean',
      },
      displayToolCallsField,
      userIdField,
    ],
    type: 'object',
  },
];
