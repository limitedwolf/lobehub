import { oidcCallbackDesktopAPIHandler } from '~server/api-runtime/oidc';

export const GET = (req: Request) => oidcCallbackDesktopAPIHandler(req);
