import { agentStreamAPIHandler } from '~server/api-runtime/agentStream';

export const GET = (req: Request) => agentStreamAPIHandler(req);
