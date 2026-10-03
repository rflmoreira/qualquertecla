# Mary — assistente de IA

A Mary é o assistente flutuante das páginas de notícia. O Orb
(`assets/video/orb-animation.mp4`) é o avatar e o botão de entrada; o chat
controla os fluxos conversacionais.

## Onde está

| Peça | Arquivo |
|---|---|
| Módulo | [assets/js/mary.js](../assets/js/mary.js) |
| Estilos | seção `.mary-*` em [assets/css/style.css](../assets/css/style.css) |
| Montagem | [assets/js/main.js](../assets/js/main.js) chama `Mary.mount` após carregar o artigo |

Só monta quando `article.ai_summary` existe e não está vazio.

## Fluxo inicial

1. Orb flutuante no canto inferior esquerdo.
2. Ao abrir, saudação com typewriter.
3. Chip **Resumir notícia**.
4. Confirmação → **Ler resumo** → card do resumo (mesmo typewriter).
5. Oferta de leitura → **Ouvir**: usa `audio_summary_url` gerado na publicação;
   se indisponível, a oferta fica desabilitada e a Mary informa que não consegue enviar áudio.

Novas ações entram no `ActionRegistry` dentro de `mary.js`, sem reescrever o motor.

## Typewriter

Cadência herdada do antigo bloco de resumo: `maxDuration` 4500 ms, `baseStep` 28 ms,
caret `.mary-caret-blink`, cancelamento por token, e texto completo sob
`prefers-reduced-motion`.

## Áudio

A geração de áudio (Gemini Leda) é **tentada** na publicação no Admin; se falhar, a matéria publica com `audio_status: 'missing'` e o Ouvir fica desabilitado.
Detalhes: [article-audio.md](./article-audio.md).
