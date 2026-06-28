import { initTRPC } from '@trpc/server';
import debug from 'debug';

import { transformer } from '../transformer';
import { type AsyncContext } from './context';

const log = debug('lobe-async:init');

log('Initializing async tRPC with context and superjson transformer');

export const asyncTrpc = initTRPC.context<AsyncContext>().create({
  errorFormatter({ shape }) {
    log('tRPC error formatter called: %O', shape);
    return shape;
  },
  transformer,
});

log('Async tRPC initialized successfully');
