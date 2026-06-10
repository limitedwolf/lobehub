import workflowsApp from '~server/workflows-hono';

export const POST = (req: Request) => workflowsApp.fetch(req);
