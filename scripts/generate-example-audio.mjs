/**
 * Gera áudio das matérias de exemplo — UMA notícia por vez, em duas fases.
 *
 * Fase 1: áudio do resumo (concluir e confirmar antes da fase 2)
 * Fase 2: áudio da leitura completa do texto da notícia
 *
 * Uso:
 *   node scripts/generate-example-audio.mjs              # próxima pendente (só uma)
 *   node scripts/generate-example-audio.mjs --slug=SLUG  # uma específica
 *   node scripts/generate-example-audio.mjs --all        # todas, sequencial (nunca paralelo)
 *
 * Requer: GEMINI_API_KEY no .env
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMockData, clearMockDataCache } from './seo/load-mock-data.mjs';
import { buildFullScript, buildSummaryScript } from './article-audio/script-builder.mjs';
import { isGeminiTtsConfigured, synthesizeToWav } from './article-audio/gemini-tts.mjs';
import { putArticleAudio } from './article-audio/storage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_PATH = path.join(ROOT, 'assets/js/data/mock-data.js');
const ASSETS_ROOT = path.join(ROOT, 'assets/audio/articles');

function loadEnv() {
    const envFile = path.join(ROOT, '.env');
    try {
        const text = fs.readFileSync(envFile, 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (!m) continue;
            const k = m[1];
            let v = m[2].replace(/^['"]|['"]$/g, '');
            if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
        }
    } catch (_) {
        /* ignore */
    }
}

function parseArgs(argv) {
    const out = { all: false, slug: '' };
    for (const arg of argv) {
        if (arg === '--all') out.all = true;
        else if (arg.startsWith('--slug=')) out.slug = arg.slice('--slug='.length).trim();
    }
    return out;
}

function audioBlock(slug, summaryHash, fullHash, generatedAt) {
    const summaryUrl = `assets/audio/articles/${slug}/summary.wav`;
    const fullUrl = `assets/audio/articles/${slug}/full.wav`;
    return [
        `            audio_summary_url: '${summaryUrl}',`,
        `            audio_full_url: '${fullUrl}',`,
        `            audio_summary_hash: '${summaryHash}',`,
        `            audio_full_hash: '${fullHash}',`,
        `            audio_generated_at: '${generatedAt}',`,
        `            audio_status: 'ready',`
    ].join('\n');
}

