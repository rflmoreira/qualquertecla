# Brand assets — Qualquer Tecla

## Master tipográfico (em uso no chrome)

O chrome do site e do Admin usa **wordmark tipográfico runtime** (Bricolage Grotesque 800, tracking via `--font-brand-tracking`), não `<img>` genérica de logo. Isso é a identidade aprovada final.

## Arquivos canônicos

| Arquivo | Papel |
|---------|--------|
| `qt-keycap-fallback.png` | Fallback raster da tecla (referência canônica e master visual da marca) |
| `qt-keycap-top.png` | Textura da tecla extraída diretamente de `qt-keycap-fallback.png` (compartilha o mesmo frame 1254×1254) |
| `qt-keycap-plate.png` | Soleira recortada de `qt-keycap-fallback.png` (furo transparente no lugar da tecla); billboard fixo do canvas 3D |
| `alt42-wordmark.png` | Marca alt42 (estilo IBM 8-bar óptico, minúsculas, fundo branco) — tema claro |
| `alt42-wordmark-inverse.png` | Variante invertida (barras brancas mais finas, fundo preto) |

Regenerar alt42: `node scripts/generate-alt42-png.mjs`

## Arquivo `_archive/`

A pasta `_archive` contendo rascunhos de antigas direções criativas foi removida para limpar a árvore de diretórios.
