/**
 * Gerenciador de rotação de chaves Gemini API.
 *
 * Suporta 1–6 chaves independentes com cooldown por tipo de erro,
 * seleção round-robin e logs seguros (nunca revela valores das chaves).
 *
 * Leitura de chaves (em ordem de prioridade):
 *   1. GEMINI_API_KEY_1 … GEMINI_API_KEY_6  (variáveis individuais)
 *   2. GEMINI_API_KEYS                       (CSV: "key1,key2,key3")
 *   3. GEMINI_API_KEY                        (chave única — retrocompatível)
 *
 * Compatibilidade: quando apenas GEMINI_API_KEY existe, o comportamento
 * é idêntico ao anterior (pool de 1 chave, sem rotação).
 */

// ── Cooldowns por tipo de erro (ms) ─────────────────────────────────────────

/** @enum {string} */
export const FailReason = /** @type {const} */ ({
    QUOTA: 'quota',
    RATE_LIMIT: 'rate_limit',
    INVALID: 'invalid',
    UPSTREAM: 'upstream',
    NETWORK: 'network'
});

const COOLDOWN_MS = {
    [FailReason.QUOTA]: 60 * 60_000, // 60 minutos — cota esgotada no dia
    [FailReason.RATE_LIMIT]: 90_000, // 90 segundos — burst temporário
    [FailReason.INVALID]: Infinity, // Permanente até restart — chave revogada
    [FailReason.UPSTREAM]: 30_000, // 30 segundos — problema do servidor
    [FailReason.NETWORK]: 15_000 // 15 segundos — rede transitória
};

const MAX_KEYS = 6;

// ── Estado de uma chave ─────────────────────────────────────────────────────

/**
 * @typedef {object} KeyState
 * @property {string} key         — valor da chave (nunca logado)
 * @property {number} index       — índice humano (1-based, para logs)
 * @property {boolean} active     — disponível para uso
 * @property {string|null} reason — motivo do cooldown atual
 * @property {number} cooldownUntil — timestamp até quando está em cooldown (0 = disponível)
 * @property {number} successes   — contador de chamadas bem-sucedidas
 * @property {number} failures    — contador de falhas totais
 * @property {number} lastUsedAt  — timestamp do último uso
 */

// ── Classe principal ────────────────────────────────────────────────────────

export class GeminiKeyManager {
    /** @type {KeyState[]} */
    #keys = [];

    /** Índice 0-based no array #keys do último key retornado (round-robin estável). */
    #cursor = -1;

