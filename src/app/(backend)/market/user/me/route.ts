import { marketUserMeAPIHandler } from '~server/api-runtime/market';

export const PUT = (req: Request) => marketUserMeAPIHandler(req);

export const dynamic = 'force-dynamic';
