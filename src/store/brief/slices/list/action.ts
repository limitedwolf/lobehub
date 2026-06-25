import { TRPCClientError } from '@trpc/client';
import isEqual from 'fast-deep-equal';
import { type SWRResponse } from 'swr';

import { useClientDataSWRWithSync } from '@/libs/swr';
import { briefKeys } from '@/libs/swr/keys';
import { briefService } from '@/services/brief';
import { taskService } from '@/services/task';
import { type BriefStore } from '@/store/brief/store';
import { type BriefItem } from '@/store/brief/types';
import { type StoreSetter } from '@/store/types';
import { setNamespace } from '@/utils/storeDebug';

const n = setNamespace('briefList');

/** True when a mutation targeted a brief that no longer exists server-side. */
const isBriefGoneError = (error: unknown): boolean =>
  error instanceof TRPCClientError &&
  (error.data as { code?: string } | null | undefined)?.code === 'NOT_FOUND';

type Setter = StoreSetter<BriefStore>;

export const createBriefListSlice = (set: Setter, get: () => BriefStore, _api?: unknown) =>
  new BriefListActionImpl(set, get, _api);

export class BriefListActionImpl {
  readonly #get: () => BriefStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => BriefStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  internal_updateBrief = (id: string, data: Partial<BriefItem>) => {
    const briefs = this.#get().briefs;
    const index = briefs.findIndex((b) => b.id === id);
    if (index === -1) return;

    const updated = [...briefs];
    updated[index] = { ...briefs[index], ...data };
    this.#set({ briefs: updated }, false, n('internal_updateBrief'));
  };

  /** Drop a brief from the home feed locally (no server call) — used to
   * reconcile a stale card whose brief is already gone server-side. */
  internal_dismissBrief = (id: string) => {
    const briefs = this.#get().briefs;
    if (!briefs.some((b) => b.id === id)) return;
    this.#set({ briefs: briefs.filter((b) => b.id !== id) }, false, n('internal_dismissBrief'));
  };

  deleteBrief = async (id: string) => {
    await briefService.delete(id);
    const briefs = this.#get().briefs.filter((b) => b.id !== id);
    this.#set({ briefs }, false, n('deleteBrief'));
  };

  markBriefRead = async (id: string) => {
    await briefService.markRead(id);
    this.internal_updateBrief(id, { readAt: new Date().toISOString() });
  };

  resolveBrief = async (id: string, action?: string, comment?: string) => {
    try {
      await briefService.resolve(id, { action, comment });
    } catch (error) {
      // A stale card whose brief was already resolved/removed elsewhere yields
      // NOT_FOUND. Drop it from the home feed so the card self-heals even on
      // surfaces (the DailyBrief home list) that don't pass an onAfterResolve
      // refetch. Re-throw so the caller still surfaces the failure toast.
      if (isBriefGoneError(error)) this.internal_dismissBrief(id);
      throw error;
    }
    this.internal_updateBrief(id, {
      resolvedAction: action,
      resolvedAt: new Date().toISOString(),
    });
  };

  // Free-form feedback from the brief card: resolve the brief with the
  // user's text (so the heartbeat re-arm gate in TaskLifecycle no longer
  // sees an unresolved urgent brief), then re-run the task so the agent
  // picks up `resolvedComment` in its next prompt. Without this, the brief
  // stays unresolved and the task is parked forever in `human-waiting`.
  submitFeedback = async (briefId: string, taskId: string, content: string) => {
    await this.resolveBrief(briefId, 'feedback', content);
    try {
      await taskService.run(taskId);
    } catch (error) {
      // CONFLICT means a run is already in flight (e.g. the user resolved
      // multiple briefs at once) — the in-flight run will read the freshly
      // resolved comment, so the resolve still does its job.
      console.warn('[BriefStore] submitFeedback: task.run failed', error);
    }
  };

  useFetchBriefs = (isLogin: boolean | undefined): SWRResponse<BriefItem[]> => {
    return useClientDataSWRWithSync<BriefItem[]>(
      isLogin === true ? briefKeys.list(isLogin) : null,
      async () => {
        const result = await briefService.listUnresolved();
        return result.data as BriefItem[];
      },
      {
        onData: (data) => {
          if (this.#get().isBriefsInit && isEqual(this.#get().briefs, data)) return;

          this.#set({ briefs: data, isBriefsInit: true }, false, n('useFetchBriefs/onData'));
        },
      },
    );
  };
}

export type BriefListAction = Pick<BriefListActionImpl, keyof BriefListActionImpl>;