    /**
     * @param {string[]} [keyValues] — array de chaves (para testes).
     *   Se omitido, lê de process.env automaticamente.
     */
    constructor(keyValues) {
        const values = keyValues || GeminiKeyManager.readKeysFromEnv();
        this.#keys = values.slice(0, MAX_KEYS).map((key, i) => ({
            key,
            index: i + 1,
            active: true,
            reason: null,
            cooldownUntil: 0,
            successes: 0,
            failures: 0,
            lastUsedAt: 0
        }));
    }

    // ── Leitura de variáveis de ambiente ─────────────────────────────────

    /**
     * Lê as chaves do environment seguindo a ordem de prioridade.
     * @returns {string[]}
     */
    static readKeysFromEnv() {
        const keys = [];

        // 1. Variáveis individuais GEMINI_API_KEY_1 … GEMINI_API_KEY_6
        for (let i = 1; i <= MAX_KEYS; i++) {
            const v = String(process.env[`GEMINI_API_KEY_${i}`] || '').trim();
            if (v) keys.push(v);
        }
        if (keys.length > 0) return keys.slice(0, MAX_KEYS);

        // 2. CSV: GEMINI_API_KEYS="key1,key2,key3"
        const csv = String(process.env.GEMINI_API_KEYS || '').trim();
        if (csv) {
            const parsed = csv
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean)
                .slice(0, MAX_KEYS);
            if (parsed.length > 0) return parsed;
        }

        // 3. Chave única legada: GEMINI_API_KEY
        const single = String(process.env.GEMINI_API_KEY || '').trim();
        if (single) return [single];

        return [];
    }

    // ── API pública ─────────────────────────────────────────────────────

    /**
     * Retorna `true` se pelo menos uma chave estiver configurada.
     */
    isConfigured() {
        return this.#keys.length > 0;
    }

    /**
     * Retorna `true` se pelo menos uma chave estiver disponível (não em cooldown).
     */
    hasAvailableKey() {
        this.#refreshCooldowns();
        return this.#keys.some((k) => k.active);
    }

    /**
     * Há outra chave ativa além de `excludeIndex` (1-based).
     * @param {number} [excludeIndex]
     */
    hasOtherAvailableKey(excludeIndex) {
        this.#refreshCooldowns();
        return this.#keys.some((k) => k.active && k.index !== excludeIndex);
    }

    /**
     * Metadados seguros de uma chave (inclui valor — só para uso server-side TTS).
     * @param {number} keyIndex — 1-based
     * @returns {{ key: string, index: number, active: boolean, reason: string|null, cooldownRemainingMs: number }|null}
     */
    inspectKey(keyIndex) {
        this.#refreshCooldowns();
        const state = this.#findByIndex(keyIndex);
        if (!state) return null;
        const remaining =
            state.active || state.cooldownUntil === Infinity
                ? 0
                : Math.max(0, state.cooldownUntil - Date.now());
        return {
            key: state.key,
            index: state.index,
            active: state.active,
            reason: state.reason,
            cooldownRemainingMs: remaining
        };
    }

    /**
     * Menor tempo até alguma chave temporariamente em cooldown reativar.
     * @returns {number} ms (0 se há chave ativa; Infinity se só inválidas/vazio)
     */
    soonestCooldownMs() {
        this.#refreshCooldowns();
        if (this.#keys.some((k) => k.active)) return 0;
        let min = Infinity;
        const now = Date.now();
        for (const k of this.#keys) {
            if (k.cooldownUntil !== Infinity && k.cooldownUntil > now) {
                min = Math.min(min, k.cooldownUntil - now);
            }
        }
        return min;
    }

    /**
     * Retorna a próxima chave disponível (round-robin estável sobre o pool).
     * @param {{ excludeIndex?: number }} [opts]
     * @returns {{ key: string, index: number }}
     */
    getNextKey(opts = {}) {
        this.#refreshCooldowns();
        const excludeIndex =
            opts.excludeIndex != null ? Number(opts.excludeIndex) : null;

        if (this.#keys.length === 0) {
            throw new Error('MISSING_KEY');
        }

        for (let step = 0; step < this.#keys.length; step += 1) {
            this.#cursor = (this.#cursor + 1) % this.#keys.length;
            const candidate = this.#keys[this.#cursor];
            if (!candidate.active) continue;
            if (excludeIndex != null && candidate.index === excludeIndex) continue;
            candidate.lastUsedAt = Date.now();
            return { key: candidate.key, index: candidate.index };
        }

        // Nenhuma ativa (ou só a excluída).
        // Cooldown curto (rate/rede/upstream) → ALL_COOLING; quota/invalid → QUOTA.
        const stats = this.getStats();
        const inactive = this.#keys.filter((k) => !k.active);
        const onlyHardFailures =
            inactive.length > 0 &&
            inactive.every(
                (k) =>
                    k.reason === FailReason.QUOTA ||
                    k.cooldownUntil === Infinity ||
                    k.reason === FailReason.INVALID
            );
        const soonest = this.soonestCooldownMs();
        if (!onlyHardFailures && Number.isFinite(soonest) && soonest > 0) {
            console.error(
                `[key-manager] Nenhuma chave disponível agora (${stats.total} configurada(s); próxima em ${Math.ceil(soonest / 1000)}s)`
            );
            const err = new Error('ALL_COOLING');
            err.retryAfterMs = soonest;
            throw err;
        }

        console.error(
            `[key-manager] Nenhuma chave disponível (${stats.total} configurada(s), todas em cooldown/inválidas)`
        );
        throw new Error('QUOTA');
    }

    /**
     * Marca uma chave como bem-sucedida.
     * Reseta o status de cooldown se estiver ativo (exceto INVALID).
     *
     * @param {number} keyIndex — índice 1-based retornado por getNextKey()
     */
    markSuccess(keyIndex) {
        const state = this.#findByIndex(keyIndex);
        if (!state) return;

        state.successes += 1;

        if (!state.active && state.reason !== FailReason.INVALID) {
            state.active = true;
            state.cooldownUntil = 0;
            state.reason = null;
            console.info(`[key-manager] key-${state.index} reabilitada após sucesso`);
        }
    }

    /**
     * Marca uma chave como falha e aplica cooldown conforme o tipo de erro.
     *
     * @param {number} keyIndex — índice 1-based
     * @param {string} reason — valor de FailReason
     * @param {{ cooldownMs?: number }} [opts] — override opcional do cooldown
     */
    markFailed(keyIndex, reason, opts = {}) {
        const state = this.#findByIndex(keyIndex);
        if (!state) return;

        state.failures += 1;
        state.reason = reason;

        const cooldownMs =
            opts.cooldownMs != null
                ? Number(opts.cooldownMs)
                : COOLDOWN_MS[reason] || COOLDOWN_MS[FailReason.UPSTREAM];

        if (cooldownMs === Infinity) {
            state.active = false;
            state.cooldownUntil = Infinity;
            console.warn(
                `[key-manager] key-${state.index} desativada permanentemente (${reason})`
            );
        } else {
            state.active = false;
            state.cooldownUntil = Date.now() + Math.max(0, cooldownMs);
            const minutos = Math.round(cooldownMs / 60_000);
            const label =
                minutos >= 1 ? `${minutos}min` : `${Math.round(cooldownMs / 1000)}s`;
            console.warn(
                `[key-manager] key-${state.index} → cooldown ${label} (${reason})`
            );
        }
    }

    /**
     * Retorna estatísticas do pool sem revelar valores das chaves.
     * Seguro para logging.
     *
     * @returns {{ total: number, active: number, cooldown: number, invalid: number, keys: object[] }}
     */
    getStats() {
        this.#refreshCooldowns();

        const keys = this.#keys.map((k) => ({
            id: `key-${k.index}`,
            active: k.active,
            reason: k.reason,
            successes: k.successes,
            failures: k.failures,
            cooldownRemaining: k.active
                ? 0
                : k.cooldownUntil === Infinity
                  ? 'permanente'
                  : Math.max(0, Math.round((k.cooldownUntil - Date.now()) / 1000))
        }));

        return {
            total: this.#keys.length,
            active: this.#keys.filter((k) => k.active).length,
            cooldown: this.#keys.filter((k) => !k.active && k.cooldownUntil !== Infinity)
                .length,
            invalid: this.#keys.filter((k) => k.cooldownUntil === Infinity).length,
            keys
        };
    }

    /**
     * Reseta todos os cooldowns (útil para testes ou recuperação manual).
     */
    resetAll() {
        for (const k of this.#keys) {
            k.active = true;
            k.cooldownUntil = 0;
            k.reason = null;
        }
        this.#cursor = -1;
        console.info(`[key-manager] Todos os cooldowns resetados (${this.#keys.length} chave(s))`);
    }

    /**
     * Número total de chaves configuradas.
     */
    get size() {
        return this.#keys.length;
    }

    // ── Métodos internos ────────────────────────────────────────────────

    /**
     * Reativa chaves cujo cooldown expirou.
     */
    #refreshCooldowns() {
        const now = Date.now();
        for (const k of this.#keys) {
            if (!k.active && k.cooldownUntil !== Infinity && now >= k.cooldownUntil) {
                k.active = true;
                k.cooldownUntil = 0;
                k.reason = null;
                console.info(`[key-manager] key-${k.index} reativada (cooldown expirado)`);
            }
        }
    }

    /**
     * @param {number} index — 1-based
     * @returns {KeyState|undefined}
     */
    #findByIndex(index) {
        return this.#keys.find((k) => k.index === index);
    }
}

// ── Singleton ────────────────────────────────────────────────────────────────

/** @type {GeminiKeyManager|null} */
let _instance = null;

/**
 * Retorna a instância singleton do gerenciador de chaves.
 * Inicializa na primeira chamada lendo de process.env.
 *
 * @returns {GeminiKeyManager}
 */
export function getKeyManager() {
    if (!_instance) {
        _instance = new GeminiKeyManager();
        const stats = _instance.getStats();
        if (stats.total > 0) {
            console.info(
                `[key-manager] ${stats.total} chave(s) Gemini configurada(s), ${stats.active} ativa(s)`
            );
        }
    }
    return _instance;
}

/**
 * Substitui a instância singleton (útil para testes determinísticos).
 *
 * @param {GeminiKeyManager|null} manager
 */
export function setKeyManagerForTesting(manager) {
    _instance = manager;
}

export { COOLDOWN_MS, MAX_KEYS };
