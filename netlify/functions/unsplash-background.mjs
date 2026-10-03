import { handleUnsplashBackground } from './_lib/unsplash-background-api.mjs';

export default async (req) => handleUnsplashBackground(req);

export const config = {
    path: '/api/unsplash/background'
};
