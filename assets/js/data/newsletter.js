/**
 * Newsletter — inscrição de e-mails.
 * Remoto: RPC subscribe_newsletter (Supabase).
 * Local: localStorage enquanto SUPABASE_READY === false.
 */
(function (global) {
    const STORAGE_KEY = 'qualquer-tecla_newsletter_subscribers';
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function isRemoteEnabled() {
        return !!(global.supabaseClient && global.SUPABASE_READY);
    }

    function normalizeEmail(email) {
        return String(email || '')
            .trim()
            .toLowerCase()
            .slice(0, 120);
    }

    function isValidEmail(email) {
        const value = normalizeEmail(email);
        return value.length >= 5 && value.length <= 120 && EMAIL_RE.test(value);
    }

    function readLocal() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function writeLocal(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (_) {
            throw new Error('Não foi possível salvar a inscrição neste dispositivo.');
        }
    }

    function subscribeLocal(email) {
        const normalized = normalizeEmail(email);
        const list = readLocal();
        const existing = list.find((row) => row.email === normalized && row.status !== 'unsubscribed');
        if (existing) {
            return {
                ok: true,
                status: 'already',
                source: 'local',
                email: normalized,
                subscribedAt: existing.subscribed_at
            };
        }

        const inactiveIdx = list.findIndex((row) => row.email === normalized);
        const row = {
            email: normalized,
            status: 'active',
            subscribed_at: new Date().toISOString(),
            source: 'site'
        };

        if (inactiveIdx >= 0) list[inactiveIdx] = row;
        else list.push(row);

        writeLocal(list);
        return {
            ok: true,
            status: 'subscribed',
            source: 'local',
            email: normalized,
            subscribedAt: row.subscribed_at
        };
    }

    async function subscribeRemote(email) {
        const normalized = normalizeEmail(email);
        const { data, error } = await global.supabaseClient.rpc('subscribe_newsletter', {
            p_email: normalized
        });

        if (error) throw error;

        const payload = data && typeof data === 'object' ? data : {};
        if (payload.ok === false || payload.status === 'invalid_email') {
            const err = new Error(payload.message || 'Informe um e-mail válido.');
            err.code = 'invalid_email';
            throw err;
        }

        return {
            ok: true,
            status: payload.status === 'already' ? 'already' : 'subscribed',
            source: 'remote',
            email: payload.email || normalized,
            subscribedAt: payload.subscribed_at || null
        };
    }

    async function subscribe(email) {
        if (!isValidEmail(email)) {
            const err = new Error('Informe um e-mail válido.');
            err.code = 'invalid_email';
            throw err;
        }

        if (isRemoteEnabled()) {
            try {
                return await subscribeRemote(email);
            } catch (err) {
                if (err && err.code === 'invalid_email') throw err;
                console.error('[Newsletter] Falha remota:', err);
                const wrapped = new Error(
                    'Não foi possível concluir a inscrição. Tente novamente em instantes.'
                );
                wrapped.cause = err;
                wrapped.code = 'remote_error';
                throw wrapped;
            }
        }

        return subscribeLocal(email);
    }

    function listLocal() {
        return readLocal().slice();
    }

    global.NewsletterStore = {
        isRemoteEnabled,
        isValidEmail,
        normalizeEmail,
        subscribe,
        listLocal,
        STORAGE_KEY
    };
})(window);
