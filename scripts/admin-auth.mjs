/**
 * Auth gate para operações administrativas em Netlify Functions.
 *
 * Estado atual do produto: admin é PROTÓTIPO (MockData). Em deploy Netlify,
 * /admin/* é bloqueado por redirects e esta API exige auth real.
 *
 * Quando SUPABASE_URL + SUPABASE_ANON_KEY (ou SUPABASE_JWT_SECRET) estiverem
 * configurados no ambiente da function, valida Bearer JWT via Auth getUser.
 * Sem credenciais: rejeita em produção; em desenvolvimento local permite
 * apenas quando QT_ALLOW_LOCAL_ADMIN_API=1 (serve.mjs).
 *
 * NÃO ativa SUPABASE_READY no frontend.
 */

function getHeader(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return (headers.get(name) || '').toString();
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key] || '') : '';
}

function bearerToken(headers) {
    const auth = getHeader(headers, 'authorization');
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    return m ? m[1].trim() : '';
}

export function isNetlifyProduction() {
    const ctx = String(process.env.CONTEXT || '').toLowerCase();
    if (ctx === 'production') return true;
    // Deploy Netlify sem CONTEXT explícito ainda não é "local serve"
    if (process.env.NETLIFY === 'true' && ctx !== 'dev') return true;
    return false;
}

export function isLocalAdminApiAllowed() {
    return (
        process.env.QT_ALLOW_LOCAL_ADMIN_API === '1' ||
        process.env.QT_ALLOW_LOCAL_ADMIN_API === 'true'
    );
}

/**
 * @param {{ headers?: Headers|Record<string,string> }} reqLike
 * @returns {Promise<{ ok: true, user?: object } | { ok: false, status: number, error: string }>}
 */
export async function requireAdminAuth(reqLike = {}) {
    const headers = reqLike.headers || {};
    const token = bearerToken(headers);

    const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    const supabaseAnon = (process.env.SUPABASE_ANON_KEY || '').trim();
    const hasSupabase = Boolean(
        supabaseUrl &&
            supabaseAnon &&
            !supabaseUrl.includes('SUA_URL') &&
            !supabaseAnon.includes('SUA_CHAVE')
    );

    if (hasSupabase) {
        if (!token) {
            return { ok: false, status: 401, error: 'Não autenticado.' };
        }
        try {
            const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    apikey: supabaseAnon
                },
                signal: AbortSignal.timeout(8000)
            });
            if (!res.ok) {
                return { ok: false, status: 401, error: 'Sessão inválida.' };
            }
            const user = await res.json();
            if (!user || !user.id) {
                return { ok: false, status: 401, error: 'Sessão inválida.' };
            }
            // Papel editorial: app_metadata.role === 'admin' | 'editor' quando existir;
            // sem role definida, qualquer usuário autenticado do projeto é aceito (fase CMS).
            const role = user.app_metadata && user.app_metadata.role;
            if (role && !['admin', 'editor', 'author'].includes(String(role))) {
                return { ok: false, status: 403, error: 'Sem permissão.' };
            }
            return { ok: true, user };
        } catch (_) {
            return { ok: false, status: 401, error: 'Falha ao validar sessão.' };
        }
    }

    // Sem Supabase Auth configurado no servidor:
    if (isNetlifyProduction()) {
        return {
            ok: false,
            status: 401,
            error: 'Admin API indisponível: autenticação server-side não configurada.'
        };
    }

    if (isLocalAdminApiAllowed()) {
        // Protótipo local explícito — nunca em produção Netlify.
        return { ok: true, user: { id: 'local-dev', role: 'admin', mode: 'local-dev' } };
    }

    return {
        ok: false,
        status: 401,
        error: 'Não autenticado. Em local, use QT_ALLOW_LOCAL_ADMIN_API=1 com o serve.mjs.'
    };
}
