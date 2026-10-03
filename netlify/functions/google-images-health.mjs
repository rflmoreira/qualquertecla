import { handleHealth } from './_lib/google-images-api.mjs';

export default async (req) => handleHealth(req);

export const config = {
    path: '/api/google-images/health'
};
