'use client';

import { usePermission } from '@/hooks/usePermission';

/**
 * Whether the current user can type into the page right now.
 *
 * CRDT collaboration replaces the old single-writer document lock. Body
 * editability is therefore a permission decision; transport health is surfaced
 * separately and must not force the editor into lock-derived read-only mode.
 */
export const usePageEditable = (): boolean => {
  const { allowed: hasEditPermission } = usePermission('edit_own_content');

  return hasEditPermission;
};
