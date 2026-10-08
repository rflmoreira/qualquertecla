/**
 * Editor de artigos — wizard por etapas + importação Markdown.
 */
(function (global) {
    const STEPS = [
        { id: 1, label: 'Informações', icon: 'ph-info' },
        { id: 2, label: 'Conteúdo', icon: 'ph-article' },
        { id: 3, label: 'Mídia', icon: 'ph-image' },
        { id: 4, label: 'Publicação', icon: 'ph-paper-plane-tilt' }
    ];

    const TOUCH_FIELDS = [
        ['title', 'titleInput'],
        ['subtitle', 'subtitleInput'],
        ['seoDesc', 'seoDesc'],
        ['seoTitle', 'seoTitle'],
        ['category', 'catSelect'],
        ['author', 'authorSelect'],
        ['tags', 'tagsInput'],
        ['keywords', 'keywordsInput'],
        ['slug', 'slugInput'],
        ['date', 'dateInput'],
        ['sourceName', 'sourceNameInput'],
        ['sourceUrl', 'sourceUrlInput'],
        ['caption', 'captionInput']
    ];

    /** Rascunho temporário do formulário (separado de qualquer-tecla_mock_articles). */
    const FORM_DRAFT_KEY = 'qualquer-tecla_editor_form_draft';
    const FORM_DRAFT_BACKUP_KEY = 'qualquer-tecla_editor_form_draft_backup';
    const FORM_DRAFT_SCOPED_PREFIX = 'qualquer-tecla_editor_draft_v2:';
    const FORM_DRAFT_VERSION = 1;

    let currentStep = 1;
    let featuredImage = '';
    let articleTags = [];
    let importModal = null;
    let socialEmbedModal = null;
    let imageUrlModal = null;
    let imageUrlMode = 'content';
    let socialEmbedInsertRange = null;
    let imageInsertRange = null;
    let imageSearchPanel = null;
    let imageAltTouched = false;
    let pendingImport = null;
    let lastAnalysis = null;
    let userTouched = new Set();
    let suggestionsToken = 0;
    let toastHideTimer = null;
    let importSparkleStopTimer = null;
    /** Mutex compartilhado: publish e "Gerar áudios" não rodam em paralelo. */
    let audioPipelineBusy = false;
    /** Campos de áudio gerados manualmente no editor (antes do próximo save/publish). */
    let pendingAudioFields = null;
    let importSparkleStartedAt = 0;
    let formDraftTimer = null;
    let formDraftSuspended = false;
    let lastKnownGoodDraft = null;
    /** ID da matéria em edição (preserva publicação ao mudar slug / salvar rascunho). */
    let editingArticleId = null;
    const IMPORT_SPARKLE_MIN_MS = 380;
    const IMPORT_SPARKLE_FADE_MS = 450;

    const els = {};

    function editorDraftScope() {
        try {
            const slug = new URLSearchParams(global.location.search).get('slug');
            const trimmed = slug && String(slug).trim();
            return trimmed || '__new__';
        } catch (_) {
            return '__new__';
        }
    }

    function draftHasText(v) {
        return String(v || '').trim().length > 0;
    }

    function draftHasEditorialContent(draft) {
        const f = (draft && draft.fields) || {};
        return (
            draftHasText(f.title) ||
            draftHasText(f.markdown) ||
            draftHasText(f.subtitle) ||
            draftHasText(f.tags) ||
            draftHasText(f.seoDesc) ||
            draftHasText(f.aiSummary)
        );
    }

    function draftHasFeaturedImage(draft) {
        return (
            draft &&
            draft.featuredImage &&
            draft.featuredImage !== (global.MockData && global.MockData.PLACEHOLDER_IMG) &&
            !/placeholder/i.test(String(draft.featuredImage))
        );
    }

    function formDraftIsMeaningful(draft) {
        if (!draft || !draft.fields || draft.v !== FORM_DRAFT_VERSION) return false;
        // Draft de formulário só é válido com conteúdo editorial real.
        // Categoria/autor/capa/step sozinhos NÃO bastam — isso gravava draft
        // "vazio" no init e, no restore de __new__ (merge:false), zerava os campos.
        return draftHasEditorialContent(draft);
    }

    function collectFormDraft() {
        return {
            v: FORM_DRAFT_VERSION,
            scope: editorDraftScope(),
            savedAt: Date.now(),
            currentStep,
            featuredImage,
            userTouched: Array.from(userTouched),
            slugLocked: !!(els.slugInput && els.slugInput.dataset.locked === '1'),
            fields: {
                title: els.titleInput ? els.titleInput.value : '',
                subtitle: els.subtitleInput ? els.subtitleInput.value : '',
                markdown: els.mdTextarea ? els.mdTextarea.value : '',
                category: els.catSelect ? els.catSelect.value : '',
                author: els.authorSelect ? els.authorSelect.value : '',
                caption: els.captionInput ? els.captionInput.value : '',
                sourceName: els.sourceNameInput ? els.sourceNameInput.value : '',
                sourceUrl: els.sourceUrlInput ? els.sourceUrlInput.value : '',
                destaque: !!(els.destaqueSwitch && els.destaqueSwitch.checked),
                seoTitle: els.seoTitle ? els.seoTitle.value : '',
                seoDesc: els.seoDesc ? els.seoDesc.value : '',
                aiSummary: els.aiSummaryInput ? els.aiSummaryInput.value : '',
                tags: els.tagsInput ? els.tagsInput.value : '',
                keywords: els.keywordsInput ? els.keywordsInput.value : '',
                date: els.dateInput ? els.dateInput.value : '',
                slug: els.slugInput ? els.slugInput.value : ''
            }
        };
    }

    function scopedDraftKey(scope) {
        return FORM_DRAFT_SCOPED_PREFIX + String(scope || '__new__');
    }

    function clearFormDraft() {
        const scope = editorDraftScope();
        try {
            sessionStorage.removeItem(FORM_DRAFT_KEY);
            sessionStorage.removeItem(FORM_DRAFT_BACKUP_KEY);
            sessionStorage.removeItem(scopedDraftKey(scope));
            localStorage.removeItem(scopedDraftKey(scope));
        } catch (_) {
            /* ignore */
        }
        lastKnownGoodDraft = null;
        if (formDraftTimer) {
            clearTimeout(formDraftTimer);
            formDraftTimer = null;
        }
    }

    function parseDraftJson(raw, scope) {
        if (!raw) return null;
        try {
            const draft = JSON.parse(raw);
            if (!draft || draft.scope !== scope || !formDraftIsMeaningful(draft)) return null;
            return draft;
        } catch (_) {
            return null;
        }
    }

    function readScopedDraft(scope) {
        try {
            const fromSession = parseDraftJson(sessionStorage.getItem(scopedDraftKey(scope)), scope);
            if (fromSession) return fromSession;
            return parseDraftJson(localStorage.getItem(scopedDraftKey(scope)), scope);
        } catch (_) {
            return null;
        }
    }

    function readLegacyDraft(scope) {
        try {
            const primary = parseDraftJson(sessionStorage.getItem(FORM_DRAFT_KEY), scope);
            if (primary) return primary;
            return parseDraftJson(sessionStorage.getItem(FORM_DRAFT_BACKUP_KEY), scope);
        } catch (_) {
            return null;
        }
    }

    function pickDraftFallback(scope) {
        if (
            lastKnownGoodDraft &&
            lastKnownGoodDraft.scope === scope &&
            formDraftIsMeaningful(lastKnownGoodDraft)
        ) {
            return lastKnownGoodDraft;
        }
        return readScopedDraft(scope) || readLegacyDraft(scope);
    }

    function isWeakerDraft(candidate, baseline) {
        if (!baseline || !formDraftIsMeaningful(baseline)) return false;
        if (!candidate || !formDraftIsMeaningful(candidate)) return true;
        const cEditorial = draftHasEditorialContent(candidate);
        const bEditorial = draftHasEditorialContent(baseline);
        if (bEditorial && !cEditorial) return true;
        const cMd = draftHasText(candidate.fields && candidate.fields.markdown);
        const bMd = draftHasText(baseline.fields && baseline.fields.markdown);
        if (bMd && !cMd) return true;
        return false;
    }

    function persistFormDraft(draft) {
        if (!formDraftIsMeaningful(draft)) return false;
        lastKnownGoodDraft = draft;
        const json = JSON.stringify(draft);
        const scopedKey = scopedDraftKey(draft.scope);
        let ok = false;
        try {
            sessionStorage.setItem(FORM_DRAFT_KEY, json);
            sessionStorage.setItem(FORM_DRAFT_BACKUP_KEY, json);
            sessionStorage.setItem(scopedKey, json);
            ok = true;
        } catch (_) {
            /* quota / private mode */
        }
        try {
            localStorage.setItem(scopedKey, json);
            ok = true;
        } catch (_) {
            /* quota / private mode */
        }
        return ok;
    }

    function seedFormDraftFromDom() {
        if (formDraftSuspended) return;
        const scope = editorDraftScope();
        const domDraft = collectFormDraft();
        const fallback = pickDraftFallback(scope);
        if (!formDraftIsMeaningful(domDraft)) return;
        if (isWeakerDraft(domDraft, fallback)) return;
        persistFormDraft(domDraft);
    }

    function saveFormDraftNow() {
        if (formDraftSuspended) return;
        try {
            const scope = editorDraftScope();
            const domDraft = collectFormDraft();
            const fallback = pickDraftFallback(scope);
            const domMeaningful = formDraftIsMeaningful(domDraft);
            const weaker = isWeakerDraft(domDraft, fallback);

            if (domMeaningful && !weaker) {
                persistFormDraft(domDraft);
                return;
            }

            if (fallback) {
                persistFormDraft({
                    ...fallback,
                    currentStep,
                    savedAt: Date.now()
                });
            }
        } catch (_) {
            /* quota / private mode */
        }
    }

    function scheduleSaveFormDraft() {
        if (formDraftSuspended) return;
        if (formDraftTimer) clearTimeout(formDraftTimer);
        formDraftTimer = setTimeout(saveFormDraftNow, 280);
    }

    function applyFormDraft(draft, { merge = false } = {}) {
        if (!draft || !draft.fields) return false;
        if (formDraftTimer) {
            clearTimeout(formDraftTimer);
            formDraftTimer = null;
        }
        formDraftSuspended = true;
        try {
            const f = draft.fields;

            function applyText(el, draftVal) {
                if (!el) return;
                // Nunca gravar string vazia a partir do draft (evita zerar campos no restore).
                if (!draftHasText(draftVal)) return;
                if (merge && draftHasText(el.value) && !draftHasText(draftVal)) return;
                el.value = draftVal;
            }

            function applySelect(el, draftVal) {
                if (!el || !draftHasText(draftVal)) return;
                el.value = draftVal;
            }

            applyText(els.titleInput, f.title);
            applyText(els.subtitleInput, f.subtitle);
            applyText(els.mdTextarea, f.markdown);
            applySelect(els.catSelect, f.category);
            applySelect(els.authorSelect, f.author);
            if (els.captionInput && draftHasText(f.caption)) {
                els.captionInput.value = f.caption;
            }
            if (els.sourceNameInput && draftHasText(f.sourceName)) {
                els.sourceNameInput.value = f.sourceName;
            }
            if (els.sourceUrlInput && draftHasText(f.sourceUrl)) {
                els.sourceUrlInput.value = f.sourceUrl;
            }
            if (els.destaqueSwitch && f.destaque) {
                els.destaqueSwitch.checked = true;
            }
            if (els.seoTitle && draftHasText(f.seoTitle)) {
                els.seoTitle.value = f.seoTitle;
            }
            if (els.seoDesc && draftHasText(f.seoDesc)) {
                els.seoDesc.value = f.seoDesc;
            }
            if (els.aiSummaryInput && draftHasText(f.aiSummary)) {
                els.aiSummaryInput.value = f.aiSummary;
            }
            if (els.tagsInput && draftHasText(f.tags)) {
                els.tagsInput.value = f.tags;
            }
            if (els.keywordsInput && draftHasText(f.keywords)) {
                els.keywordsInput.value = f.keywords;
            }
            if (els.dateInput && f.date) {
                if (!merge || !draftHasText(els.dateInput.value)) {
                    els.dateInput.value = f.date;
                }
            }
            if (els.slugInput && draftHasText(f.slug)) {
                els.slugInput.value = f.slug;
            }

            if (draftHasText(f.tags)) {
                articleTags = normalizeTags(f.tags);
            }
            if (
                draftHasFeaturedImage(draft) ||
                (!merge && draft.featuredImage)
            ) {
                featuredImage =
                    draft.featuredImage ||
                    (global.MockData && global.MockData.PLACEHOLDER_IMG) ||
                    '';
            } else if (merge && !draftHasFeaturedImage(draft) && !isPlaceholderFeatured()) {
                /* mantém capa já carregada */
            } else if (!merge) {
                featuredImage =
                    draft.featuredImage ||
                    (global.MockData && global.MockData.PLACEHOLDER_IMG) ||
                    '';
            }

            updateFeaturedPreview();
            updateMdStats();
            if (els.previewPaneWrap && els.previewPaneWrap.classList.contains('active')) {
                updatePreview();
            }

            if (Array.isArray(draft.userTouched) && draft.userTouched.length) {
                userTouched = new Set(draft.userTouched);
            }
            TOUCH_FIELDS.forEach(([field, key]) => {
                const el = els[key];
                if (!el) return;
                const filled =
                    el.type === 'checkbox' ? el.checked : String(el.value || '').trim();
                if (filled) userTouched.add(field);
            });

            if (els.slugInput) {
                if (draft.slugLocked) els.slugInput.dataset.locked = '1';
                else if (!merge || draftHasText(f.slug)) delete els.slugInput.dataset.locked;
            }

            const step = Math.max(1, Math.min(STEPS.length, Number(draft.currentStep) || 1));
            goToStep(step, { keepFeedback: true });
            return true;
        } finally {
            formDraftSuspended = false;
        }
    }

    function tryRestoreFormDraft() {
        try {
            const scope = editorDraftScope();
            const draft = pickDraftFallback(scope);
            if (!draft) return false;
            const merge = scope !== '__new__';
            const applied = applyFormDraft(draft, { merge });
            if (applied) lastKnownGoodDraft = draft;
            return applied;
        } catch (_) {
            return false;
        }
    }

    function bindFormDraftAutosave() {
        const nodes = [
            els.titleInput,
            els.subtitleInput,
            els.mdTextarea,
            els.catSelect,
            els.authorSelect,
            els.captionInput,
            els.sourceNameInput,
            els.sourceUrlInput,
            els.destaqueSwitch,
            els.seoTitle,
            els.seoDesc,
            els.aiSummaryInput,
            els.tagsInput,
            els.keywordsInput,
            els.dateInput,
            els.slugInput
        ];
        nodes.forEach((el) => {
            if (!el) return;
            const evt =
                el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date'
                    ? 'change'
                    : 'input';
            el.addEventListener(evt, scheduleSaveFormDraft);
        });
        global.addEventListener('pagehide', saveFormDraftNow);
        global.addEventListener('beforeunload', saveFormDraftNow);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') saveFormDraftNow();
        });
        document.addEventListener(
            'click',
            (e) => {
                const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
                if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
                const href = String(link.getAttribute('href') || '').trim();
                if (
                    !href ||
                    href.startsWith('#') ||
                    /^https?:\/\//i.test(href) ||
                    /^mailto:/i.test(href) ||
                    /^tel:/i.test(href)
                ) {
                    return;
                }
                saveFormDraftNow();
            },
            true
        );
    }
    function slugify(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 80);
    }

    function normalizeTags(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(String).filter(Boolean);
        return String(value)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
    }

    function showFeedback(type, message) {
        showEditorToast(type, message);
    }

    function hideEditorToast(toast) {
        const el = toast || els.editorToast;
        if (!el || el.hidden) return;
        el.classList.remove('is-visible');
        el.classList.add('is-hiding');
        setTimeout(() => {
            if (!el.classList.contains('is-hiding')) return;
            el.hidden = true;
            el.classList.remove('is-hiding');
            el.className = 'article-editor-toast';
            el.textContent = '';
        }, 280);
    }

    function showEditorToast(type, message) {
        const toast = els.editorToast;
        if (!toast) return;
        if (toastHideTimer) {
            clearTimeout(toastHideTimer);
            toastHideTimer = null;
        }
        toast.hidden = false;
        toast.classList.remove('is-hiding');
        toast.className = 'article-editor-toast article-editor-toast--' + (type === 'error' ? 'error' : 'success');
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        toast.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = 'ph ' + (type === 'error' ? 'ph-info' : 'ph-check-circle');
        icon.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.textContent = message;
        toast.append(icon, span);
        requestAnimationFrame(() => {
            toast.classList.add('is-visible');
        });
        toastHideTimer = setTimeout(() => {
            hideEditorToast(toast);
            toastHideTimer = null;
        }, type === 'error' ? 5200 : 3200);
    }

    function clearFeedback() {
        if (toastHideTimer) {
            clearTimeout(toastHideTimer);
            toastHideTimer = null;
        }
        hideEditorToast();
    }

    async function requestPublish() {
        const hasAuthor = els.authorSelect && els.authorSelect.value;
        const hasCategory = els.catSelect && els.catSelect.value;
        if (!hasAuthor || !hasCategory) {
            showFeedback('error', 'Autor e Editoria são obrigatórios para publicar.');
            goToStep(1);
            return;
        }
        if (!validateAll()) return;

        const title = (els.titleInput?.value || '').trim() || 'esta matéria';
        const skipMaryGeneration = isSummaryAndAudioEmpty();

        if (skipMaryGeneration) {
            if (
                !window.confirm(
                    `Tem certeza de que deseja publicar “${title}” sem gerar o resumo e os áudios com Mary AI? Sem áudio, Ouvir e Mary ficam desabilitados.`
                )
            ) {
                return;
            }
            await publishWithAudioPipeline({ skipMaryGeneration: true });
            return;
        }

        if (
            !window.confirm(
                `Publicar “${title}” no portal? A Mary AI tentará gerar o resumo e os áudios; se o áudio falhar, a matéria publica mesmo assim e Ouvir/Mary ficam desabilitados.`
            )
        ) {
            return;
        }
        await publishWithAudioPipeline({ skipMaryGeneration: false });
    }

    function hasReadyArticleAudio(source) {
        if (!source) return false;
        if (String(source.audio_status || '').trim() === 'ready') return true;
        return Boolean(
            String(source.audio_summary_url || '').trim() &&
                String(source.audio_full_url || '').trim()
        );
    }

    function isSummaryAndAudioEmpty() {
        const summaryEmpty = !String(els.aiSummaryInput?.value || '').trim();
        if (!summaryEmpty) return false;

        if (hasReadyArticleAudio(pendingAudioFields)) return false;

        const title = String(els.titleInput?.value || '').trim();
        const slug =
            String(els.slugInput?.value || '').trim() ||
            slugify(title) ||
            '';
        const existing = findArticleByIdOrSlug(editingArticleId, slug);
        if (hasReadyArticleAudio(existing)) return false;

        return true;
    }

    /**
     * Publicação com áudio opcional: tenta resumo → TTS resumo → TTS completo,
     * mas publica mesmo se o áudio falhar (Ouvir/Mary ficam desabilitados sem arquivo).
     * Com skipMaryGeneration: publica sem chamar resumo/áudio.
     */
    async function publishWithAudioPipeline(options = {}) {
        const skipMaryGeneration = !!options.skipMaryGeneration;
        if (audioPipelineBusy) {
            showFeedback('error', 'Publicação ou geração de áudio já em andamento.');
            return null;
        }
        audioPipelineBusy = true;
        setPublishBusy(true, 'Preparando publicação…');
        if (els.articleAudioGenerateBtn) {
            els.articleAudioGenerateBtn.disabled = true;
        }

        try {
            const title = String(els.titleInput?.value || '').trim();
            const content = plainTextFromEditorContent();
            const slug =
                String(els.slugInput?.value || '').trim() ||
                slugify(title) ||
                'rascunho';
            const subtitle = String(els.subtitleInput?.value || '').trim();

            if (!title || content.length < 40) {
                showFeedback('error', 'Manchete e corpo são necessários para publicar.');
                goToStep(2);
                return null;
            }

            if (skipMaryGeneration) {
                const audioFields = {
                    audio_summary_url: null,
                    audio_full_url: null,
                    audio_summary_hash: null,
                    audio_full_hash: null,
                    audio_generated_at: null,
                    audio_status: 'missing'
                };
                setPublishBusy(true, 'Publicando…');
                const saved = await persistMock('published', { audioFields });
                if (!saved) {
                    showFeedback('error', 'A publicação falhou ao salvar. Tente novamente.');
                    return null;
                }
                pendingAudioFields = null;
                refreshArticleAudioStatus(saved);
                return saved;
            }

            let summary = String(els.aiSummaryInput?.value || '').trim();
            setPublishBusy(true, 'Mary AI gerando resumo…');
            try {
                summary = await fetchAiSummaryForPublish({ slug, title, content });
                if (els.aiSummaryInput) {
                    els.aiSummaryInput.value = summary;
                }
            } catch (err) {
                console.warn('[publish] resumo Mary AI opcional falhou:', err);
                showFeedback(
                    'success',
                    'Mary AI indisponível para o resumo — publicando com o texto atual do campo.'
                );
            }

            let summaryAudio = null;
            let fullAudio = null;

            if (summary) {
                setPublishBusy(true, 'Mary AI gerando áudio do resumo…');
                try {
                    summaryAudio = await fetchArticleAudioGenerate({
                        slug,
                        kind: 'summary',
                        text: summary
                    });
                } catch (err) {
                    console.warn('[publish] áudio do resumo opcional falhou:', err);
                }
            }

            setPublishBusy(true, 'Mary AI gerando áudio da matéria…');
            try {
                fullAudio = await fetchArticleAudioGenerate({
                    slug,
                    kind: 'full',
                    title,
                    subtitle,
                    content
                });
            } catch (err) {
                console.warn('[publish] áudio da matéria opcional falhou:', err);
            }

            const audioReady = Boolean(
                summaryAudio &&
                    summaryAudio.url &&
                    summaryAudio.hash &&
                    fullAudio &&
                    fullAudio.url &&
                    fullAudio.hash
            );

            const audioFields = audioReady
                ? {
                      audio_summary_url: summaryAudio.url,
                      audio_full_url: fullAudio.url,
                      audio_summary_hash: summaryAudio.hash,
                      audio_full_hash: fullAudio.hash,
                      audio_generated_at:
                          fullAudio.generated_at || new Date().toISOString(),
                      audio_status: 'ready'
                  }
                : {
                      audio_summary_url: (summaryAudio && summaryAudio.url) || null,
                      audio_full_url: (fullAudio && fullAudio.url) || null,
                      audio_summary_hash: (summaryAudio && summaryAudio.hash) || null,
                      audio_full_hash: (fullAudio && fullAudio.hash) || null,
                      audio_generated_at: null,
                      audio_status: 'missing'
                  };

            setPublishBusy(true, 'Publicando…');
            const saved = await persistMock('published', { audioFields });
            if (!saved) {
                showFeedback('error', 'A publicação falhou ao salvar. Tente novamente.');
                return null;
            }
            pendingAudioFields = null;
            refreshArticleAudioStatus(saved);
            return saved;
        } catch (err) {
            const msg =
                (err && err.message) || 'Não foi possível concluir a publicação.';
            showFeedback('error', msg);
            return null;
        } finally {
            audioPipelineBusy = false;
            setPublishBusy(false);
            if (els.articleAudioGenerateBtn) {
                els.articleAudioGenerateBtn.disabled = false;
            }
        }
    }

    function setPublishBusy(busy, label) {
        const buttons = [els.headerPublishBtn, els.publishConfirmBtn, els.nextBtn].filter(
            Boolean
        );
        buttons.forEach((btn) => {
            if (!btn.dataset.publishLabel) {
                btn.dataset.publishLabel = btn.innerHTML;
            }
            btn.disabled = !!busy;
            if (busy) {
                btn.setAttribute('aria-busy', 'true');
                if (label && (btn === els.headerPublishBtn || btn === els.publishConfirmBtn)) {
                    const safe = String(label || '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');
                    btn.innerHTML = `<i class="ph ph-spinner" aria-hidden="true"></i><span>${safe}</span>`;
                }
            } else {
                btn.removeAttribute('aria-busy');
                if (btn.dataset.publishLabel) {
                    btn.innerHTML = btn.dataset.publishLabel;
                }
            }
        });
        if (busy && label) {
            showFeedback('success', label);
        }
    }

    async function fetchAiSummaryForPublish({ slug, title, content }) {
        const res = await fetch('/api/ai-summary', {
            method: 'POST',
            headers: await adminAuthHeaders(),
            body: JSON.stringify({
                slug,
                title: String(title || '').slice(0, 300),
                content
            })
        });
        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = null;
        }
        if (!res.ok) {
            throw new Error(
                (data && data.error) || 'Falha ao gerar o resumo com Mary AI.'
            );
        }
        const summary = String(data && data.summary ? data.summary : '').trim();
        if (!summary) {
            throw new Error('Resumo da Mary AI vazio.');
        }
        return summary;
    }

    async function fetchArticleAudioGenerate(payload) {
        const res = await fetch('/api/article-audio/generate', {
            method: 'POST',
            headers: await adminAuthHeaders(),
            body: JSON.stringify(payload)
        });
        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = null;
        }
        if (!res.ok) {
            const kindLabel = payload.kind === 'summary' ? 'do resumo' : 'da matéria';
            throw new Error(
                (data && data.error) || `Falha ao gerar o áudio ${kindLabel}.`
            );
        }
        if (!data || !data.url || !data.hash) {
            throw new Error('Resposta de áudio inválida.');
        }
        return data;
    }

    function goToStep(step, { keepFeedback = false } = {}) {
        currentStep = Math.max(1, Math.min(STEPS.length, step));
        els.stepBtns.forEach((btn) => {
            const n = Number(btn.getAttribute('data-step'));
            const isActive = n === currentStep;
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('completed', n < currentStep);
            if (isActive) btn.setAttribute('aria-current', 'step');
            else btn.removeAttribute('aria-current');
        });
        els.stepPanels.forEach((panel) => {
            const isActive = Number(panel.getAttribute('data-step-panel')) === currentStep;
            panel.classList.toggle('active', isActive);
            panel.hidden = !isActive;
            panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });
        if (els.prevStepBtn) {
            els.prevStepBtn.disabled = currentStep === 1;
            els.prevStepBtn.innerHTML =
                '<i class="ph ph-arrow-left" aria-hidden="true"></i><span>Anterior</span>';
        }
        if (els.nextStepBtn) {
            const labels = {
                1: 'Próximo',
                2: 'Próximo',
                3: 'Revisar',
                4: 'Publicar'
            };
            const label = labels[currentStep] || 'Próximo';
            const icon =
                currentStep < STEPS.length
                    ? 'ph-arrow-right'
                    : 'ph-paper-plane-tilt';
            els.nextStepBtn.innerHTML =
                '<span>' +
                label +
                '</span>' +
                '<i class="ph ' +
                icon +
                '" aria-hidden="true"></i>';
            els.nextStepBtn.setAttribute(
                'aria-label',
                currentStep < STEPS.length
                    ? label + ' — etapa ' + (currentStep + 1)
                    : label
            );
        }
        if (els.headerPublishBtn) {
            const onPublishStep = currentStep === STEPS.length;
            els.headerPublishBtn.hidden = !onPublishStep;
            els.headerPublishBtn.setAttribute('aria-hidden', onPublishStep ? 'false' : 'true');
        }
        if (els.stepFooterHint) {
            els.stepFooterHint.textContent = currentStep + ' / ' + STEPS.length;
            els.stepFooterHint.setAttribute(
                'aria-label',
                'Etapa ' + currentStep + ' de ' + STEPS.length
            );
            els.stepFooterHint.classList.remove('is-step-change');
            void els.stepFooterHint.offsetWidth;
            els.stepFooterHint.classList.add('is-step-change');
        }
        if (currentStep === 4) updatePublishSummary();
        if (currentStep === 3) {
            runAutoFill({ force: false });
            loadGoogleImagesSuggestions();
        }
        if (currentStep !== 2) setMdImmersive(false);
        if (!keepFeedback) clearFeedback();
        scheduleSaveFormDraft();
    }

    function isPlaceholderFeatured() {
        return (
            !featuredImage ||
            featuredImage === global.MockData.PLACEHOLDER_IMG ||
            /placeholder/i.test(featuredImage)
        );
    }

    function hideAutoFillBanner() {
        clearImportSparkle();
        if (els.autoFillBanner) {
            els.autoFillBanner.classList.remove('is-revealed');
            els.autoFillBanner.hidden = true;
        }
    }

    function clearImportSparkle() {
        clearTimeout(importSparkleStopTimer);
        if (!els.autoFillBanner) return;
        els.autoFillBanner.classList.remove('is-import-sparkle', 'is-import-sparkle-out');
        els.autoFillBanner.removeAttribute('aria-busy');
    }

    function startImportSparkle() {
        if (!els.autoFillBanner) return;
        clearTimeout(importSparkleStopTimer);
        els.autoFillBanner.hidden = false;
        els.autoFillBanner.classList.remove('is-import-sparkle-out', 'admin-animate-in');
        void els.autoFillBanner.offsetWidth;
        els.autoFillBanner.classList.add('is-revealed', 'is-import-sparkle');
        els.autoFillBanner.setAttribute('aria-busy', 'true');
        importSparkleStartedAt = Date.now();
    }

    function stopImportSparkle() {
        if (!els.autoFillBanner) return;
        const elapsed = Date.now() - importSparkleStartedAt;
        const delay = Math.max(0, IMPORT_SPARKLE_MIN_MS - elapsed);

        clearTimeout(importSparkleStopTimer);
        importSparkleStopTimer = setTimeout(() => {
            els.autoFillBanner.classList.remove('is-import-sparkle');
            els.autoFillBanner.classList.add('is-import-sparkle-out');
            els.autoFillBanner.removeAttribute('aria-busy');

            importSparkleStopTimer = setTimeout(() => {
                els.autoFillBanner?.classList.remove('is-import-sparkle-out');
            }, IMPORT_SPARKLE_FADE_MS);
        }, delay);
    }

    function runAutoFill({ meta = {}, markdown, force = false } = {}) {
        if (!global.ArticleAnalyzer) return null;

        const md = markdown != null ? markdown : els.mdTextarea.value;
        if (!String(md || '').trim() && !meta.title && !meta.titulo) return null;

        if (force) userTouched.clear();

        const analysis = global.ArticleAnalyzer.analyze({
            markdown: md,
            meta,
            categories: global.MockData.categories,
            authors: global.MockData.authors
        });

        lastAnalysis = analysis;
        applyAnalysisResults(analysis, force);
        return analysis;
    }

    function applyAnalysisResults(a, force) {
        if (!a) return;

        function should(field) {
            return force || !userTouched.has(field);
        }

        if (a.title && should('title')) els.titleInput.value = a.title;
        if (a.subtitle && should('subtitle')) els.subtitleInput.value = a.subtitle;
        if (a.seoDescription && should('seoDesc')) els.seoDesc.value = a.seoDescription;
        if (a.seoTitle && should('seoTitle')) els.seoTitle.value = a.seoTitle;

        if (a.categorySlug && should('category')) setCategorySlug(a.categorySlug);
        if (a.authorId && should('author')) els.authorSelect.value = a.authorId;

        if (a.tags?.length && should('tags')) {
            articleTags = a.tags;
            if (els.tagsInput) els.tagsInput.value = articleTags.join(', ');
        }

        if (a.keywords?.length && should('keywords') && els.keywordsInput) {
            els.keywordsInput.value = a.keywords.join(', ');
        }

        if (a.slug && (force || !els.slugInput.dataset.locked) && should('slug')) {
            els.slugInput.value = a.slug;
        }

        if (a.date && els.dateInput && should('date')) els.dateInput.value = a.date;

        if (a.sourceName && should('sourceName')) els.sourceNameInput.value = a.sourceName;
        if (a.sourceUrl && should('sourceUrl')) els.sourceUrlInput.value = a.sourceUrl;

        if (a.featuredImage && (force || isPlaceholderFeatured())) {
            featuredImage = a.featuredImage;
            updateFeaturedPreview();
        }
    }

    async function loadGoogleImagesSuggestions() {
        if (!global.GoogleImagesSearch?.loadSuggestions || !els.googleImagesSuggestionsGrid) return;

        const query =
            lastAnalysis?.imageSearchQuery ||
            global.GoogleImagesSearch.buildSearchQuery(getImageSearchContext());

        if (!query) return;

        const token = ++suggestionsToken;
        await global.GoogleImagesSearch.loadSuggestions({
            gridEl: els.googleImagesSuggestionsGrid,
            loadingEl: els.googleImagesSuggestionsLoading,
            emptyEl: els.googleImagesSuggestionsEmpty,
            wrapEl: els.googleImagesSuggestionsWrap,
            query,
            limit: 8,
            onSelect: (photo) => {
                if (token !== suggestionsToken) return;
                applyGoogleImage(photo, { purpose: 'featured' });
            }
        });
    }

    function validateStep(step) {
        if (step === 1) {
            if (!els.titleInput.value.trim() && els.mdTextarea.value.trim().length >= 20) {
                runAutoFill({ force: false });
            }
            if (!els.titleInput.value.trim()) {
                showFeedback(
                    'error',
                    'Importe um .md ou escreva o conteúdo — a manchete é gerada automaticamente.'
                );
                return false;
            }
            if (!els.catSelect.value) {
                runAutoFill({ force: false });
            }
            if (!els.catSelect.value) {
                showFeedback('error', 'Editoria não detectada — selecione uma manualmente.');
                els.catSelect.focus();
                return false;
            }
        }
        if (step === 2) {
            if (els.mdTextarea.value.trim().length < 20) {
                showFeedback('error', 'O corpo da matéria precisa ter pelo menos 20 caracteres.');
                els.mdTextarea.focus();
                return false;
            }
        }
        if (step === 4) {
            const sourceUrl = els.sourceUrlInput.value.trim();
            if (sourceUrl && !/^https?:\/\/.+/i.test(sourceUrl)) {
                showFeedback('error', 'O link da fonte deve começar com http:// ou https://.');
                els.sourceUrlInput.focus();
                return false;
            }
            // Resumo e áudios são gerados automaticamente no fluxo de publicação.
        }
        return true;
    }

    function categoryLabel(slug) {
        const cat = global.MockData.categories.find((c) => c.slug === slug);
        if (!cat) return '—';
        if (global.ArticleAnalyzer?.formatCategoryLabel) {
            return global.ArticleAnalyzer.formatCategoryLabel(cat, global.MockData.categories);
        }
        return cat.name;
    }

    function setCategorySlug(slug) {
        if (!slug || !els.catSelect) return false;
        const exists = Array.from(els.catSelect.options).some((o) => o.value === slug);
        if (exists) {
            els.catSelect.value = slug;
            return true;
        }
        return false;
    }

    function getImageSearchContext() {
        const cat = global.MockData.categories.find((c) => c.slug === els.catSelect.value);
        const keywordsRaw = els.keywordsInput?.value || '';
        const keywords = keywordsRaw
            .split(/[,;]+/)
            .map((k) => k.trim())
            .filter(Boolean);
        return {
            title: els.titleInput.value,
            subtitle: els.subtitleInput.value,
            excerpt: els.seoDesc?.value || '',
            categoryName: cat ? categoryLabel(cat.slug) : '',
            keywords,
            tags: lastAnalysis?.tags || []
        };
    }

    function cleanImageAlt(value) {
        return String(value || '')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
            .replace(/[\[\]\(\)!]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 90);
    }

    function suggestAltFromContext() {
        return (
            cleanImageAlt(els.titleInput?.value) ||
            cleanImageAlt(els.subtitleInput?.value) ||
            cleanImageAlt(lastAnalysis?.title) ||
            'imagem'
        );
    }

    function suggestAltFromUrl(url) {
        try {
            const path = new URL(String(url).trim()).pathname || '';
            const base = decodeURIComponent(path.split('/').pop() || '');
            const name = base
                .replace(/\.[a-z0-9]{2,5}$/i, '')
                .replace(/[-_+]+/g, ' ')
                .replace(/\d{6,}/g, ' ')
                .trim();
            const cleaned = cleanImageAlt(name);
            if (!cleaned || cleaned.length < 3 || /^(crawler|media|image|img|photo|foto)$/i.test(cleaned)) {
                return suggestAltFromContext();
            }
            return cleaned;
        } catch (_) {
            return suggestAltFromContext();
        }
    }

    function suggestAltFromPhoto(photo) {
        const raw = cleanImageAlt(photo?.alt_description);
        const context = suggestAltFromContext();
        if (
            !raw ||
            raw.length > 70 ||
            /via\s*:|@\w+|rumor|http|instagram|bem-vindos|fala\s*gee/i.test(raw)
        ) {
            return context;
        }
        return raw;
    }

    function isInsertableImageUrl(url) {
        if (!url || !/^https:\/\//i.test(url)) return false;
        try {
            const u = new URL(url);
            const host = u.hostname.replace(/^www\./, '').toLowerCase();
            const path = u.pathname || '';
            if (/lookaside\./i.test(host)) return false;
            if (/\/seo\/google_widget\/crawler|\/google_widget\//i.test(path)) return false;
            if (host === 'instagram.com' || host === 'facebook.com' || host === 'fb.com') return false;
            if (host === 'x.com' || host === 'twitter.com') return false;
            return true;
        } catch (_) {
            return false;
        }
    }

    function pickPhotoUrl(photo) {
        const candidates = [
            photo?.urls?.regular,
            photo?.urls?.full,
            photo?.urls?.small,
            photo?.urls?.thumb
        ];
        for (let i = 0; i < candidates.length; i++) {
            const u = candidates[i];
            if (u && isInsertableImageUrl(u)) return u;
        }
        return '';
    }

    function setImageAltValue(value, { force } = {}) {
        if (!els.imageAltInput) return;
        if (!force && imageAltTouched) return;
        els.imageAltInput.value = cleanImageAlt(value) || suggestAltFromContext();
    }

    function applyGoogleImage(photo, meta) {
        const url = pickPhotoUrl(photo);
        if (!url) {
            showFeedback(
                'error',
                'Essa imagem não tem um link direto utilizável. Escolha outra.'
            );
            return;
        }

        const purpose =
            (meta && meta.purpose) || imageUrlMode || 'featured';

        if (purpose === 'content') {
            const alt = suggestAltFromPhoto(photo);
            setImageAltValue(alt, { force: true });
            insertContentImageUrl(url, alt);
            imageUrlModal?.hide();
            showFeedback('success', 'Imagem inserida no texto.');
            return;
        }

        featuredImage = url;
        updateFeaturedPreview();

        if (!els.captionInput.value.trim() && global.GoogleImagesSearch) {
            els.captionInput.value = global.GoogleImagesSearch.formatAttribution(photo);
        }

        imageUrlModal?.hide();
        showFeedback('success', 'Capa definida com imagem da busca.');
    }

    function insertContentImageUrl(url, alt) {
        const ta = els.mdTextarea;
        if (!ta || !url) return;
        if (els.previewPaneWrap?.classList.contains('active')) {
            switchMdTab('write');
        }
        const safeAlt = cleanImageAlt(alt) || suggestAltFromContext() || 'imagem';
        const insertion = '![' + safeAlt + '](' + url + ')\n';
        const range = imageInsertRange || {
            start: ta.selectionStart,
            end: ta.selectionEnd
        };
        ta.setRangeText(insertion, range.start, range.end, 'end');
        imageInsertRange = null;
        ta.focus();
        updateMdStats();
        if (els.previewPaneWrap?.classList.contains('active')) updatePreview();
    }

    function updateFeaturedPreview() {
        const src =
            featuredImage.startsWith('data:') || featuredImage.startsWith('http')
                ? featuredImage
                : '../' + featuredImage.replace(/^\//, '');
        els.featuredImg.src = src;
        scheduleSaveFormDraft();
    }

    function htmlSafe() {
        return (
            global.HtmlSafe || {
                escapeHtml: (s) => String(s ?? ''),
                escapeAttr: (s) => String(s ?? '')
            }
        );
    }

    function renderArticleSourceBlock(label, url) {
        const safe = htmlSafe();
        const name = safe.escapeHtml(label || 'Fonte original');
        if (url && /^https?:\/\/.+/i.test(url)) {
            return (
                '<div class="article-source">' +
                '<p class="article-source-line">' +
                '<i class="ph ph-link-simple text-gold me-1" aria-hidden="true"></i> ' +
                'Fonte · ' +
                '<a href="' +
                safe.escapeAttr(url) +
                '" class="article-source-link" target="_blank" rel="noopener noreferrer">' +
                name +
                '</a></p></div>'
            );
        }
        return (
            '<div class="article-source">' +
            '<p class="article-source-line">' +
            '<i class="ph ph-link-simple text-gold me-1" aria-hidden="true"></i> ' +
            'Fonte · <span class="article-source-label">' +
            name +
            '</span></p></div>'
        );
    }

    function buildSourcePreviewHtml(name, url) {
        const sourceName = (name != null ? name : els.sourceNameInput.value).trim();
        const sourceUrl = (url != null ? url : els.sourceUrlInput.value).trim();
        if (!sourceName && !sourceUrl) return '';
        return renderArticleSourceBlock(sourceName || 'Fonte original', sourceUrl);
    }

    function isFontesHeading(el) {
        if (!el || !/^H[2-4]$/.test(el.tagName)) return false;
        return /^Fontes?\s*:?\s*$/i.test((el.textContent || '').trim());
    }

    function findLinkInNode(node) {
        if (!node) return null;
        const a = node.tagName === 'A' ? node : node.querySelector('a');
        if (a && a.getAttribute('href')) {
            return { url: a.getAttribute('href'), label: (a.textContent || '').trim() };
        }
        return null;
    }

    function removeHrBefore(contentEl, element) {
        const prev = element.previousElementSibling;
        if (prev && prev.tagName === 'HR') prev.remove();
    }

    /** Extrai seção Fontes/Fonte do HTML renderizado e devolve bloco .article-source. */
    function extractFontesFromContent(contentEl) {
        const children = Array.from(contentEl.children);

        for (let i = children.length - 1; i >= 0; i--) {
            if (!isFontesHeading(children[i])) continue;

            let link = null;
            let label = '';

            for (let j = i + 1; j < children.length; j++) {
                const found = findLinkInNode(children[j]);
                if (found) {
                    link = found;
                    break;
                }
                const t = (children[j].textContent || '').trim();
                if (t && !label) label = t.replace(/^[-–—*]\s*/, '');
            }

            let html = null;
            if (link) html = renderArticleSourceBlock(link.label || label, link.url);
            else if (label) html = renderArticleSourceBlock(label, '');

            if (!html) return null;

            const toRemove = children.slice(i);
            const hrBefore = children[i].previousElementSibling;
            if (hrBefore && hrBefore.tagName === 'HR') hrBefore.remove();
            toRemove.forEach((n) => {
                if (n.parentNode === contentEl) n.remove();
            });

            return html;
        }

        const last = contentEl.lastElementChild;
        if (last && last.tagName === 'P') {
            const text = (last.textContent || '').trim();
            let html = null;

            if (/^Fonte\s*[·•\-–—]\s*/i.test(text)) {
                const found = findLinkInNode(last);
                if (found) html = renderArticleSourceBlock(found.label, found.url);
                else {
                    const plain = text.replace(/^Fonte\s*[·•\-–—]\s*/i, '').trim();
                    html = renderArticleSourceBlock(plain, '');
                }
            } else if (/^Fontes?\s*:/i.test(text)) {
                const found = findLinkInNode(last);
                const plain = text.replace(/^Fontes?\s*:\s*/i, '').trim();
                html = renderArticleSourceBlock(found ? found.label : plain, found ? found.url : '');
            }

            if (html) {
                removeHrBefore(contentEl, last);
                last.remove();
                return html;
            }
        }

        return null;
    }

    function markdownForPreview(raw) {
        let md = String(raw || '');
        const hasSourceFields =
            els.sourceNameInput.value.trim() || els.sourceUrlInput.value.trim();
        if (hasSourceFields) {
            md = md.replace(/\n---\s*$/g, '').trimEnd();
            md = md.replace(/\n#{1,4}\s*Fontes?\s*:?\s*\n[\s\S]*$/i, '').trimEnd();
        }
        if (global.MediaStore && typeof global.MediaStore.resolveMarkdown === 'function') {
            md = global.MediaStore.resolveMarkdown(md);
        }
        return md;
    }

    /** Encurta data: URLs no textarea usando media://id da biblioteca. */
    function compactEditorMediaUrls() {
        const ta = els.mdTextarea;
        if (!ta || !global.MediaStore || typeof global.MediaStore.compactMarkdown !== 'function') {
            return;
        }
        if (!ta.value.includes('data:')) return;
        const compacted = global.MediaStore.compactMarkdown(ta.value);
        if (compacted === ta.value) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = compacted;
        const max = compacted.length;
        ta.setSelectionRange(Math.min(start, max), Math.min(end, max));
        updateMdStats();
    }

    function updatePreview() {
        compactEditorMediaUrls();
        els.previewPane.innerHTML = global.MarkdownUtil.renderMarkdown(
            markdownForPreview(els.mdTextarea.value)
        );
        if (els.previewOutro) {
            els.previewOutro.innerHTML = '';
            els.previewOutro.hidden = true;
        }
        enhanceSourceBlockFromContent(els.previewPane, els.previewOutro);
    }

    /** Move Fontes do markdown para o bloco .article-source igual ao site. */
    function enhanceSourceBlockFromContent(contentEl, outroEl) {
        if (!contentEl || !outroEl) return;

        let html = buildSourcePreviewHtml();
        if (!html) html = extractFontesFromContent(contentEl);

        if (!html) return;

        outroEl.innerHTML = html;
        outroEl.hidden = false;
    }

    function applyMdAction(action) {
        switch (action) {
            case 'bold':
                wrapSelection('**', '**', 'negrito');
                break;
            case 'italic':
                wrapSelection('*', '*', 'itálico');
                break;
            case 'h2':
                insertLine('## ');
                break;
            case 'h3':
                insertLine('### ');
                break;
            case 'quote':
                insertLine('> ');
                break;
            case 'ul':
                insertLine('- ');
                break;
            case 'ol':
                insertLine('1. ');
                break;
            case 'link':
                wrapSelection('[', '](https://)', 'texto');
                break;
            case 'code':
                wrapSelection('`', '`', 'código');
                break;
            case 'image':
                openImageUrlModal('content');
                break;
            case 'embed':
            case 'youtube':
                openSocialEmbedModal();
                break;
            default:
                break;
        }
    }

    function isHttpImageUrl(url) {
        if (!isInsertableImageUrl(url)) return false;
        if (/\.(jpe?g|png|gif|webp|svg|avif)(\?|#|$)/i.test(url)) return true;
        if (/^https?:\/\/(i\.)?imgur\.com\//i.test(url)) return true;
        if (
            /googleusercontent\.com|ggpht\.com|gstatic\.com|twimg\.com|pinimg\.com|cloudinary\.com|unsplash\.com|pexels\.com|cdninstagram\.com|fbcdn\.net/i.test(
                url
            )
        ) {
            return true;
        }
        return /^https:\/\//i.test(url);
    }

    function openImageUrlModal(mode) {
        if (!imageUrlModal) return;
        imageUrlMode = mode === 'featured' ? 'featured' : 'content';
        if (imageUrlMode === 'content' && els.previewPaneWrap?.classList.contains('active')) {
            switchMdTab('write');
        }
        if (els.mdTextarea && imageUrlMode === 'content') {
            imageInsertRange = {
                start: els.mdTextarea.selectionStart,
                end: els.mdTextarea.selectionEnd
            };
            const selected = els.mdTextarea.value
                .substring(els.mdTextarea.selectionStart, els.mdTextarea.selectionEnd)
                .trim();
            if (els.imageUrlInput) {
                els.imageUrlInput.value = /^https?:\/\//i.test(selected) ? selected : '';
            }
        } else if (els.imageUrlInput) {
            els.imageUrlInput.value =
                featuredImage && /^https?:\/\//i.test(featuredImage) ? featuredImage : '';
        }
        imageAltTouched = false;
        if (els.imageAltWrap) els.imageAltWrap.hidden = false;
        if (imageUrlMode === 'content') {
            const seedUrl = String(els.imageUrlInput?.value || '').trim();
            setImageAltValue(
                seedUrl && /^https?:\/\//i.test(seedUrl)
                    ? suggestAltFromUrl(seedUrl)
                    : suggestAltFromContext(),
                { force: true }
            );
        } else {
            setImageAltValue(suggestAltFromContext(), { force: true });
        }
        if (els.imageUrlTitle) {
            els.imageUrlTitle.textContent =
                imageUrlMode === 'featured' ? 'Escolher capa' : 'Inserir imagem';
        }
        if (els.imageUrlLead) {
            els.imageUrlLead.textContent =
                imageUrlMode === 'featured'
                    ? 'Busque uma imagem · ideal 16:9'
                    : 'Busque uma imagem';
        }
        setImageUrlAdvancedOpen(false);
        if (els.imageUrlError) {
            els.imageUrlError.hidden = true;
            els.imageUrlError.textContent = '';
        }
        imageUrlModal.show();
        if (imageSearchPanel) {
            imageSearchPanel.prepare();
        }
    }

    function setImageUrlAdvancedOpen(open) {
        const fields = els.imageUrlAdvancedFields;
        const toggle = els.imageUrlAdvancedToggle;
        if (fields) fields.classList.toggle('is-open', !!open);
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (els.imageUrlConfirm) els.imageUrlConfirm.hidden = !open;
        if (open) {
            setTimeout(() => els.imageUrlInput?.focus(), 50);
        }
    }

    function confirmImageUrl() {
        const url = String(els.imageUrlInput?.value || '').trim();
        if (!url || !isHttpImageUrl(url)) {
            if (els.imageUrlError) {
                els.imageUrlError.hidden = false;
                els.imageUrlError.textContent = 'Informe uma URL http(s) válida de imagem.';
            }
            els.imageUrlInput?.focus();
            return;
        }

        if (imageUrlMode === 'featured') {
            featuredImage = url;
            updateFeaturedPreview();
            imageUrlModal.hide();
            showFeedback('success', 'Capa definida pela URL.');
            return;
        }

        const alt =
            cleanImageAlt(els.imageAltInput?.value) ||
            suggestAltFromUrl(url);
        insertContentImageUrl(url, alt);
        imageUrlModal.hide();
        showFeedback('success', 'Imagem inserida no texto.');
    }

    function openSocialEmbedModal() {
        const ta = els.mdTextarea;
        if (!ta || !socialEmbedModal) return;
        if (els.previewPaneWrap?.classList.contains('active')) {
            switchMdTab('write');
        }
        socialEmbedInsertRange = {
            start: ta.selectionStart,
            end: ta.selectionEnd
        };
        const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
        if (els.socialEmbedUrlInput) {
            els.socialEmbedUrlInput.value = /^https?:\/\//i.test(selected) ? selected : '';
        }
        if (els.socialEmbedError) {
            els.socialEmbedError.hidden = true;
            els.socialEmbedError.textContent = '';
        }
        if (els.socialEmbedHint) {
            els.socialEmbedHint.hidden = true;
            els.socialEmbedHint.textContent = '';
        }
        updateSocialEmbedHint();
        socialEmbedModal.show();
    }

    function providerLabel(provider) {
        const map = {
            youtube: 'YouTube',
            x: 'X (Twitter)',
            instagram: 'Instagram',
            facebook: 'Facebook',
            tiktok: 'TikTok',
            vimeo: 'Vimeo',
            spotify: 'Spotify',
            reddit: 'Reddit'
        };
        return map[provider] || provider;
    }

    function updateSocialEmbedHint() {
        if (!els.socialEmbedHint || !els.socialEmbedUrlInput) return;
        const url = String(els.socialEmbedUrlInput.value || '').trim();
        if (!url || !global.MarkdownUtil?.resolveEmbed) {
            els.socialEmbedHint.hidden = true;
            return;
        }
        const resolved = global.MarkdownUtil.resolveEmbed(url);
        if (!resolved) {
            els.socialEmbedHint.hidden = true;
            return;
        }
        els.socialEmbedHint.hidden = false;
        els.socialEmbedHint.textContent = 'Detectado: ' + providerLabel(resolved.provider);
    }

    function confirmSocialEmbed() {
        const ta = els.mdTextarea;
        if (!ta) return;
        const url = String(els.socialEmbedUrlInput?.value || '').trim();
        if (!url) {
            if (els.socialEmbedError) {
                els.socialEmbedError.hidden = false;
                els.socialEmbedError.textContent = 'Cole um link válido.';
            }
            els.socialEmbedUrlInput?.focus();
            return;
        }
        const resolved =
            global.MarkdownUtil && typeof global.MarkdownUtil.resolveEmbed === 'function'
                ? global.MarkdownUtil.resolveEmbed(url)
                : null;
        if (!resolved) {
            if (els.socialEmbedError) {
                els.socialEmbedError.hidden = false;
                els.socialEmbedError.textContent =
                    'Link não reconhecido. Use YouTube, X, Instagram, Facebook, TikTok, Vimeo, Spotify ou Reddit.';
            }
            els.socialEmbedUrlInput?.focus();
            return;
        }

        const range = socialEmbedInsertRange || {
            start: ta.selectionStart,
            end: ta.selectionEnd
        };
        const before = ta.value.slice(0, range.start);
        let block = url;
        if (before.length && !before.endsWith('\n')) block = '\n\n' + block;
        else if (before.length && before.endsWith('\n') && !before.endsWith('\n\n')) block = '\n' + block;
        block += '\n\n';
        ta.setRangeText(block, range.start, range.end, 'end');
        socialEmbedInsertRange = null;
        socialEmbedModal.hide();
        ta.focus();
        updateMdStats();
        if (els.previewPaneWrap?.classList.contains('active')) updatePreview();
        showFeedback('success', providerLabel(resolved.provider) + ' incorporado no texto.');
    }

    function updateMdStats() {
        const text = els.mdTextarea ? els.mdTextarea.value : '';
        const trimmed = text.trim();
        const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
        const chars = text.length;
        const minutes = Math.max(
            1,
            global.ArticleAnalyzer
                ? global.ArticleAnalyzer.readingTimeMinutes(text)
                : Math.ceil(words / 200) || 1
        );
        if (els.mdWordCount) els.mdWordCount.textContent = String(words);
        if (els.mdCharCount) els.mdCharCount.textContent = String(chars);
        if (els.mdReadTime) els.mdReadTime.textContent = String(minutes);
    }

    function switchMdTab(target) {
        document.querySelectorAll('.md-editor-tab').forEach((t) => {
            const isActive = t.getAttribute('data-tab') === target;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        if (!els.previewPaneWrap || !els.writePane) return;
        const isWrite = target === 'write';
        els.writePane.classList.toggle('active', isWrite);
        els.previewPaneWrap.classList.toggle('active', !isWrite);
        els.writePane.hidden = !isWrite;
        els.previewPaneWrap.hidden = isWrite;
        if (els.mdEditor) {
            els.mdEditor.classList.toggle('is-preview', target === 'preview');
        }
        if (target === 'preview') updatePreview();
        if (target === 'write' && els.mdTextarea) {
            setTimeout(() => {
                if (document.activeElement !== els.mdTextarea) return;
                ensureMdCaretVisible();
            }, 50);
        }
    }

    function setMdImmersive(on) {
        if (!els.mdEditor) return;
        const enabled = !!on;
        els.mdEditor.classList.toggle('is-immersive', enabled);
        document.body.classList.toggle('md-editor-immersive', enabled);
        if (els.mdExpandBtn) {
            els.mdExpandBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            els.mdExpandBtn.setAttribute(
                'aria-label',
                enabled ? 'Sair da tela cheia' : 'Abrir editor em tela cheia'
            );
            els.mdExpandBtn.title = enabled ? 'Sair da tela cheia' : 'Tela cheia';
            const icon = els.mdExpandBtn.querySelector('i');
            if (icon) {
                icon.className = enabled ? 'ph ph-arrows-in' : 'ph ph-arrows-out';
                icon.setAttribute('aria-hidden', 'true');
            }
            const label = els.mdExpandBtn.querySelector('.md-editor-expand-label');
            if (label) {
                label.textContent = enabled ? 'Sair da tela cheia' : 'Tela cheia';
            }
        }
        if (enabled && els.mdTextarea && els.writePane?.classList.contains('active')) {
            setTimeout(() => els.mdTextarea.focus(), 50);
        }
    }

    function ensureMdCaretVisible() {
        if (!els.mdTextarea) return;
        try {
            els.mdTextarea.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (_) {}
    }

    function wrapSelection(before, after, placeholder) {
        const ta = els.mdTextarea;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = ta.value.substring(start, end) || placeholder;
        ta.setRangeText(before + selected + after, start, end, 'end');
        ta.focus();
    }

    function insertLine(prefix) {
        const ta = els.mdTextarea;
        const start = ta.selectionStart;
        const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
        ta.setRangeText(prefix, lineStart, lineStart, 'end');
        ta.focus();
    }

    function applyImportedArticle(meta, body) {
        const analysis = global.ArticleAnalyzer
            ? global.ArticleAnalyzer.analyze({
                  markdown: body,
                  meta: meta || {},
                  categories: global.MockData.categories,
                  authors: global.MockData.authors
              })
            : null;

        const nextMeta = { ...(meta || {}) };
        if (analysis?.sourceName) {
            nextMeta.source_name = analysis.sourceName;
            nextMeta.source = analysis.sourceName;
        }
        if (analysis?.sourceUrl) nextMeta.source_url = analysis.sourceUrl;

        const cleanBody =
            analysis && (analysis.sourceName || analysis.sourceUrl) && global.ArticleAnalyzer.stripFontesFromMarkdown
                ? global.ArticleAnalyzer.stripFontesFromMarkdown(body)
                : body;

        els.mdTextarea.value = cleanBody || '';
        runAutoFill({ meta: nextMeta, markdown: body, force: true });
        updatePreview();
        updateMdStats();
    }

    function renderImportPreview(raw) {
        const validation = global.MarkdownUtil.validateMarkdownFile(raw, pendingImport?.name);
        els.importError.hidden = true;
        els.importPreview.hidden = true;
        els.importApplyBtn.disabled = true;

        if (!validation.ok) {
            els.importError.hidden = false;
            els.importError.textContent = validation.error;
            return;
        }

        const { meta, body } = global.MarkdownUtil.parseFrontMatter(raw);
        pendingImport = { raw, meta, body, name: pendingImport?.name };

        const analysis = global.ArticleAnalyzer
            ? global.ArticleAnalyzer.analyze({
                  markdown: body,
                  meta,
                  categories: global.MockData.categories,
                  authors: global.MockData.authors
              })
            : null;

        function metaText(value) {
            if (value == null) return '';
            if (Array.isArray(value)) {
                return value
                    .map((v) => String(v == null ? '' : v).trim())
                    .filter(Boolean)
                    .join(', ');
            }
            return String(value).trim();
        }

        let importSourceName =
            analysis?.sourceName ||
            metaText(meta.source) ||
            metaText(meta.source_name) ||
            metaText(meta.fonte) ||
            metaText(meta['source-name']) ||
            '';
        let importSourceUrl =
            analysis?.sourceUrl ||
            metaText(meta.source_url) ||
            metaText(meta.link_original) ||
            metaText(meta['source-url']) ||
            '';

        let bodyForPreview = body;
        if (importSourceName || importSourceUrl) {
            bodyForPreview = global.ArticleAnalyzer?.stripFontesFromMarkdown
                ? global.ArticleAnalyzer.stripFontesFromMarkdown(body)
                : body.replace(/\n---\s*$/g, '').trimEnd();
        }

        els.importPreviewBody.innerHTML = global.MarkdownUtil.renderMarkdown(bodyForPreview);
        if (els.importPreviewOutro) {
            els.importPreviewOutro.hidden = true;
            els.importPreviewOutro.innerHTML = '';
            if (importSourceName || importSourceUrl) {
                const sourceHtml = buildSourcePreviewHtml(importSourceName, importSourceUrl);
                els.importPreviewOutro.innerHTML = sourceHtml;
                els.importPreviewOutro.hidden = !sourceHtml;
            } else {
                enhanceSourceBlockFromContent(els.importPreviewBody, els.importPreviewOutro);
                if (!els.importPreviewOutro.hidden) {
                    const link = els.importPreviewOutro.querySelector('.article-source-link');
                    const label = els.importPreviewOutro.querySelector('.article-source-label');
                    if (link) {
                        importSourceUrl = link.getAttribute('href') || '';
                        importSourceName = (link.textContent || '').trim() || importSourceName;
                    } else if (label) {
                        importSourceName = (label.textContent || '').trim() || importSourceName;
                    }
                }
            }
        }
        els.importMetaList.innerHTML = '';

        const fields = [];
        if (analysis?.title) fields.push(['Título', analysis.title]);
        if (analysis?.subtitle) fields.push(['Subtítulo', analysis.subtitle]);
        if (analysis?.seoDescription) fields.push(['SEO', analysis.seoDescription]);
        if (analysis?.categoryName) fields.push(['Editoria', analysis.categoryName]);
        if (analysis?.tags?.length) fields.push(['Tags', analysis.tags.join(', ')]);
        if (analysis?.keywords?.length) fields.push(['Palavras-chave', analysis.keywords.join(', ')]);
        if (importSourceName) fields.push(['Fonte', importSourceName]);
        if (importSourceUrl) fields.push(['Link original', importSourceUrl]);
        if (analysis?.readingTime) fields.push(['Leitura', analysis.readingTime + ' min']);
        if (analysis?.featuredImage) fields.push(['Imagem', analysis.featuredImage]);
        fields.push(['Corpo', body.length + ' caracteres']);

        fields.forEach(([key, val]) => {
            const li = document.createElement('li');
            const keySpan = document.createElement('span');
            keySpan.className = 'import-meta-key';
            keySpan.textContent = key;
            const valSpan = document.createElement('span');
            valSpan.textContent = String(val);
            li.append(keySpan, valSpan);
            els.importMetaList.appendChild(li);
        });

        if (importSourceName || importSourceUrl) {
            pendingImport.meta = {
                ...meta,
                source_name: importSourceName || meta.source_name,
                source_url: importSourceUrl || meta.source_url
            };
        }

        els.importPreview.hidden = false;
        els.importApplyBtn.disabled = false;
        setImportDropzoneState('ready', pendingImport?.name || 'arquivo.md');
    }

    function setImportDropzoneState(state, fileName) {
        const zone = els.importDropzone;
        if (!zone) return;

        const loading = state === 'loading';
        const ready = state === 'ready';
        const idle = state === 'idle' || state === 'error';

        zone.classList.toggle('is-loading', loading);
        zone.classList.toggle('has-file', ready);
        zone.classList.toggle('is-dragover', false);
        zone.setAttribute('aria-busy', loading ? 'true' : 'false');

        if (els.importLoading) els.importLoading.hidden = !loading;
        if (els.importFileChip) els.importFileChip.hidden = !ready;
        if (els.importDropzoneIdle) els.importDropzoneIdle.hidden = !idle;

        if (els.importFileName) {
            els.importFileName.textContent = fileName || '';
            els.importFileName.title = fileName || '';
        }
        if (els.importFileMeta) {
            els.importFileMeta.textContent = ready ? 'Pronto para revisar' : '';
        }
    }

    async function handleMdFile(file) {
        if (!file) return;
        if (!/\.(md|markdown)$/i.test(file.name)) {
            if (els.importError) {
                els.importError.hidden = false;
                els.importError.textContent = 'Formato não suportado. Envie um arquivo .md ou .markdown.';
            }
            if (pendingImport?.body != null) {
                setImportDropzoneState('ready', pendingImport.name || 'arquivo.md');
            } else {
                setImportDropzoneState('error');
            }
            return;
        }
        els.importMdBtn?.classList.add('is-loading');
        setImportDropzoneState('loading', file.name);
        if (els.importError) els.importError.hidden = true;
        if (els.importPreview) els.importPreview.hidden = true;
        if (els.importApplyBtn) els.importApplyBtn.disabled = true;
        try {
            const text = await file.text();
            pendingImport = { name: file.name };
            renderImportPreview(text);
        } catch (_) {
            if (els.importError) {
                els.importError.hidden = false;
                els.importError.textContent = 'Não foi possível ler o arquivo.';
            }
            setImportDropzoneState('error');
        } finally {
            els.importMdBtn?.classList.remove('is-loading');
        }
    }

    function resetImportUi() {
        clearImportSparkle();
        pendingImport = null;
        if (els.importPreview) els.importPreview.hidden = true;
        if (els.importError) els.importError.hidden = true;
        if (els.importApplyBtn) els.importApplyBtn.disabled = true;
        if (els.importFileInput) els.importFileInput.value = '';
        if (els.importMetaList) els.importMetaList.innerHTML = '';
        if (els.importPreviewBody) els.importPreviewBody.innerHTML = '';
        setImportDropzoneState('idle');
    }

    function bindImportDropzone() {
        const zone = els.importDropzone;
        if (!zone) return;

        zone.addEventListener('click', (e) => {
            if (zone.classList.contains('is-loading') || zone.classList.contains('has-file')) return;
            if (e.target.closest('button')) return;
            openImportFilePicker();
        });

        zone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (zone.classList.contains('is-loading')) return;
            zone.classList.add('is-dragover');
        });
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (zone.classList.contains('is-loading')) return;
            zone.classList.add('is-dragover');
        });
        zone.addEventListener('dragleave', (e) => {
            if (e.target !== zone && zone.contains(e.relatedTarget)) return;
            zone.classList.remove('is-dragover');
        });
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.classList.remove('is-dragover');
            if (zone.classList.contains('is-loading')) return;
            const file = e.dataTransfer?.files?.[0];
            if (!file) return;
            await handleMdFile(file);
        });
    }

    function openImportFilePicker() {
        if (!els.importFileInput) return;
        els.importFileInput.value = '';
        els.importFileInput.click();
    }

    function updatePublishSummary() {
        const cat = global.MockData.categories.find((c) => c.slug === els.catSelect.value);
        const author = global.MockData.authors.find((a) => a.id === els.authorSelect.value);
        const words = els.mdTextarea.value.trim().split(/\s+/).filter(Boolean).length;
        const reading =
            lastAnalysis?.readingTime ||
            (global.ArticleAnalyzer
                ? global.ArticleAnalyzer.readingTimeMinutes(els.mdTextarea.value)
                : Math.max(1, Math.ceil(words / 200)));

        els.summaryTitle.textContent = els.titleInput.value.trim() || '—';
        els.summaryCategory.textContent = categoryLabel(els.catSelect.value);
        els.summaryAuthor.textContent = author ? author.name : '—';
        els.summaryReadingTime.textContent = reading + ' min';
        els.summaryTags.textContent =
            normalizeTags(els.tagsInput?.value || articleTags).join(', ') || '—';
        els.summaryWords.textContent = String(words);
        els.summaryStatus.textContent = els.destaqueSwitch.checked ? 'Destaque + Publicar' : 'Publicar';
        updateSerpPreview();
    }

    function truncateSerp(text, max) {
        const value = String(text || '').replace(/\s+/g, ' ').trim();
        if (!value) return '';
        if (value.length <= max) return value;
        const cut = value.slice(0, max - 1);
        const sp = cut.lastIndexOf(' ');
        return (sp > max * 0.55 ? cut.slice(0, sp) : cut).trimEnd() + '…';
    }

    function updateSerpPreview() {
        if (!els.serpPreviewTitle || !els.serpPreviewDesc || !els.serpPreviewUrl) return;
        const titleRaw =
            (els.seoTitle && els.seoTitle.value.trim()) ||
            (els.titleInput && els.titleInput.value.trim()) ||
            '';
        const descRaw =
            (els.seoDesc && els.seoDesc.value.trim()) ||
            (els.subtitleInput && els.subtitleInput.value.trim()) ||
            '';
        const slug =
            (els.slugInput && els.slugInput.value.trim()) ||
            (titleRaw ? slugify(titleRaw) : '') ||
            'slug-da-materia';
        els.serpPreviewTitle.textContent = truncateSerp(titleRaw, 60) || 'Título da matéria';
        els.serpPreviewDesc.textContent =
            truncateSerp(descRaw, 155) ||
            'A descrição SEO aparece aqui nos resultados de busca.';
        els.serpPreviewUrl.textContent = 'qualquertecla.com.br › notícia › ' + slug;
    }

    function validateAll() {
        for (let s = 1; s <= 4; s++) {
            if (!validateStep(s)) {
                goToStep(s, { keepFeedback: true });
                return false;
            }
        }
        return true;
    }

    function validateDraft() {
        if (!els.titleInput.value.trim() && els.mdTextarea.value.trim().length >= 20) {
            runAutoFill({ force: false });
        }
        if (!els.titleInput.value.trim() && els.mdTextarea.value.trim().length < 20) {
            showFeedback(
                'error',
                'Escreva a manchete ou o corpo da matéria para salvar o rascunho.'
            );
            goToStep(1, { keepFeedback: true });
            return false;
        }
        const sourceUrl = els.sourceUrlInput.value.trim();
        if (sourceUrl && !/^https?:\/\/.+/i.test(sourceUrl)) {
            showFeedback('error', 'O link da fonte deve começar com http:// ou https://.');
            goToStep(4, { keepFeedback: true });
            return false;
        }
        return true;
    }

    function flashSaveBadge() {
        const group = els.saveBadgeGroup || els.saveBadge;
        if (!group) return;
        group.classList.remove('is-flash');
        void group.offsetWidth;
        group.classList.add('is-flash');
    }

    function findArticleByIdOrSlug(id, slug) {
        const list = global.MockData.articles;
        if (id != null && id !== '') {
            const byId = list.find((a) => String(a.id) === String(id));
            if (byId) return byId;
        }
        if (slug) {
            return list.find((a) => a.slug === slug) || null;
        }
        return null;
    }

    function articleHasDraftRevision(article) {
        return !!(article && article.draft_revision && typeof article.draft_revision === 'object');
    }

    function collectEditorialFields() {
        const slug =
            (els.slugInput && els.slugInput.value.trim()) ||
            slugify(els.titleInput.value) ||
            'rascunho-' + Date.now();
        const markdown = els.mdTextarea.value.trim();
        const resolvedMd =
            global.MediaStore && typeof global.MediaStore.resolveMarkdown === 'function'
                ? global.MediaStore.resolveMarkdown(markdown)
                : markdown;
        const safeContent = global.MarkdownUtil.renderMarkdown(resolvedMd);
        const wordCount = markdown.split(/\s+/).filter(Boolean).length;

        return {
            title: els.titleInput.value.trim() || 'Rascunho sem título',
            subtitle: els.subtitleInput.value.trim(),
            excerpt: els.seoDesc.value.trim() || els.subtitleInput.value.trim(),
            slug,
            featured_image: featuredImage || global.MockData.PLACEHOLDER_IMG,
            image_caption: els.captionInput.value.trim(),
            reading_time: Math.max(1, Math.ceil(wordCount / 200)),
            category: els.catSelect.value,
            author: els.authorSelect.value,
            featured: els.destaqueSwitch.checked,
            tags: normalizeTags(els.tagsInput?.value || articleTags),
            keywords: normalizeTags(els.keywordsInput?.value || ''),
            source_name: els.sourceNameInput.value.trim(),
            source_url: els.sourceUrlInput.value.trim(),
            seo_title: els.seoTitle.value.trim(),
            seo_description: els.seoDesc.value.trim(),
            ai_summary: els.aiSummaryInput ? els.aiSummaryInput.value.trim() : '',
            content: safeContent,
            content_markdown: markdown
        };
    }

    function writeArticlesToSession() {
        try {
            sessionStorage.setItem(
                'qualquer-tecla_mock_articles',
                JSON.stringify(global.MockData.articles)
            );
        } catch (_) {}
    }

    async function upsertArticleRecord(next) {
        if (global.API && typeof global.API.upsertArticle === 'function') {
            try {
                next = await global.API.upsertArticle(next);
            } catch (err) {
                console.error('[Editor] Falha no upsert remoto:', err);
                showFeedback('error', 'Erro ao salvar remotamente: ' + err.message);
                throw err;
            }
        }
        const list = global.MockData.articles;
        const idx = list.findIndex((a) => String(a.id) === String(next.id));
        if (idx >= 0) {
            list[idx] = next;
        } else {
            list.unshift(next);
        }
        writeArticlesToSession();
        return next;
    }

    function resolvePublishedAt(existing) {
        let publishedAt = (existing && existing.published_at) || new Date().toISOString();
        if (els.dateInput && els.dateInput.value) {
            publishedAt = new Date(els.dateInput.value + 'T12:00:00').toISOString();
        }
        return publishedAt;
    }

    /**
     * Atualiza o chrome de status do editor.
     * Publicação ao vivo ≠ versão em edição (draft_revision).
     */
    function updateEditorStatusBadges({
        liveStatus,
        hasDraftRevision,
        justSaved
    } = {}) {
        const group = els.saveBadgeGroup;
        const badge = els.saveBadge;
        if (!badge) return;

        const published = liveStatus === 'published';
        const draftEdit = !!hasDraftRevision;

        if (group) {
            group.replaceChildren();
            if (published) {
                const live = document.createElement('span');
                live.className = 'admin-badge admin-badge--success';
                live.textContent = 'Publicado';
                live.title = 'Versão publicada no site';
                group.appendChild(live);
            }
            if (draftEdit || (!published && justSaved === 'draft')) {
                const draft = document.createElement('span');
                draft.className = published
                    ? 'admin-badge admin-badge--warning'
                    : 'admin-badge admin-badge--muted';
                draft.textContent = published
                    ? 'Edição em rascunho'
                    : justSaved === 'draft'
                      ? 'Rascunho salvo'
                      : 'Rascunho';
                draft.title = published
                    ? 'Há uma versão em edição; a publicação atual permanece no ar'
                    : 'Status da matéria';
                group.appendChild(draft);
            } else if (!published) {
                const draft = document.createElement('span');
                draft.className =
                    justSaved === 'published'
                        ? 'admin-badge admin-badge--success'
                        : 'admin-badge admin-badge--muted';
                draft.textContent = justSaved === 'published' ? 'Publicado' : 'Rascunho';
                draft.title = 'Status da matéria';
                group.appendChild(draft);
            }
            // Mantém #save-badge no DOM (oculto) para compatibilidade com flash/ARIA legados.
            badge.hidden = true;
            badge.setAttribute('aria-hidden', 'true');
        } else {
            if (published && draftEdit) {
                badge.textContent = 'Publicado · edição em rascunho';
                badge.className = 'admin-badge admin-badge--warning';
            } else if (published) {
                badge.textContent = justSaved === 'published' ? 'Publicado' : 'Editando';
                badge.className = 'admin-badge admin-badge--success';
            } else {
                badge.textContent = justSaved === 'draft' ? 'Rascunho salvo' : 'Rascunho';
                badge.className = 'admin-badge admin-badge--muted';
            }
            badge.title = 'Status da matéria';
            badge.hidden = false;
        }

        flashSaveBadge();
    }

    async function persistMock(status, options = {}) {
        const ok = status === 'draft' ? validateDraft() : validateAll();
        if (!ok) return null;

        const editorial = collectEditorialFields();
        const audioFields =
            (options.audioFields && typeof options.audioFields === 'object'
                ? options.audioFields
                : null) || pendingAudioFields;
        const slug = editorial.slug;
        const existing = findArticleByIdOrSlug(editingArticleId, slug);
        const now = new Date().toISOString();
        const isLivePublished = !!(existing && existing.status === 'published');

        // Salvar como rascunho NÃO despublica: guarda edição em draft_revision.
        if (status === 'draft' && isLivePublished) {
            const draftRevision = {
                ...editorial,
                updated_at: now
            };
            const next = {
                ...existing,
                id: existing.id,
                status: 'published',
                views: Number(existing.views) || 0,
                published_at: existing.published_at,
                draft_revision: draftRevision,
                _adminEdited: true
            };
            if (audioFields) Object.assign(next, audioFields);
            editingArticleId = next.id;
            try {
                await upsertArticleRecord(next);
            } catch (e) {
                return null;
            }
            updateEditorStatusBadges({
                liveStatus: 'published',
                hasDraftRevision: true,
                justSaved: 'draft'
            });
            showFeedback(
                'success',
                'Rascunho de edição salvo. A versão publicada e as visualizações permanecem intactas.'
            );
            els.slugInput.value = slug;
            els.slugInput.dataset.locked = '1';
            clearFormDraft();
            if (audioFields) pendingAudioFields = null;
            refreshArticleAudioStatus(next);
            return next;
        }

        let publishedAt = resolvePublishedAt(existing);
        if (status === 'draft' && !isLivePublished) {
            // Matéria ainda não publicada: published_at fica como referência de agendamento/data.
            publishedAt = resolvePublishedAt(existing);
        }

        const baseId = existing ? existing.id : String(Date.now());
        const preservedViews = existing ? Number(existing.views) || 0 : 0;

        const payload = {
            ...(existing || {}),
            id: baseId,
            ...editorial,
            published_at: publishedAt,
            updated_at: now,
            status,
            views: preservedViews,
            _adminEdited: true
        };

        if (audioFields) {
            Object.assign(payload, audioFields);
        } else if (status === 'published') {
            // Publicação sem áudio pré-gerado: Ouvir/Mary ficam desabilitados.
            payload.audio_status = payload.audio_status || 'missing';
        }

        // Publicar (nova ou republicar rascunho de edição): aplica conteúdo e limpa draft_revision.
        if (status === 'published') {
            delete payload.draft_revision;
            if (existing && existing.status === 'published') {
                payload.views = preservedViews;
            }
        } else if (!isLivePublished) {
            // Rascunho puro vive nos campos raiz — sem draft_revision paralelo.
            delete payload.draft_revision;
        }

        editingArticleId = payload.id;
        try {
            await upsertArticleRecord(payload);
        } catch (e) {
            return null;
        }
        updateEditorStatusBadges({
            liveStatus: payload.status,
            hasDraftRevision: articleHasDraftRevision(payload),
            justSaved: status
        });

        const audioReady = payload.audio_status === 'ready';
        showFeedback(
            'success',
            status === 'published'
                ? existing && existing.status === 'published'
                    ? audioReady
                        ? 'Nova versão publicada com áudios. ID e visualizações preservados.'
                        : 'Nova versão publicada (áudio Mary AI pendente — Ouvir desabilitado). ID e visualizações preservados.'
                    : audioReady
                      ? 'Matéria publicada com resumo e áudios nesta sessão (mock).'
                      : 'Matéria publicada nesta sessão (mock). Áudio Mary AI pendente — Ouvir desabilitado.'
                : 'Rascunho salvo nesta sessão (mock).'
        );

        els.slugInput.value = slug;
        els.slugInput.dataset.locked = '1';
        clearFormDraft();
        if (audioFields) pendingAudioFields = null;
        refreshArticleAudioStatus(payload);
        return payload;
    }

    function articlePublishedDate(resolved) {
        if (!resolved || !resolved.published_at) return '';
        try {
            return new Date(resolved.published_at).toISOString().slice(0, 10);
        } catch (_) {
            return '';
        }
    }

    function fieldsFromArticleSource(source) {
        if (!source) return null;
        return {
            title: source.title,
            subtitle: source.subtitle || '',
            markdown: global.MarkdownUtil.toEditorMarkdown(
                source.content,
                source.content_markdown
            ),
            category_slug: source.category_slug,
            author_id: source.author_id,
            image_caption: source.image_caption || '',
            source_name: source.source_name || '',
            source_url: source.source_url || '',
            featured: !!source.featured,
            slug: source.slug,
            seoTitle: source.title,
            seoDesc: source.excerpt || '',
            aiSummary: source.ai_summary || '',
            tags: source.tags || [],
            keywords: source.keywords || [],
            featured_image: source.featured_image || '',
            date: articlePublishedDate(source)
        };
    }

    function getResolvedArticleFields(slug) {
        const article = global.MockData.articles.find((a) => a.slug === slug);
        if (!article) return null;

        // Preferir a versão em edição quando existir; a publicação ao vivo permanece nos campos raiz.
        const source = articleHasDraftRevision(article)
            ? { ...article, ...article.draft_revision }
            : global.MockData.resolveArticle(article);

        const fields = fieldsFromArticleSource(source);
        if (!fields) return null;

        fields._liveStatus = article.status;
        fields._hasDraftRevision = articleHasDraftRevision(article);
        fields._articleId = article.id;
        // Data de publicação sempre da versão ao vivo (não do rascunho de edição).
        if (article.status === 'published') {
            fields.date = articlePublishedDate(article) || fields.date;
        }
        return fields;
    }

    function setEditModeChrome(fields) {
        if (els.pageTitle) els.pageTitle.textContent = 'Editar Notícia';
        updateEditorStatusBadges({
            liveStatus: (fields && fields._liveStatus) || 'draft',
            hasDraftRevision: !!(fields && fields._hasDraftRevision),
            justSaved: null
        });
    }

    function applyArticleFieldsToForm(fields, { merge = false } = {}) {
        if (!fields) return false;

        const keep = (current) => merge && draftHasText(current);
        const keepChecked = (current) => merge && current;

        if (!keep(els.titleInput && els.titleInput.value)) {
            els.titleInput.value = fields.title;
        }
        if (!keep(els.subtitleInput && els.subtitleInput.value)) {
            els.subtitleInput.value = fields.subtitle;
        }
        if (!keep(els.mdTextarea && els.mdTextarea.value)) {
            els.mdTextarea.value = fields.markdown;
            updateMdStats();
        }
        if (!keep(els.catSelect && els.catSelect.value) && fields.category_slug) {
            els.catSelect.value = fields.category_slug;
        }
        if (!keep(els.authorSelect && els.authorSelect.value) && fields.author_id) {
            els.authorSelect.value = fields.author_id;
        }
        if (!keep(els.captionInput && els.captionInput.value)) {
            els.captionInput.value = fields.image_caption;
        }
        if (!keep(els.sourceNameInput && els.sourceNameInput.value)) {
            els.sourceNameInput.value = fields.source_name;
        }
        if (!keep(els.sourceUrlInput && els.sourceUrlInput.value)) {
            els.sourceUrlInput.value = fields.source_url;
        }
        if (!keepChecked(els.destaqueSwitch && els.destaqueSwitch.checked)) {
            els.destaqueSwitch.checked = fields.featured;
        }
        if (!keep(els.slugInput && els.slugInput.value)) {
            els.slugInput.value = fields.slug;
            els.slugInput.dataset.locked = '1';
        }
        if (!keep(els.seoTitle && els.seoTitle.value)) {
            els.seoTitle.value = fields.seoTitle;
        }
        if (!keep(els.seoDesc && els.seoDesc.value)) {
            els.seoDesc.value = fields.seoDesc;
        }
        if (els.aiSummaryInput && !keep(els.aiSummaryInput.value)) {
            els.aiSummaryInput.value = fields.aiSummary || '';
        }
        if (!keep(els.tagsInput && els.tagsInput.value)) {
            articleTags = fields.tags.slice();
            if (els.tagsInput) els.tagsInput.value = articleTags.join(', ');
        }
        if (!keep(els.keywordsInput && els.keywordsInput.value) && fields.keywords.length) {
            els.keywordsInput.value = fields.keywords.join(', ');
        }
        if (els.dateInput && !keep(els.dateInput.value) && fields.date) {
            els.dateInput.value = fields.date;
        }
        if (
            fields.featured_image &&
            (!merge || isPlaceholderFeatured())
        ) {
            featuredImage = fields.featured_image;
            updateFeaturedPreview();
        }

        return true;
    }

    function hydrateEmptyFieldsFromArticle(slug) {
        const fields = getResolvedArticleFields(slug);
        if (!fields) return false;

        if (formDraftTimer) {
            clearTimeout(formDraftTimer);
            formDraftTimer = null;
        }
        formDraftSuspended = true;
        try {
            if (fields._articleId != null) editingArticleId = fields._articleId;
            setEditModeChrome(fields);
            applyArticleFieldsToForm(fields, { merge: true });
        } finally {
            formDraftSuspended = false;
        }
        return true;
    }

    function restoreEditWizardStep(slug) {
        const draft = pickDraftFallback(slug);
        if (!draft) return false;
        const step = Math.max(1, Math.min(STEPS.length, Number(draft.currentStep) || 1));
        if (Array.isArray(draft.userTouched) && draft.userTouched.length) {
            userTouched = new Set(draft.userTouched);
        }
        goToStep(step, { keepFeedback: true });
        return step > 1;
    }

    function ensureEditFormLoaded(slug) {
        loadArticle(slug);
        // Overlay só de campos NÃO vazios do draft (nunca apaga o que veio do MockData).
        const draft = pickDraftFallback(slug);
        if (draft && draftHasEditorialContent(draft)) {
            applyFormDraft(draft, { merge: true });
        }
        hydrateEmptyFieldsFromArticle(slug);

        const titleEmpty = !draftHasText(els.titleInput && els.titleInput.value);
        const mdEmpty = !draftHasText(els.mdTextarea && els.mdTextarea.value);
        if (titleEmpty || mdEmpty) {
            loadArticle(slug);
        }
        return !(
            !draftHasText(els.titleInput && els.titleInput.value) &&
            !draftHasText(els.mdTextarea && els.mdTextarea.value)
        );
    }

    function bindEditFormRescue() {
        const rescue = () => {
            const slug = editorDraftScope();
            if (slug === '__new__') return;
            const titleEmpty = !draftHasText(els.titleInput && els.titleInput.value);
            const mdEmpty = !draftHasText(els.mdTextarea && els.mdTextarea.value);
            if (!titleEmpty && !mdEmpty) return;
            ensureEditFormLoaded(slug);
        };
        global.addEventListener('pageshow', rescue);
        // Alguns browsers esvaziam inputs tarde no ciclo de navegação.
        global.setTimeout(rescue, 0);
        global.setTimeout(rescue, 100);
    }

    function loadArticle(slug) {
        const fields = getResolvedArticleFields(slug);
        if (!fields) return false;

        if (formDraftTimer) {
            clearTimeout(formDraftTimer);
            formDraftTimer = null;
        }
        formDraftSuspended = true;
        try {
            editingArticleId = fields._articleId != null ? fields._articleId : null;
            setEditModeChrome(fields);
            applyArticleFieldsToForm(fields, { merge: false });
            userTouched.clear();
            TOUCH_FIELDS.forEach(([field]) => userTouched.add(field));
            const live = global.MockData.articles.find((a) => a.id === editingArticleId);
            pendingAudioFields = null;
            refreshArticleAudioStatus(live || null);
        } finally {
            formDraftSuspended = false;
        }
        return true;
    }

    function bindTouchTracking() {
        TOUCH_FIELDS.forEach(([field, key]) => {
            const el = els[key];
            if (!el) return;
            const evt = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(evt, () => userTouched.add(field));
        });
    }

    function bindEvents() {
        bindTouchTracking();

        els.titleInput.addEventListener('input', () => {
            if (!els.slugInput.dataset.locked && !userTouched.has('slug')) {
                els.slugInput.value = slugify(els.titleInput.value);
            }
            updateSerpPreview();
        });

        [els.seoTitle, els.seoDesc, els.subtitleInput, els.slugInput].forEach((el) => {
            if (!el) return;
            el.addEventListener('input', updateSerpPreview);
        });

        els.stepBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = Number(btn.getAttribute('data-step'));
                if (target > currentStep) {
                    for (let s = currentStep; s < target; s++) {
                        if (!validateStep(s)) {
                            goToStep(s);
                            return;
                        }
                    }
                    if (target >= 3 && els.mdTextarea.value.trim().length >= 20) {
                        runAutoFill({ force: false });
                    }
                }
                goToStep(target);
            });
        });

        els.prevStepBtn.addEventListener('click', () => goToStep(currentStep - 1));
        els.nextStepBtn.addEventListener('click', async () => {
            if (!validateStep(currentStep)) return;
            if (currentStep === STEPS.length) {
                await requestPublish();
                return;
            }
            if (currentStep === 2 && els.mdTextarea.value.trim().length >= 20) {
                runAutoFill({ force: false });
            }
            goToStep(currentStep + 1);
        });

        els.headerPublishBtn?.addEventListener('click', async () => {
            if (!validateStep(STEPS.length)) {
                goToStep(STEPS.length);
                return;
            }
            await requestPublish();
        });

        document.querySelectorAll('.md-editor-tab').forEach((tab) => {
            tab.addEventListener('click', () => switchMdTab(tab.getAttribute('data-tab')));
        });

        els.mdTextarea.addEventListener('input', () => {
            updateMdStats();
            if (els.previewPaneWrap.classList.contains('active')) updatePreview();
        });

        els.mdTextarea.addEventListener('focus', () => {
            setTimeout(ensureMdCaretVisible, 280);
        });

        els.mdTextarea.addEventListener('blur', () => {
            if (els.mdTextarea.value.trim().length >= 40) {
                runAutoFill({ force: false });
            }
        });

        document.querySelectorAll('[data-md]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-md');
                if (
                    action !== 'image' &&
                    action !== 'embed' &&
                    action !== 'youtube' &&
                    els.previewPaneWrap?.classList.contains('active')
                ) {
                    switchMdTab('write');
                }
                applyMdAction(action);
                if (action !== 'image' && action !== 'embed' && action !== 'youtube') {
                    setTimeout(ensureMdCaretVisible, 50);
                }
            });
        });

        els.socialEmbedConfirm?.addEventListener('click', confirmSocialEmbed);
        els.socialEmbedUrlInput?.addEventListener('input', updateSocialEmbedHint);
        els.socialEmbedUrlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmSocialEmbed();
            }
        });
        document.getElementById('socialEmbedModal')?.addEventListener('shown.bs.modal', () => {
            els.socialEmbedUrlInput?.focus();
            els.socialEmbedUrlInput?.select();
        });
        document.getElementById('socialEmbedModal')?.addEventListener('hidden.bs.modal', () => {
            socialEmbedInsertRange = null;
            if (els.socialEmbedError) {
                els.socialEmbedError.hidden = true;
                els.socialEmbedError.textContent = '';
            }
            if (els.socialEmbedHint) {
                els.socialEmbedHint.hidden = true;
                els.socialEmbedHint.textContent = '';
            }
        });

        els.publishConfirmBtn?.addEventListener('click', async () => {
            if (els.publishModal) closeModal(els.publishModal);
            await requestPublish();
        });

        els.mdExpandBtn?.addEventListener('click', () => {
            const on = !els.mdEditor?.classList.contains('is-immersive');
            setMdImmersive(on);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && els.mdEditor?.classList.contains('is-immersive')) {
                setMdImmersive(false);
            }
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                if (document.activeElement === els.mdTextarea) ensureMdCaretVisible();
            });
        }

        updateMdStats();

        els.featuredPreviewBtn?.addEventListener('click', () => openImageUrlModal('featured'));

        els.imageUrlAdvancedToggle?.addEventListener('click', () => {
            const open = els.imageUrlAdvancedToggle.getAttribute('aria-expanded') !== 'true';
            setImageUrlAdvancedOpen(open);
        });

        els.imageUrlConfirm?.addEventListener('click', confirmImageUrl);
        els.imageUrlInput?.addEventListener('input', () => {
            const url = String(els.imageUrlInput.value || '').trim();
            if (/^https?:\/\//i.test(url)) {
                setImageAltValue(suggestAltFromUrl(url));
            }
        });
        els.imageUrlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmImageUrl();
            }
        });
        els.imageAltInput?.addEventListener('input', () => {
            imageAltTouched = true;
        });
        document.getElementById('imageUrlModal')?.addEventListener('shown.bs.modal', () => {
            if (els.imageUrlSearchInput && !els.imageUrlSearchInput.disabled) {
                els.imageUrlSearchInput.focus();
                els.imageUrlSearchInput.select();
            } else {
                els.imageUrlInput?.focus();
            }
        });
        document.getElementById('imageUrlModal')?.addEventListener('hidden.bs.modal', () => {
            imageInsertRange = null;
            imageSearchPanel?.reset();
            setImageUrlAdvancedOpen(false);
            imageAltTouched = false;
            if (els.imageUrlError) {
                els.imageUrlError.hidden = true;
                els.imageUrlError.textContent = '';
            }
        });

        els.sourceNameInput.addEventListener('input', () => {
            if (els.previewPaneWrap && els.previewPaneWrap.classList.contains('active')) {
                updatePreview();
            }
        });
        els.sourceUrlInput.addEventListener('input', () => {
            if (els.previewPaneWrap && els.previewPaneWrap.classList.contains('active')) {
                updatePreview();
            }
        });

        els.advancedToggle.addEventListener('click', () => {
            els.advancedFields.classList.toggle('is-open');
            const open = els.advancedFields.classList.contains('is-open');
            els.advancedToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        els.importMdBtn.addEventListener('click', () => {
            resetImportUi();
            openImportFilePicker();
        });

        els.importPickBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            openImportFilePicker();
        });

        els.importChangeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            openImportFilePicker();
        });

        bindImportDropzone();

        els.importFileInput.addEventListener('change', async () => {
            const file = els.importFileInput.files && els.importFileInput.files[0];
            if (!file) return;
            const modalEl = document.getElementById('importMdModal');
            if (modalEl && !modalEl.classList.contains('show')) {
                importModal.show();
            }
            await handleMdFile(file);
        });

        els.importApplyBtn.addEventListener('click', () => {
            if (!pendingImport || pendingImport.body == null) return;
            const dirtyTitle = Boolean(els.titleInput?.value?.trim());
            const dirtyBody = Boolean(els.mdTextarea?.value?.trim());
            if (
                (dirtyTitle || dirtyBody) &&
                !window.confirm(
                    'Isso substitui título, campos e conteúdo atuais pelo arquivo importado. Continuar?'
                )
            ) {
                return;
            }
            startImportSparkle();
            applyImportedArticle(pendingImport.meta || {}, pendingImport.body);
            importModal.hide();
            showFeedback(
                'success',
                'Artigo analisado e campos preenchidos. Escolha uma capa sugerida e publique.'
            );
            goToStep(3);
            stopImportSparkle();
        });

        els.autoFillBannerClose?.addEventListener('click', hideAutoFillBanner);

        els.aiSummaryGenerateBtn?.addEventListener('click', () => {
            generateAiSummary();
        });

        els.articleAudioGenerateBtn?.addEventListener('click', () => {
            generateArticleAudios();
        });

        els.saveDraftBtn.addEventListener('click', async () => await persistMock('draft'));
    }

    function setAiSummaryStatus(message, kind) {
        if (!els.aiSummaryStatus) return;
        const text = String(message || '').trim();
        if (!text) {
            els.aiSummaryStatus.hidden = true;
            els.aiSummaryStatus.textContent = '';
            els.aiSummaryStatus.classList.remove('is-error', 'is-loading');
            return;
        }
        els.aiSummaryStatus.hidden = false;
        els.aiSummaryStatus.textContent = text;
        els.aiSummaryStatus.classList.toggle('is-error', kind === 'error');
        els.aiSummaryStatus.classList.toggle('is-loading', kind === 'loading');
    }

    function setArticleAudioStatus(message, kind) {
        if (!els.articleAudioStatus) return;
        const text = String(message || '').trim();
        els.articleAudioStatus.textContent =
            text || 'Áudio ainda não gerado — Ouvir desabilitado.';
        els.articleAudioStatus.classList.toggle('is-error', kind === 'error');
        els.articleAudioStatus.classList.toggle('is-loading', kind === 'loading');
        els.articleAudioStatus.classList.toggle('is-ready', kind === 'ready');
    }

    function refreshArticleAudioStatus(source) {
        const fromPending = pendingAudioFields;
        const article = source || fromPending;
        const status = String((article && article.audio_status) || '').trim();
        const hasFull = Boolean(article && article.audio_full_url);
        const hasSummary = Boolean(article && article.audio_summary_url);
        if (status === 'ready' && hasFull && hasSummary) {
            setArticleAudioStatus('Áudios prontos (resumo + matéria).', 'ready');
            return;
        }
        if (hasFull || hasSummary) {
            setArticleAudioStatus(
                hasFull && hasSummary
                    ? 'Áudios prontos (resumo + matéria).'
                    : hasFull
                      ? 'Áudio da matéria pronto; resumo ainda falta.'
                      : 'Áudio do resumo pronto; matéria ainda falta.',
                hasFull && hasSummary ? 'ready' : null
            );
            return;
        }
        setArticleAudioStatus('Áudio ainda não gerado — Ouvir desabilitado.', null);
    }

    /**
     * Persiste campos de áudio no artigo existente (ou guarda em pending).
     * @returns {Promise<boolean>} true se gravou no store
     */
    async function persistAudioFields(slug, audioFields) {
        if (!audioFields) return false;
        pendingAudioFields = audioFields;
        const existing = findArticleByIdOrSlug(editingArticleId, slug);
        if (!existing) return false;
        try {
            await upsertArticleRecord({
                ...existing,
                ...audioFields,
                updated_at: new Date().toISOString(),
                _adminEdited: true
            });
            return true;
        } catch (_) {
            return false;
        }
    }

    async function generateArticleAudios() {
        if (!els.articleAudioGenerateBtn) return;
        if (audioPipelineBusy) {
            setArticleAudioStatus('Aguarde a publicação ou geração em andamento.', 'error');
            return;
        }

        const title = String(els.titleInput?.value || '').trim();
        const content = plainTextFromEditorContent();
        const subtitle = String(els.subtitleInput?.value || '').trim();
        if (!title) {
            setArticleAudioStatus('Informe a manchete antes de gerar os áudios.', 'error');
            return;
        }
        if (content.length < 40) {
            setArticleAudioStatus(
                'Escreva um pouco mais no corpo da matéria antes de gerar os áudios.',
                'error'
            );
            return;
        }

        const slug =
            String(els.slugInput?.value || '').trim() ||
            slugify(title) ||
            'rascunho';

        audioPipelineBusy = true;
        const btn = els.articleAudioGenerateBtn;
        const prevLabel = btn.innerHTML;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        if (els.aiSummaryGenerateBtn) els.aiSummaryGenerateBtn.disabled = true;
        setPublishBusy(true, 'Gerando áudios…');

        let summaryAudio = null;
        let fullAudio = null;

        try {
            let summary = String(els.aiSummaryInput?.value || '').trim();
            if (!summary) {
                btn.innerHTML =
                    '<i class="ph ph-spinner" aria-hidden="true"></i><span>Resumo…</span>';
                setArticleAudioStatus('Mary AI gerando resumo para o áudio…', 'loading');
                summary = await fetchAiSummaryForPublish({ slug, title, content });
                if (els.aiSummaryInput) els.aiSummaryInput.value = summary;
            }

            // Alinhado ao publish: falha do resumo não impede tentar o full
            // (Ouvir usa full; ready só com ambos). Servidor reutiliza por identidade.
            btn.innerHTML =
                '<i class="ph ph-spinner" aria-hidden="true"></i><span>Áudio resumo…</span>';
            setArticleAudioStatus('Mary AI gerando áudio do resumo…', 'loading');
            try {
                summaryAudio = await fetchArticleAudioGenerate({
                    slug,
                    kind: 'summary',
                    text: summary
                });
            } catch (err) {
                console.warn('[audio] áudio do resumo opcional falhou:', err);
            }

            btn.innerHTML =
                '<i class="ph ph-spinner" aria-hidden="true"></i><span>Áudio matéria…</span>';
            setArticleAudioStatus('Mary AI gerando áudio da matéria…', 'loading');
            try {
                fullAudio = await fetchArticleAudioGenerate({
                    slug,
                    kind: 'full',
                    title,
                    subtitle,
                    content
                });
            } catch (err) {
                console.warn('[audio] áudio da matéria opcional falhou:', err);
            }

            const audioReady = Boolean(
                summaryAudio &&
                    summaryAudio.url &&
                    summaryAudio.hash &&
                    fullAudio &&
                    fullAudio.url &&
                    fullAudio.hash
            );

            const audioFields = audioReady
                ? {
                      audio_summary_url: summaryAudio.url,
                      audio_full_url: fullAudio.url,
                      audio_summary_hash: summaryAudio.hash,
                      audio_full_hash: fullAudio.hash,
                      audio_generated_at:
                          fullAudio.generated_at || new Date().toISOString(),
                      audio_status: 'ready'
                  }
                : {
                      audio_summary_url: (summaryAudio && summaryAudio.url) || null,
                      audio_full_url: (fullAudio && fullAudio.url) || null,
                      audio_summary_hash: (summaryAudio && summaryAudio.hash) || null,
                      audio_full_hash: (fullAudio && fullAudio.hash) || null,
                      audio_generated_at: null,
                      audio_status: 'missing'
                  };

            const saved = await persistAudioFields(slug, audioFields);
            if (saved) pendingAudioFields = null;

            refreshArticleAudioStatus(audioFields);
            if (audioReady) {
                showFeedback('success', 'Áudios gerados com Mary AI.');
            } else if (summaryAudio || fullAudio) {
                setArticleAudioStatus(
                    'Áudio parcial gerado. Tente novamente para completar.',
                    'error'
                );
            } else {
                setArticleAudioStatus(
                    'Mary AI não conseguiu gerar os áudios agora.',
                    'error'
                );
            }
        } catch (err) {
            if (summaryAudio || fullAudio) {
                const partialFields = {
                    audio_summary_url: (summaryAudio && summaryAudio.url) || null,
                    audio_full_url: (fullAudio && fullAudio.url) || null,
                    audio_summary_hash: (summaryAudio && summaryAudio.hash) || null,
                    audio_full_hash: (fullAudio && fullAudio.hash) || null,
                    audio_generated_at: null,
                    audio_status: 'missing'
                };
                await persistAudioFields(slug, partialFields);
                refreshArticleAudioStatus(partialFields);
            }
            setArticleAudioStatus(
                (err && err.message) || 'Mary AI não conseguiu gerar os áudios agora.',
                'error'
            );
        } finally {
            audioPipelineBusy = false;
            setPublishBusy(false);
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            btn.innerHTML = prevLabel;
            if (els.aiSummaryGenerateBtn) els.aiSummaryGenerateBtn.disabled = false;
        }
    }

    function plainTextFromEditorContent() {
        const markdown = String(els.mdTextarea?.value || '').trim();
        if (!markdown) return '';
        const resolvedMd =
            global.MediaStore && typeof global.MediaStore.resolveMarkdown === 'function'
                ? global.MediaStore.resolveMarkdown(markdown)
                : markdown;
        const html =
            global.MarkdownUtil && typeof global.MarkdownUtil.renderMarkdown === 'function'
                ? global.MarkdownUtil.renderMarkdown(resolvedMd)
                : resolvedMd;
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return String(tmp.textContent || tmp.innerText || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 12000);
    }

    async function adminAuthHeaders() {
        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        };
        try {
            if (global.SUPABASE_READY && global.supabaseClient?.auth?.getSession) {
                const { data } = await global.supabaseClient.auth.getSession();
                const token = data?.session?.access_token;
                if (token) headers.Authorization = `Bearer ${token}`;
            }
        } catch (_) {
            /* ignore — local allowlist cobre o protótipo */
        }
        return headers;
    }

    async function generateAiSummary() {
        if (!els.aiSummaryInput || !els.aiSummaryGenerateBtn) return;

        const title = String(els.titleInput?.value || '').trim();
        const content = plainTextFromEditorContent();
        if (!title) {
            setAiSummaryStatus('Informe a manchete antes de gerar o resumo.', 'error');
            return;
        }
        if (content.length < 40) {
            setAiSummaryStatus('Escreva um pouco mais no corpo da matéria antes de gerar o resumo.', 'error');
            return;
        }

        const slug =
            String(els.slugInput?.value || '').trim() ||
            slugify(title) ||
            'rascunho';

        const btn = els.aiSummaryGenerateBtn;
        const prevLabel = btn.innerHTML;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.innerHTML =
            '<i class="ph ph-spinner" aria-hidden="true"></i><span>Gerando…</span>';
        setAiSummaryStatus('Mary AI gerando resumo…', 'loading');

        try {
            const res = await fetch('/api/ai-summary', {
                method: 'POST',
                headers: await adminAuthHeaders(),
                body: JSON.stringify({
                    slug,
                    title: title.slice(0, 300),
                    content
                })
            });

            let data = null;
            try {
                data = await res.json();
            } catch (_) {
                data = null;
            }

            if (!res.ok) {
                setAiSummaryStatus(
                    (data && data.error) || 'Mary AI não conseguiu gerar o resumo agora.',
                    'error'
                );
                return;
            }

            const summary = String(data && data.summary ? data.summary : '').trim();
            if (!summary) {
                setAiSummaryStatus('Mary AI não conseguiu gerar o resumo agora.', 'error');
                return;
            }

            els.aiSummaryInput.value = summary;
            scheduleSaveFormDraft();
            setAiSummaryStatus('Resumo gerado com Mary AI. Você pode editar antes de publicar.', null);
        } catch (_) {
            setAiSummaryStatus('Mary AI não conseguiu gerar o resumo agora.', 'error');
        } finally {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            btn.innerHTML = prevLabel;
        }
    }

    function populateSelects() {
        global.MockData.categories.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.slug;
            opt.textContent = categoryLabel(c.slug);
            els.catSelect.appendChild(opt);
        });
        global.MockData.authors.forEach((a) => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.name;
            els.authorSelect.appendChild(opt);
        });
    }

    function cacheElements() {
        els.pageTitle = document.getElementById('pageTitle');
        els.saveBadge = document.getElementById('save-badge');
        els.saveBadgeGroup = document.getElementById('save-badge-group');
        els.editorToast = document.getElementById('editorToast');
        els.titleInput = document.getElementById('titleInput');
        els.subtitleInput = document.getElementById('subtitleInput');
        els.slugInput = document.getElementById('slugInput');
        els.catSelect = document.getElementById('catSelect');
        els.authorSelect = document.getElementById('authorSelect');
        els.captionInput = document.getElementById('captionInput');
        els.sourceNameInput = document.getElementById('sourceNameInput');
        els.sourceUrlInput = document.getElementById('sourceUrlInput');
        els.destaqueSwitch = document.getElementById('destaqueSwitch');
        els.seoTitle = document.getElementById('seoTitle');
        els.seoDesc = document.getElementById('seoDesc');
        els.aiSummaryInput = document.getElementById('aiSummaryInput');
        els.aiSummaryGenerateBtn = document.getElementById('aiSummaryGenerateBtn');
        els.aiSummaryStatus = document.getElementById('aiSummaryStatus');
        els.articleAudioGenerateBtn = document.getElementById('articleAudioGenerateBtn');
        els.articleAudioStatus = document.getElementById('articleAudioStatus');
        els.tagsInput = document.getElementById('tagsInput');
        els.dateInput = document.getElementById('dateInput');
        els.mdTextarea = document.getElementById('contentMarkdown');
        els.mdEditor = document.getElementById('mdEditor');
        els.mdExpandBtn = document.getElementById('mdExpandBtn');
        els.mdWordCount = document.getElementById('mdWordCount');
        els.mdCharCount = document.getElementById('mdCharCount');
        els.mdReadTime = document.getElementById('mdReadTime');
        els.previewPane = document.getElementById('previewPane');
        els.previewPaneWrap = document.getElementById('previewPaneWrap');
        els.previewOutro = document.getElementById('previewOutro');
        els.writePane = document.getElementById('writePane');
        els.featuredImg = document.getElementById('featuredImg');
        els.stepBtns = document.querySelectorAll('.article-step-btn');
        els.stepPanels = document.querySelectorAll('.article-step-panel');
        els.prevStepBtn = document.getElementById('prevStepBtn');
        els.nextStepBtn = document.getElementById('nextStepBtn');
        els.stepFooterHint = document.getElementById('stepFooterHint');
        els.autoFillBanner = document.getElementById('autoFillBanner');
        els.autoFillBannerClose = document.getElementById('autoFillBannerClose');
        els.keywordsInput = document.getElementById('keywordsInput');
        els.googleImagesSuggestionsWrap = document.getElementById('googleImagesSuggestionsWrap');
        els.googleImagesSuggestionsGrid = document.getElementById('googleImagesSuggestionsGrid');
        els.googleImagesSuggestionsLoading = document.getElementById('googleImagesSuggestionsLoading');
        els.googleImagesSuggestionsEmpty = document.getElementById('googleImagesSuggestionsEmpty');
        els.summaryReadingTime = document.getElementById('summaryReadingTime');
        els.summaryTags = document.getElementById('summaryTags');
        els.featuredPreviewBtn = document.getElementById('featuredPreviewBtn');
        els.imageUrlInput = document.getElementById('imageUrlInput');
        els.imageAltInput = document.getElementById('imageAltInput');
        els.imageAltWrap = document.getElementById('imageAltWrap');
        els.imageUrlSearchInput = document.getElementById('imageUrlSearchInput');
        els.imageUrlSearchBtn = document.getElementById('imageUrlSearchBtn');
        els.imageUrlSearchGrid = document.getElementById('imageUrlSearchGrid');
        els.imageUrlSearchEmpty = document.getElementById('imageUrlSearchEmpty');
        els.imageUrlSearchLoading = document.getElementById('imageUrlSearchLoading');
        els.imageUrlSearchMore = document.getElementById('imageUrlSearchMore');
        els.imageUrlSearchError = document.getElementById('imageUrlSearchError');
        els.imageUrlSearchMeta = document.getElementById('imageUrlSearchMeta');
        els.imageUrlUnavailable = document.getElementById('imageUrlUnavailable');
        els.imageUrlConfirm = document.getElementById('imageUrlConfirm');
        els.imageUrlError = document.getElementById('imageUrlError');
        els.imageUrlTitle = document.getElementById('imageUrlTitle');
        els.imageUrlLead = document.getElementById('imageUrlLead');
        els.imageUrlAdvancedToggle = document.getElementById('imageUrlAdvancedToggle');
        els.imageUrlAdvancedFields = document.getElementById('imageUrlAdvancedFields');
        els.advancedToggle = document.getElementById('advancedToggle');
        els.advancedFields = document.getElementById('advancedFields');
        els.importMdBtn = document.getElementById('importMdBtn');
        els.importPickBtn = document.getElementById('importPickBtn');
        els.importChangeBtn = document.getElementById('importChangeBtn');
        els.importDropzone = document.getElementById('importDropzone');
        els.importDropzoneIdle = document.getElementById('importDropzoneIdle');
        els.importLoading = document.getElementById('importLoading');
        els.importFileChip = document.getElementById('importFileChip');
        els.importFileName = document.getElementById('importFileName');
        els.importFileMeta = document.getElementById('importFileMeta');
        els.importFileInput = document.getElementById('importFileInput');
        els.importPreview = document.getElementById('importPreview');
        els.importPreviewBody = document.getElementById('importPreviewBody');
        els.importPreviewOutro = document.getElementById('importPreviewOutro');
        els.importMetaList = document.getElementById('importMetaList');
        els.importError = document.getElementById('importError');
        els.importApplyBtn = document.getElementById('importApplyBtn');
        els.saveDraftBtn = document.getElementById('saveDraftBtn');
        els.headerPublishBtn = document.getElementById('headerPublishBtn');
        els.publishConfirmBtn = document.getElementById('publishConfirmBtn');
        els.publishModal = document.getElementById('publishModal');
        els.socialEmbedUrlInput = document.getElementById('socialEmbedUrlInput');
        els.socialEmbedConfirm = document.getElementById('socialEmbedConfirm');
        els.socialEmbedError = document.getElementById('socialEmbedError');
        els.socialEmbedHint = document.getElementById('socialEmbedHint');
        els.summaryTitle = document.getElementById('summaryTitle');
        els.summaryCategory = document.getElementById('summaryCategory');
        els.summaryAuthor = document.getElementById('summaryAuthor');
        els.summaryWords = document.getElementById('summaryWords');
        els.summaryStatus = document.getElementById('summaryStatus');
        els.serpPreviewTitle = document.getElementById('serpPreviewTitle');
        els.serpPreviewDesc = document.getElementById('serpPreviewDesc');
        els.serpPreviewUrl = document.getElementById('serpPreviewUrl');
    }

    function init() {

        // Suspende autosave durante todo o bootstrap — evita persistir draft vazio
        // agendado por updateFeaturedPreview/populateSelects (categoria default).
        formDraftSuspended = true;
        if (formDraftTimer) {
            clearTimeout(formDraftTimer);
            formDraftTimer = null;
        }

        cacheElements();
        featuredImage = global.MockData.PLACEHOLDER_IMG;
        updateFeaturedPreview();
        populateSelects();
        bindEvents();

        if (els.dateInput && !els.dateInput.value) {
            els.dateInput.value = new Date().toISOString().slice(0, 10);
        }
        if (els.authorSelect && els.authorSelect.options.length && !els.authorSelect.value) {
            els.authorSelect.value = els.authorSelect.options[0].value;
        }

        importModal = new bootstrap.Modal(document.getElementById('importMdModal'));
        socialEmbedModal = new bootstrap.Modal(document.getElementById('socialEmbedModal'));
        imageUrlModal = new bootstrap.Modal(document.getElementById('imageUrlModal'));

        if (global.GoogleImagesSearch?.attachPanel) {
            imageSearchPanel = global.GoogleImagesSearch.attachPanel({
                input: els.imageUrlSearchInput,
                searchBtn: els.imageUrlSearchBtn,
                grid: els.imageUrlSearchGrid,
                empty: els.imageUrlSearchEmpty,
                loading: els.imageUrlSearchLoading,
                more: els.imageUrlSearchMore,
                error: els.imageUrlSearchError,
                unavailable: els.imageUrlUnavailable,
                meta: els.imageUrlSearchMeta,
                getContext: getImageSearchContext,
                onPick: (photo) => applyGoogleImage(photo, { purpose: imageUrlMode })
            });
        }

        bindFormDraftAutosave();

        const params = new URLSearchParams(window.location.search);
        const editSlug = params.get('slug');

        try {
            if (editSlug) {
                ensureEditFormLoaded(editSlug);
                const stepped = restoreEditWizardStep(editSlug);
                compactEditorMediaUrls();
                if (!stepped) {
                    goToStep(1);
                }
                bindEditFormRescue();
            } else {
                const restored = tryRestoreFormDraft();
                compactEditorMediaUrls();
                if (!restored) {
                    goToStep(1);
                }
            }
        } finally {
            formDraftSuspended = false;
        }

        seedFormDraftFromDom();
        updateSerpPreview();
    }

    global.ArticleEditor = {
        init,
        clearFormDraft,
        saveFormDraftNow
    };
})(window);
