import { createTRPCClient, httpBatchLink } from '@trpc/client';

import { type AsyncRouter } from '@/server/routers/async';

import { transformer } from '../transformer';

export const asyncClient = createTRPCClient<AsyncRouter>({
  links: [
    httpBatchLink({
      maxURLLength: 2083,
      transformer,
      url: '/trpc/async',
    }),
  ],
});
