import { oidcProviderAPIHandler } from '~server/api-runtime/oidc';

const handler = (req: Request) => oidcProviderAPIHandler(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
