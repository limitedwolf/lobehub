import { ListTodo } from 'lucide-react';

import { getRouteById } from '@/config/routes';

import { type PageReference, type ResolvedPageData, type TasksParams } from '../types';
import { type PluginContext, type RecentlyViewedPlugin } from './types';
import { createPageReference } from './types';

const tasksIcon = getRouteById('tasks')?.icon || ListTodo;

export const tasksPlugin: RecentlyViewedPlugin<'tasks'> = {
  checkExists(_reference: PageReference<'tasks'>, _ctx: PluginContext): boolean {
    return true;
  },

  generateId(_reference: PageReference<'tasks'>): string {
    return 'tasks';
  },

  generateUrl(_reference: PageReference<'tasks'>): string {
    return '/tasks';
  },

  getDefaultIcon() {
    return tasksIcon;
  },

  matchUrl(pathname: string, _searchParams: URLSearchParams): boolean {
    return pathname === '/tasks';
  },

  parseUrl(_pathname: string, _searchParams: URLSearchParams): PageReference<'tasks'> | null {
    const params: TasksParams = {};
    const id = this.generateId({ params } as PageReference<'tasks'>);

    return createPageReference('tasks', params, id);
  },

  priority: 5,

  resolve(reference: PageReference<'tasks'>, ctx: PluginContext): ResolvedPageData {
    return {
      exists: true,
      icon: this.getDefaultIcon!(),
      reference,
      title: ctx.t('navigation.tasks' as any, { ns: 'electron' }) as string,
      url: this.generateUrl(reference),
    };
  },

  type: 'tasks',
};
