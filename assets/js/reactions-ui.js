/**
 * UI do sistema de reações do artigo.
 * Depende de window.ReactionsStore e (opcional) window.HtmlSafe.
 */
(function (global) {
    const store = global.ReactionsStore;
    if (!store) return;

    const { escapeHtml, escapeAttr } =
        global.HtmlSafe || {
            escapeHtml: (s) => String(s ?? ''),
            escapeAttr: (s) => String(s ?? '')
        };

    function formatTotalLabel(total) {
        const n = Number(total) || 0;
        if (n === 1) return '1 reação';
        return `${n} reações`;
    }

    function reactionsMarkup(articleSlug) {
        const id = String(articleSlug || '');
        const buttons = store.REACTIONS.map(
            (r) => `
<button type="button" class="article-reaction" data-reaction="${escapeAttr(r.id)}" aria-pressed="false" aria-label="${escapeAttr(r.label)}">
  <span class="article-reaction-emoji" aria-hidden="true">${r.emoji}</span>
  <span class="article-reaction-label">${escapeHtml(r.label)}</span>
  <span class="article-reaction-count" data-reaction-count hidden>0</span>
</button>`
        ).join('');

        return `
<section class="article-reactions" data-article-id="${escapeAttr(id)}" aria-labelledby="article-reactions-heading">
  <h2 class="article-reactions-title font-editorial" id="article-reactions-heading">Participe da conversa!</h2>
  <p class="article-reactions-total" data-reactions-total>0 reações</p>
  <div class="article-reactions-list" role="group" aria-label="Reações ao artigo">
    ${buttons}
  </div>
  <p class="article-reactions-feedback" data-reactions-feedback hidden></p>
</section>`;
    }

    function setFeedback(root, message) {
        const el = root.querySelector('[data-reactions-feedback]');
        if (!el) return;
        if (!message) {
            el.textContent = '';
            el.setAttribute('hidden', '');
            return;
        }
        el.textContent = message;
        el.removeAttribute('hidden');
    }

    function applyState(root, state, { animateId } = {}) {
        if (!root || !state) return;

        const totalEl = root.querySelector('[data-reactions-total]');
        if (totalEl) totalEl.textContent = formatTotalLabel(state.total);

        const locked = Boolean(state.userVote);
        root.classList.toggle('has-vote', locked);

        root.querySelectorAll('.article-reaction').forEach((btn) => {
            const id = btn.getAttribute('data-reaction');
            const count = (state.counts && state.counts[id]) || 0;
            const countEl = btn.querySelector('[data-reaction-count]');
            const selected = state.userVote === id;

            btn.classList.toggle('is-selected', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            btn.disabled = locked;
            btn.setAttribute('aria-disabled', locked ? 'true' : 'false');

            if (countEl) {
                countEl.textContent = String(count);
                if (count > 0) countEl.removeAttribute('hidden');
                else countEl.setAttribute('hidden', '');
            }

            if (animateId && id === animateId) {
                btn.classList.remove('is-pop');
                void btn.offsetWidth;
                btn.classList.add('is-pop');
            }
        });
    }

    async function mount(rootOrSelector, articleSlug, options) {
        const root =
            typeof rootOrSelector === 'string'
                ? document.querySelector(rootOrSelector)
                : rootOrSelector;
        if (!root || !articleSlug) return null;

        const opts = options || {};
        setFeedback(root, '');

        const state = await store.getState(articleSlug, opts);
        applyState(root, state);

        if (root.dataset.reactionsBound === '1') return root;
        root.dataset.reactionsBound = '1';
        root._reactionsOptions = opts;

        root.addEventListener('click', async (event) => {
            const btn = event.target.closest('.article-reaction');
            if (!btn || !root.contains(btn) || btn.disabled) return;

            const reactionId = btn.getAttribute('data-reaction');
            if (!reactionId) return;

            setFeedback(root, '');
            root.classList.add('is-voting');
            root.querySelectorAll('.article-reaction').forEach((b) => {
                b.disabled = true;
            });

            try {
                const next = await store.castVote(articleSlug, reactionId, root._reactionsOptions || opts);
                applyState(root, next, { animateId: next.changed ? reactionId : null });
                if (next.error) {
                    setFeedback(root, 'Não foi possível registrar sua reação. Tente novamente.');
                } else if (!next.changed && next.userVote) {
                    setFeedback(root, '');
                }
            } catch (_) {
                const fallback = await store.getState(articleSlug, root._reactionsOptions || opts);
                applyState(root, fallback);
                setFeedback(root, 'Não foi possível registrar sua reação. Tente novamente.');
            } finally {
                root.classList.remove('is-voting');
            }
        });

        return root;
    }

    async function initInContainer(container, articleSlug, options) {
        if (!container || !articleSlug) return null;
        const section = container.querySelector('.article-reactions');
        if (!section) return null;
        return mount(section, articleSlug, options);
    }

    global.ArticleReactions = {
        markup: reactionsMarkup,
        mount,
        initInContainer,
        formatTotalLabel
    };
})(typeof window !== 'undefined' ? window : globalThis);
