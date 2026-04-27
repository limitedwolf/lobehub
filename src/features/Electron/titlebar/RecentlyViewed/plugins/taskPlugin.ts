import { ListTodo } from 'lucide-react';

import { type PageReference, type ResolvedPageData, type TaskParams } from '../types';
import { type PluginContext, type RecentlyViewedPlugin } from './types';
import { createPageReference } from './types';

const TASK_PATH_REGEX = /^\/task\/([^/?]+)$/;

export const taskPlugin: RecentlyViewedPlugin<'task'> = {
  checkExists(reference: PageReference<'task'>, ctx: PluginContext): boolean {
    return ctx.getTask(reference.params.taskId) !== undefined;
  },

  generateId(reference: PageReference<'task'>): string {
    return `task:${reference.params.taskId}`;
  },

  generateUrl(reference: PageReference<'task'>): string {
    return `/task/${reference.params.taskId}`;
  },

  getDefaultIcon() {
    return ListTodo;
  },

  matchUrl(pathname: string, _searchParams: URLSearchParams): boolean {
    return TASK_PATH_REGEX.test(pathname);
  },

  parseUrl(pathname: string, _searchParams: URLSearchParams): PageReference<'task'> | null {
    const match = pathname.match(TASK_PATH_REGEX);
    if (!match) return null;

    const taskId = match[1];
    const params: TaskParams = { taskId };
    const id = this.generateId({ params } as PageReference<'task'>);

    return createPageReference('task', params, id);
  },

  priority: 10,

  resolve(reference: PageReference<'task'>, ctx: PluginContext): ResolvedPageData {
    const task = ctx.getTask(reference.params.taskId);
    const hasStoreData = task !== undefined;
    const cached = reference.cached;

    return {
      exists: hasStoreData || cached !== undefined,
      icon: this.getDefaultIcon!(),
      reference,
      title: task?.name || cached?.title || ctx.t('navigation.task' as any, { ns: 'electron' }),
      url: this.generateUrl(reference),
    };
  },

  type: 'task',
};
