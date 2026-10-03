/**
 * Monta o roteiro de narração e hash do texto a sintetizar.
 */
import { createHash } from 'node:crypto';

const MAX_FULL_CHARS = 48_000;
const MAX_SUMMARY_CHARS = 8_000;

export function stripToPlainText(raw) {
    let text = String(raw || '');
    if (Array.isArray(raw)) {
        text = raw
            .map((block) => {
                if (typeof block === 'string') return block;
                if (block && typeof block.html === 'string') return block.html;
                if (block && typeof block.content === 'string') return block.content;
                return '';
            })
            .join('\n\n');
    }
    return text
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, ' ')
        .replace(/<(blockquote|figure|iframe|video|audio|svg)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

export function hashScript(text) {
    return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

export function buildSummaryScript(summary) {
    const text = stripToPlainText(summary).slice(0, MAX_SUMMARY_CHARS);
    return {
        text,
        hash: hashScript(`summary|${text}`)
    };
}

/**
 * @param {{ title?: string, subtitle?: string, content?: string|array }} article
 */
export function buildFullScript(article = {}) {
    const title = stripToPlainText(article.title || '');
    const subtitle = stripToPlainText(article.subtitle || '');
    const body = stripToPlainText(article.content || '');
    const parts = [];
    if (title) parts.push(title);
    if (subtitle) parts.push(subtitle);
    if (body) parts.push(body);
    const text = parts.join('\n\n').slice(0, MAX_FULL_CHARS);
    return {
        text,
        hash: hashScript(`full|${text}`)
    };
}

export function splitForTts(text, maxChars = 2200) {
    const max = Math.max(200, Number(maxChars) || 2200);
    const source = String(text || '').trim();
    if (!source) return [];
    if (source.length <= max) return [source];

    const chunks = [];
    const paragraphs = source.split(/\n{2,}/);

    const pushWords = (sentence) => {
        let current = '';
        for (const word of sentence.split(/\s+/).filter(Boolean)) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length > max && current) {
                chunks.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) chunks.push(current);
    };

    let current = '';
    for (const raw of paragraphs) {
        const paragraph = raw.replace(/\s+/g, ' ').trim();
        if (!paragraph) continue;
        const sentences = paragraph.match(/[^.!?…]+(?:[.!?…]+["'”’)]*|$)/g) || [paragraph];
        for (const item of sentences) {
            const sentence = item.trim();
            if (!sentence) continue;
            if (sentence.length > max) {
                if (current) {
                    chunks.push(current);
                    current = '';
                }
                pushWords(sentence);
                continue;
            }
            const candidate = current ? `${current} ${sentence}` : sentence;
            if (candidate.length > max && current) {
                chunks.push(current);
                current = sentence;
            } else {
                current = candidate;
            }
        }
        if (current && current.length >= Math.floor(max * 0.7)) {
            chunks.push(current);
            current = '';
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

export { MAX_FULL_CHARS, MAX_SUMMARY_CHARS };
