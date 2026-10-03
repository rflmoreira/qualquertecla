import { handleAiSummary } from './_lib/ai-summary-api.mjs';

export default async (req) => handleAiSummary(req);

export const config = {
    path: '/api/ai-summary'
};
