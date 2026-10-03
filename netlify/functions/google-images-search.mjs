import { handleSearch } from './_lib/google-images-api.mjs';

export default async (req) => handleSearch(req);

export const config = {
    path: '/api/google-images/search'
};
