# Qualquer Tecla

Portal editorial independente sobre tecnologia, inteligência artificial, games, ciência, cultura geek, cultura digital e música.

**Site:** [qualquertecla.com.br](https://qualquertecla.com.br)

> Para a próxima novidade, pressione Qualquer Tecla.

## Stack

- Front-end estático: HTML, CSS e JavaScript
- Bootstrap 5 e tipografia via Google Fonts
- Deploy e serverless: [Netlify](https://www.netlify.com/) (`netlify.toml` + Functions)
- Dados locais via MockData; integração opcional com Supabase (desligada por padrão)

## Funcionalidades

- Páginas públicas: home, categoria, notícia, busca, contato e políticas
- Painel admin para gestão de notícias, autores, categorias e configurações
- Áudio de artigos (Mary AI) com síntese via Gemini TTS
- PWA (`manifest.webmanifest`, `sw.js`)
- SEO: meta tags, JSON-LD, sitemap e functions de prerender

## Como rodar localmente

Requisitos: Node.js 20+

```bash
npm install
npm run serve
```

Scripts úteis:

| Comando | Descrição |
| --- | --- |
| `npm run serve` | Servidor local de desenvolvimento |
| `npm run check:js` | Checagem de sintaxe dos arquivos JS |
| `npm test` | Smoke tests |
| `npm run sitemap` | Gera/atualiza o `sitemap.xml` |

## Variáveis de ambiente

1. Copie o exemplo para a raiz:

```bash
cp .env.example .env
```

2. Preencha as chaves necessárias (nunca versionar o `.env`):

- `GEMINI_API_KEY_1` … `GEMINI_API_KEY_6` — TTS / áudio de artigos
- `GROQ_API_KEY` — resumo por IA na publicação

Em produção, configure as mesmas variáveis no painel do Netlify (Environment variables).

## Estrutura

```text
.
├── admin/                 # Painel administrativo
├── assets/                # CSS, JS, imagens, áudio e vendor
├── docs/                  # Documentação de features (Mary, áudio)
├── netlify/functions/     # Functions serverless
├── scripts/               # Utilitários (serve, SEO, áudio, testes)
├── index.html             # Home
├── noticia.html           # Página de artigo
├── netlify.toml           # Build, headers e redirects
└── sw.js                  # Service worker (PWA)
```

## Deploy

O projeto é publicado na Netlify com `publish = "."` e functions em `netlify/functions`. Headers de segurança, cache de assets e rewrites de API estão definidos em `netlify.toml`.

## Licença

Projeto privado / uso do Qualquer Tecla. Todos os direitos reservados.