function patchMockData(source, slug, fields) {
    const slugNeedle = `slug: '${slug}'`;
    const slugIdx = source.indexOf(slugNeedle);
    if (slugIdx < 0) {
        throw new Error(`slug não encontrado em mock-data.js: ${slug}`);
    }

    const afterSlug = source.slice(slugIdx);
    const nextIdRel = afterSlug.slice(slugNeedle.length).search(/\n\s*\{\s*\n\s*id:\s*'/);
    const articleEnd =
        nextIdRel >= 0 ? slugIdx + slugNeedle.length + nextIdRel : source.length;
    let articleChunk = source.slice(slugIdx, articleEnd);

    articleChunk = articleChunk.replace(
        /\n\s*audio_(?:summary_url|full_url|summary_hash|full_hash|generated_at|status):\s*'[^']*',?/g,
        ''
    );

    const block = audioBlock(
        slug,
        fields.audio_summary_hash,
        fields.audio_full_hash,
        fields.audio_generated_at
    );

    const aiKey = articleChunk.indexOf('ai_summary:');
    if (aiKey < 0) {
        if (!/status:\s*'published'/.test(articleChunk)) {
            throw new Error(`ai_summary/status não encontrados para ${slug}`);
        }
        articleChunk = articleChunk.replace(
            /(status:\s*'published',)/,
            `$1\n${block}`
        );
    } else {
        let i = aiKey + 'ai_summary:'.length;
        while (i < articleChunk.length && /\s/.test(articleChunk[i])) i += 1;
        if (articleChunk[i] !== "'") {
            throw new Error(`ai_summary sem string simples para ${slug}`);
        }
        i += 1;
        while (i < articleChunk.length) {
            if (articleChunk[i] === '\\') {
                i += 2;
                continue;
            }
            if (articleChunk[i] === "'") {
                i += 1;
                break;
            }
            i += 1;
        }
        while (i < articleChunk.length && articleChunk[i] !== '\n') i += 1;
        articleChunk =
            articleChunk.slice(0, i) + '\n' + block + articleChunk.slice(i);
    }

    return source.slice(0, slugIdx) + articleChunk + source.slice(articleEnd);
}

function assetPath(slug, kind) {
    return path.join(ASSETS_ROOT, slug, `${kind}.wav`);
}

async function writeAsset(slug, kind, wav) {
    const dir = path.join(ASSETS_ROOT, slug);
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${kind}.wav`);
    await fs.promises.writeFile(file, wav);
    return file;
}

async function readExistingWav(slug, kind) {
    const file = assetPath(slug, kind);
    try {
        const buf = await fs.promises.readFile(file);
        if (buf.length > 1000 && buf.slice(0, 4).toString() === 'RIFF') return buf;
    } catch (_) {
        /* missing */
    }
    return null;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function isArticleComplete(slug) {
    return Boolean(
        fs.existsSync(assetPath(slug, 'summary')) && fs.existsSync(assetPath(slug, 'full'))
    );
}

/**
 * Fase 1 — áudio do resumo. Só retorna após sucesso confirmado.
 */
async function phase1Summary(article) {
    const slug = article.slug;
    const summaryScript = buildSummaryScript(article.ai_summary || '');
    if (!summaryScript.text || summaryScript.text.length < 8) {
        throw new Error('ai_summary insuficiente');
    }

    console.info(`[fase1] ${slug} — áudio do resumo (${summaryScript.text.length} chars)`);

    let summaryWav = await readExistingWav(slug, 'summary');
    if (summaryWav) {
        console.info(`[fase1] ${slug} — summary.wav já existe (${summaryWav.length} B), confirmado`);
    } else {
        console.info(`[fase1] ${slug} — sintetizando resumo com Leda…`);
        summaryWav = await synthesizeToWav(summaryScript.text);
        await writeAsset(slug, 'summary', summaryWav);
        console.info(`[fase1] ${slug} — summary.wav gravado (${summaryWav.length} B)`);
    }

    if (!summaryWav || summaryWav.length < 1000 || summaryWav.slice(0, 4).toString() !== 'RIFF') {
        throw new Error('Fase 1 falhou: WAV do resumo inválido');
    }

    await putArticleAudio(slug, 'summary', {
        hash: summaryScript.hash,
        wav: summaryWav
    });

    console.info(`[fase1] ${slug} — CONCLUÍDA com sucesso`);
    return { summaryWav, summaryHash: summaryScript.hash };
}

/**
 * Fase 2 — áudio da leitura completa do texto da notícia.
 * Só deve ser chamada após a fase 1 confirmada.
 */
async function phase2Full(article) {
    const slug = article.slug;
    const fullScript = buildFullScript({
        title: article.title,
        subtitle: article.subtitle,
        content: article.content
    });
    if (!fullScript.text || fullScript.text.length < 8) {
        throw new Error('conteúdo insuficiente para full');
    }

    console.info(`[fase2] ${slug} — áudio do texto completo (${fullScript.text.length} chars)`);

    let fullWav = await readExistingWav(slug, 'full');
    if (fullWav) {
        console.info(`[fase2] ${slug} — full.wav já existe (${fullWav.length} B), confirmado`);
    } else {
        console.info(`[fase2] ${slug} — sintetizando texto da notícia com Leda…`);
        fullWav = await synthesizeToWav(fullScript.text);
        await writeAsset(slug, 'full', fullWav);
        console.info(`[fase2] ${slug} — full.wav gravado (${fullWav.length} B)`);
    }

    if (!fullWav || fullWav.length < 1000 || fullWav.slice(0, 4).toString() !== 'RIFF') {
        throw new Error('Fase 2 falhou: WAV do texto inválido');
    }

    await putArticleAudio(slug, 'full', {
        hash: fullScript.hash,
        wav: fullWav
    });

    console.info(`[fase2] ${slug} — CONCLUÍDA com sucesso`);
    return { fullWav, fullHash: fullScript.hash };
}

/**
 * Processa UMA notícia: fase 1 → confirmar → fase 2 → aplicar mock-data.
 * Nunca inicia outra notícia em paralelo.
 */
async function processOneArticle(article) {
    const slug = String(article.slug || '').trim();
    if (!slug) throw new Error('Artigo sem slug');

    console.info(`\n========== NOTÍCIA: ${slug} ==========`);

    const { summaryWav, summaryHash } = await phase1Summary(article);

    console.info(`[gate] ${slug} — fase 1 ok; pausa antes da fase 2…`);
    await sleep(10_000);

    const { fullWav, fullHash } = await phase2Full(article);

    const generatedAt = new Date().toISOString();
    const fields = {
        slug,
        audio_summary_url: `assets/audio/articles/${slug}/summary.wav`,
        audio_full_url: `assets/audio/articles/${slug}/full.wav`,
        audio_summary_hash: summaryHash,
        audio_full_hash: fullHash,
        audio_generated_at: generatedAt,
        audio_status: 'ready',
        summaryBytes: summaryWav.length,
        fullBytes: fullWav.length
    };

    let mockSource = fs.readFileSync(MOCK_PATH, 'utf8');
    mockSource = patchMockData(mockSource, slug, fields);
    fs.writeFileSync(MOCK_PATH, mockSource, 'utf8');

    console.info(
        `[done] ${slug} — resumo ${fields.summaryBytes} B + texto ${fields.fullBytes} B; mock-data atualizado`
    );
    console.info(`========== FIM: ${slug} ==========\n`);
    return fields;
}

function pickNextPending(articles) {
    const sorted = [...articles].sort((a, b) => {
        const la = buildFullScript(a).text.length;
        const lb = buildFullScript(b).text.length;
        return la - lb;
    });
    // Prioriza quem já tem fase 1 (summary) e falta fase 2 — menos cota.
    const needsPhase2 = sorted.find(
        (a) => readExistingWavSync(a.slug, 'summary') && !readExistingWavSync(a.slug, 'full')
    );
    if (needsPhase2) return needsPhase2;
    return sorted.find((a) => !isArticleComplete(a.slug)) || null;
}

function readExistingWavSync(slug, kind) {
    const file = assetPath(slug, kind);
    try {
        const st = fs.statSync(file);
        return st.isFile() && st.size > 1000;
    } catch (_) {
        return false;
    }
}

async function main() {
    loadEnv();
    if (!isGeminiTtsConfigured()) {
        console.error('Defina GEMINI_API_KEY (ou GEMINI_API_KEY_1…6) no .env');
        process.exit(1);
    }

    const args = parseArgs(process.argv.slice(2));
    clearMockDataCache();
    const MD = loadMockData();
    const articles = MD.publishedArticles();

    /** @type {typeof articles} */
    let queue = [];

    if (args.slug) {
        const hit = articles.find((a) => a.slug === args.slug);
        if (!hit) {
            console.error(`Slug não encontrado: ${args.slug}`);
            process.exit(1);
        }
        queue = [hit];
    } else if (args.all) {
        queue = [...articles].sort(
            (a, b) => buildFullScript(a).text.length - buildFullScript(b).text.length
        );
        console.info(
            `[audio] modo --all: ${queue.length} notícias em sequência (nunca em paralelo)`
        );
    } else {
        const next = pickNextPending(articles);
        if (!next) {
            console.info('[audio] todas as notícias de exemplo já têm summary.wav + full.wav');
            process.exit(0);
        }
        queue = [next];
        console.info(`[audio] modo padrão: UMA notícia — ${next.slug}`);
    }

    let okCount = 0;
    for (const article of queue) {
        try {
            await processOneArticle(article);
            okCount += 1;
            if (queue.length > 1) {
                console.info('[audio] pausa entre notícias…');
                await sleep(15_000);
            }
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            console.error(`[audio] ${article.slug} — FALHA: ${msg}`);
            if (err && err.detail) console.error(`[audio] detalhe: ${err.detail}`);
            if (msg === 'QUOTA') {
                console.error(
                    '[audio] Cota Gemini esgotada. Pare e retome depois com: node scripts/generate-example-audio.mjs'
                );
            }
            process.exitCode = 1;
            // Uma falha encerra: não inicia a próxima notícia.
            break;
        }
    }

    console.info(`[audio] finalizado: ${okCount}/${queue.length} notícia(s) nesta execução`);
}

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
