export const HONO_GRAY_PREFIX = '/hono-gray';

/**
 * Routes that intentionally stay Next-native (no hono-gray duplicate exists)
 * and must never be rewritten by the gray middleware. Prefix matched.
 */
const NEXT_ONLY_PATHS = [
  '/webapi/revalidate',
  '/webapi/document/events',
  '/api/composio/oauth/callback',
  '/oidc/interaction/',
];

export const isHonoGrayEnabled = (): boolean => process.env.LOBE_HONO_GRAY_ENABLED === '1';

export const isHonoGrayPath = (pathname: string): boolean =>
  pathname === HONO_GRAY_PREFIX || pathname.startsWith(`${HONO_GRAY_PREFIX}/`);

const matchesAny = (pathname: string, list: readonly string[]): boolean =>
  list.some((p) => pathname === p || pathname.startsWith(p));

/**
 * Decide whether the gray middleware should rewrite a backend API request to
 * the `/hono-gray/*` shell. Returns the rewritten pathname, or null when the
 * request must stay on the canary next handler.
 *
 * `extraNextOnly` lets the cloud layer add its own Next-only prefixes (e.g.
 * `/cron/`) without modifying this open-source helper.
 */
export const resolveGrayRewrite = (
  pathname: string,
  extraNextOnly: readonly string[] = [],
): string | null => {
  if (!isHonoGrayEnabled()) return null;
  if (isHonoGrayPath(pathname)) return null;
  if (matchesAny(pathname, NEXT_ONLY_PATHS)) return null;
  if (extraNextOnly.length > 0 && matchesAny(pathname, extraNextOnly)) return null;
  return `${HONO_GRAY_PREFIX}${pathname}`;
};
