/**
 * Carrega MockData em Node (fonte canônica do conteúdo enquanto Supabase estiver off).
 * Usado por SEO server-side — evita espelho manual em articles-meta.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

function mockCandidates() {
    const names = ['assets/js/data/mock-data.js', 'mock-data.js'];
    const dirs = new Set();
    try {
        dirs.add(process.cwd());
    } catch (_) {}
    if (process.env.LAMBDA_TASK_ROOT) dirs.add(process.env.LAMBDA_TASK_ROOT);
    try {
        const here = path.dirname(fileURLToPath(import.meta.url));
        dirs.add(here);
        dirs.add(path.resolve(here, '..'));
        dirs.add(path.resolve(here, '../..'));
        dirs.add(path.resolve(here, '../../..'));
    } catch (_) {}
    const out = [];
    for (const dir of dirs) {
        if (!dir) continue;
        for (const name of names) {
            out.push(path.join(dir, name));
        }
    }
    return out;
}

let cached = null;

export function loadMockData() {
    if (cached) return cached;

    let code = '';
    let used = '';
    for (const candidate of mockCandidates()) {
        try {
            code = fs.readFileSync(candidate, 'utf8');
            used = candidate;
            break;
        } catch (_) {}
    }
    if (!code) {
        throw new Error(`mock-data.js não encontrado. Tentados: ${mockCandidates().join(' | ')}`);
    }

    const store = new Map();
    const webStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(String(k), String(v)),
        removeItem: (k) => store.delete(k)
    };

    const sandbox = {
        console,
        Date,
        Math,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Map,
        Set,
        Error,
        localStorage: webStorage,
        sessionStorage: webStorage
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    vm.runInNewContext(code, sandbox, { filename: used || 'mock-data.js', timeout: 10000 });

    const MD = sandbox.MockData;
    if (!MD || typeof MD.publishedArticles !== 'function') {
        throw new Error('MockData.publishedArticles indisponível após carregar mock-data.js');
    }

    cached = MD;
    return cached;
}

export function clearMockDataCache() {
    cached = null;
}
