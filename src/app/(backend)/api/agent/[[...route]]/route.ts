import app from '~server/agent-hono';

export const maxDuration = 600;

const handler = (request: Request) => app.fetch(request);

export const GET = handler;
export const POST = handler;
