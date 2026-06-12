import type { ChatCompletionErrorPayload } from '@lobechat/model-runtime';
import { AgentRuntimeErrorType } from '@lobechat/model-runtime';
import { isRecord } from '@lobechat/utils';
import { NextResponse } from 'next/server';

import { checkAuth } from '@/app/(backend)/middleware/auth';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { createErrorResponse } from '@/utils/errorResponse';

import { resolveValidWorkspaceIdFromRequest } from '../../_utils/workspace';

const MAX_ERROR_DEPTH = 4;

const SENSITIVE_ERROR_FIELDS = new Set([
  'api-key',
  'apikey',
  'auth',
  'authorization',
  'bearer',
  'config',
  'credential',
  'credentials',
  'headers',
  'key',
  'ocp-apim-subscription-key',
  'options',
  'password',
  'private-key',
  'private_key',
  'request',
  'secret',
  'stack',
  'token',
  'x-api-key',
]);

const SENSITIVE_ERROR_FIELD_PATTERNS = [
  /accesskey/,
  /apikey/,
  /authorization/,
  /credential/,
  /password/,
  /privatekey/,
  /secret/,
  /token/,
];

const ERROR_FIELDS_TO_PRESERVE = [
  'code',
  'param',
  'request_id',
  'requestID',
  'status',
  'statusCode',
  'type',
] as const;

const normalizeErrorFieldKey = (key: string) => key.toLowerCase().replaceAll(/[-_\s]/g, '');

const isSensitiveField = (key: string) => {
  const normalizedKey = normalizeErrorFieldKey(key);

  return (
    SENSITIVE_ERROR_FIELDS.has(key.toLowerCase()) ||
    SENSITIVE_ERROR_FIELDS.has(normalizedKey) ||
    SENSITIVE_ERROR_FIELD_PATTERNS.some((pattern) => pattern.test(normalizedKey))
  );
};

const toJsonSafeValue = (value: unknown, seen = new WeakSet<object>(), depth = 0): unknown => {
  if (value === null) return null;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol')
    return;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    if (depth >= MAX_ERROR_DEPTH) return '[Truncated]';

    seen.add(value);

    return value.map((item) => toJsonSafeValue(item, seen, depth + 1) ?? null);
  }

  if (!isRecord(value)) return String(value);

  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_ERROR_DEPTH) return '[Truncated]';

  seen.add(value);

  if (value instanceof Error) {
    const errorValue: Record<string, unknown> = {
      message: value.message,
      name: value.name,
    };

    for (const key of ERROR_FIELDS_TO_PRESERVE) {
      const fieldValue = (value as unknown as Record<string, unknown>)[key];
      const safeValue = toJsonSafeValue(fieldValue, seen, depth + 1);

      if (safeValue !== undefined) errorValue[key] = safeValue;
    }

    const cause = toJsonSafeValue(value.cause, seen, depth + 1);
    if (cause !== undefined) errorValue.cause = cause;

    for (const [key, fieldValue] of Object.entries(value)) {
      if (isSensitiveField(key)) continue;

      const safeValue = toJsonSafeValue(fieldValue, seen, depth + 1);
      if (safeValue !== undefined) errorValue[key] = safeValue;
    }

    return errorValue;
  }

  const result: Record<string, unknown> = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (isSensitiveField(key)) continue;

    const safeValue = toJsonSafeValue(fieldValue, seen, depth + 1);
    if (safeValue !== undefined) result[key] = safeValue;
  }

  return result;
};

const normalizeModelFetchError = (error: unknown): Record<string, unknown> => {
  const safeError = toJsonSafeValue(error);

  if (isRecord(safeError)) return safeError as Record<string, unknown>;

  return { message: safeError === undefined ? 'Unknown error' : String(safeError) };
};

const extractModelFetchErrorMessage = (
  error: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): string | undefined => {
  if (error === null || error === undefined) return;
  if (typeof error === 'string') return error || undefined;
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error);
  }
  if (!isRecord(error)) return;
  if (seen.has(error) || depth >= MAX_ERROR_DEPTH) return;

  seen.add(error);

  const record = error as Record<string, unknown>;
  const nestedErrorKeys = ['error', 'body', 'cause', 'response', 'detail', 'details', 'reason'];

  for (const key of nestedErrorKeys) {
    const message = extractModelFetchErrorMessage(record[key], seen, depth + 1);
    if (message) return message;
  }

  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      const message = extractModelFetchErrorMessage(item, seen, depth + 1);
      if (message) return message;
    }
  }

  if (error instanceof Error && error.message) return error.message;
  if (typeof record.message === 'string' && record.message) return record.message;
  if (typeof record.status === 'number') return `HTTP ${record.status}`;
  if (typeof record.statusCode === 'number') return `HTTP ${record.statusCode}`;
};

const normalizeModelListResponse = (list: unknown) => toJsonSafeValue(list);

export const GET = checkAuth(async (req, { params, userId, serverDB }) => {
  const provider = (await params)!.provider!;

  try {
    const workspaceId = await resolveValidWorkspaceIdFromRequest({ req, serverDB, userId });

    // Read user's provider config from database
    const agentRuntime = await initModelRuntimeFromDB(serverDB, userId, provider, workspaceId);

    const list = await agentRuntime.models();

    return NextResponse.json(normalizeModelListResponse(list));
  } catch (e) {
    const errorPayload = isRecord(e) ? (e as Partial<ChatCompletionErrorPayload>) : undefined;
    const errorType = errorPayload?.errorType || AgentRuntimeErrorType.ProviderBizError;
    const errorContent = errorPayload?.error;

    const error = errorContent || e;
    const message = extractModelFetchErrorMessage(error) || errorPayload?.message;
    // track the error at server side
    console.error(`Route: [${provider}] ${errorType}:`, error);

    return createErrorResponse(errorType, {
      error: normalizeModelFetchError(error),
      message,
      provider,
    });
  }
});
