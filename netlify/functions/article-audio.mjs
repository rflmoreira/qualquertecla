import { handleArticleAudio } from './_lib/article-audio-api.mjs';

export default async (req) => handleArticleAudio(req);

export const config = {
    path: ['/api/article-audio', '/api/article-audio/generate']
};
