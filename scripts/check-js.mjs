#!/usr/bin/env node

/**
 * Verifica sintaxe de todos os arquivos JS/MJS do projeto.
 * Substitui a cadeia longa de `node --check` que existia no package.json.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const files = [
  'assets/js/api.js',
  'assets/js/main.js',
  'assets/js/mary.js',
  'assets/js/article-listen.js',
  'assets/js/public-skeleton.js',
  'assets/js/layout.js',
  'assets/js/simple-scrollbar-init.js',
  'assets/js/consent.js',
  'assets/js/pwa-install.js',
  'sw.js',
  'assets/js/admin/login-background.js',
  'assets/js/admin/article-editor.js',
  'netlify/functions/noticia-seo.mjs',
  'netlify/functions/categoria-seo.mjs',
  'netlify/functions/ai-summary.mjs',
  'netlify/functions/article-audio.mjs',
  'netlify/functions/unsplash-background.mjs',
  'scripts/admin-auth.mjs',
  'scripts/seo/articles-meta.mjs',
  'scripts/seo/categories-meta.mjs',
  'scripts/seo/inject-categoria-html.mjs',
  'scripts/seo/generate-sitemap.mjs',
  'scripts/google-images-api.mjs',
  'scripts/ai-summary-api.mjs',
  'scripts/article-audio-api.mjs',
  'scripts/article-audio/script-builder.mjs',
  'scripts/article-audio/gemini-tts.mjs',
  'scripts/article-audio/key-manager.mjs',
  'scripts/article-audio/storage.mjs',
  'scripts/test/article-audio-keys.mjs',
  'scripts/unsplash-background.mjs',
  'scripts/unsplash-background-api.mjs',
];

let failed = 0;

for (const file of files) {
  if (!existsSync(file)) {
    console.error(`⚠  Arquivo não encontrado: ${file}`);
    failed++;
    continue;
  }
  try {
    execSync(`node --check ${file}`, { stdio: 'pipe' });
    console.log(`✓  ${file}`);
  } catch (err) {
    console.error(`✗  ${file}`);
    console.error(err.stderr?.toString() || err.message);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} arquivo(s) com erro.`);
  process.exit(1);
} else {
  console.log(`\n✓ Todos os ${files.length} arquivos verificados com sucesso.`);
}
