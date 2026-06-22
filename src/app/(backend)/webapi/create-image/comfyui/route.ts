import { comfyUICreateImageAPIHandler } from '~server/api-runtime/createImage';

export const maxDuration = 300;

export const POST = (req: Request) => comfyUICreateImageAPIHandler(req);
