# Áudio na publicação (Gemini Leda)

Na publicação e no botão **Gerar áudios** do Admin, o portal **tenta** em sequência:

1. Resumo por IA (`POST /api/ai-summary`, Groq) — opcional; se falhar, mantém o texto do campo
2. Áudio do resumo (Gemini TTS, voz **Leda**, PT-BR) — opcional
3. Áudio da leitura completa (Gemini TTS, voz **Leda**, PT-BR) — opcional

A matéria **publica mesmo se o áudio falhar**. Nesse caso `audio_status` fica `missing` e o botão **Ouvir** / a oferta de áudio na Mary ficam **desabilitados** (sem fallback de TTS no navegador).

Só marca `audio_status: 'ready'` quando resumo **e** leitura completa forem gerados com sucesso.
Rascunho, edição e visualização **não** disparam geração de áudio.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `GEMINI_API_KEY` | Chave única (retrocompatível) — síntese TTS, modelo `gemini-3.8-flash-tts`, voz Leda |
| `GEMINI_API_KEY_1` … `GEMINI_API_KEY_6` | Múltiplas chaves com rotação automática (prioritário sobre `GEMINI_API_KEY`) |
| `GEMINI_API_KEYS` | Alternativa CSV: `"key1,key2,key3"` (prioritário sobre `GEMINI_API_KEY`, usado se `_1…_6` não estiverem definidas) |
| `GROQ_API_KEY` | Resumo por IA na publicação |

**Rotação de chaves:** quando mais de uma chave está configurada, o sistema alterna automaticamente entre elas. Chaves que falham por quota/rate-limit entram em cooldown temporário; chaves inválidas (401/403) são desativadas até restart. Logs identificam chaves por índice (`key-1`, `key-2`, …) sem revelar valores.

Local: arquivo `.env` na raiz (já bloqueado por redirects; `scripts/serve.mjs` carrega automaticamente).
Produção: painel Netlify → Environment variables (mesmo nomes). **Não** versionar as chaves.

## Endpoints

| Rota | Quem | Função |
|---|---|---|
| `POST /api/article-audio/generate` | Admin (auth + same-site) | Gera e armazena WAV (`kind=summary\|full`) |
| `GET /api/article-audio?slug=&kind=&v=` | Público | Entrega WAV pré-gerado (nunca gera) |

## Armazenamento

- Local: `.cache/article-audio/`
- Netlify: Blobs (`@netlify/blobs`, store `article-audio`)
- Campos no artigo: `audio_summary_url`, `audio_full_url`, `audio_*_hash`, `audio_generated_at`, `audio_status`

Migração SQL preparada (não executada): [db/articles_audio.sql](../db/articles_audio.sql).

## Página pública

Botão **Ouvir** em `.article-meta-actions` ([assets/js/article-listen.js](../assets/js/article-listen.js)):

1. Usa `audio_full_url` quando o arquivo existir
2. Se o arquivo faltar, Ouvir e os controles de reprodução ficam desabilitados
3. Sem áudio, **não** há TTS nativo do navegador e **não** chama `/generate`

A Mary usa `audio_summary_url` no chip Ouvir do resumo; sem URL válida, informa que não consegue enviar áudio.

## Idempotência e rotação

- `POST /api/article-audio/generate` reutiliza o WAV se a **identidade de áudio** (texto + voz + modelo + estilo + sample rate) já existir e o arquivo estiver íntegro (não chama Gemini de novo).
- Hash legado (só texto) ainda é aceito para reuso quando a config atual é Leda + `gemini-3.8-flash-tts` (não invalida o acervo de uma vez). Trocar voz ou modelo gera hash novo e força nova síntese.
- Gerações do mesmo `slug` são serializadas **no mesmo isolate** (`withArticleAudioSlugLock`).
- Entre isolates Netlify: lease atômico via Blobs `onlyIfNew` (local: `open wx`) no par `slug+kind+hash`; se o lease estiver ocupado, a request espera o WAV ou responde 409 — **não** há lock distribuído global além disso.
- Rate-limit transitório (`ALL_COOLING`) é distinto de cota diária (`QUOTA`).
- Chaves Gemini: ver `.env.example` (`GEMINI_API_KEY_1`…`6`). Logs usam só `key-N`.

## Exemplos do MockData

Gera **uma notícia por vez** (nunca várias em paralelo), em duas fases:

1. Áudio do resumo — confirma sucesso
2. Áudio do texto completo da notícia — só depois da fase 1

```bash
# Próxima pendente (só uma)
node scripts/generate-example-audio.mjs

# Uma específica
node scripts/generate-example-audio.mjs --slug=cosplay-brasil-industria-criativa

# Todas em sequência (ainda uma após a outra; para no primeiro QUOTA)
node scripts/generate-example-audio.mjs --all
```

- Reaproveita WAV já existentes em `assets/audio/articles/<slug>/`
- Em `FALHA: QUOTA` (HTTP 429), a execução **para** nessa notícia; aguarde o reset e rode de novo
- Free tier do Gemini TTS: cota típica de **~10 requisições/dia por modelo** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Cada pedaço de texto (~1400 chars) = 1 requisição — não é limite de caracteres do artigo
- Modelo TTS: `gemini-3.8-flash-tts`, voz Leda; tom em `speech_metadata.style` (`engaging, natural, lively, articulate editorial tone`)
- Prioriza matérias que já têm `summary.wav` e faltam `full.wav`

