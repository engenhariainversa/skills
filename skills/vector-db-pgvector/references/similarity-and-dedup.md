# Similaridade: o que embedar, que limiar usar, como evitar duplicatas

Leia antes de escolher o texto que vira vetor ou o limiar de "parecido demais".

## O texto importa mais que o modelo

Uma medição real (modelo `paraphrase-multilingual-MiniLM-L12-v2`, 384 dim, perguntas curtas em pt-BR e en) mostrou:

- **Texto repetido em todos os itens puxa tudo para perto de 1.0.** Com cabeçalho + pergunta + "Opções: Sim | Não" no texto, perguntas de sentido oposto ("Adicionar testes?" × "Pular os testes?") deram cosseno **0.974**, acima de paráfrases verdadeiras (0.86–0.90). Tirar cabeçalho e opções do texto embedado resolveu a maior parte.
- **Paráfrases no mesmo idioma podem cair bem baixo** (0.56–0.66 em alguns pares), enquanto near-misses curtos ficam em 0.95+. Não existe um limiar que separe tudo.
- **Normalize igual nas duas pontas**: minúsculas, espaços colapsados, pontuação final removida. A mesma função (`embedText`) gera o texto para gravar e para consultar.

Regra prática: embede o que *distingue* um item (nome, características), não o formulário em volta. Campos categóricos (raridade, tipo, cor) filtre no `WHERE`, não no vetor.

## Calibrar o limiar

1. Monte uns 30 pares rotulados à mão: "é o mesmo" / "não pode casar" / "não tem nada a ver", incluindo os casos traiçoeiros (mesma estrutura, sentido diferente).
2. Rode os pares contra o serviço real (`POST /embed`) e calcule o cosseno. Guarde a tabela no spec do projeto.
3. Escolha o limiar pelo custo do erro:
   - **Sugerir/pré-preencher algo** (erro = ação errada): precision-first, limiar alto (0.98 no caso medido: pega repetições quase literais, abre mão de paráfrases).
   - **Bloquear duplicata na geração** (erro = rejeitar algo original, que custa só uma nova tentativa): pode ser mais baixo; rejeitar a mais é barato.
4. Deixe o limiar numa env (`SIMILARITY_THRESHOLD`) para ajustar sem deploy de código.

## Evitar duplicatas em conteúdo gerado por agente (ex.: itens colecionáveis)

Fluxo que funciona com o repositório de `assets/src`:

```
agente gera candidato ─▶ embedText(candidato) ─▶ embed ─▶ nearest(k=5, mesmo embed_model)
        ▲                                                         │
        └── regenera com feedback ◀── similarity ≥ limiar? ──sim──┘
                                           │não
                                           ▼
                              INSERT + setEmbedding (mesma transação lógica)
```

- **Devolva ao agente os vizinhos**, não só "rejeitado": "parecido demais com X (0.95): mude cor, acessório, tema". Isso converge em 1–2 tentativas em vez de loop cego.
- **Limite de tentativas** (ex.: 3) e depois falhe alto; nunca grave duplicata silenciosamente.
- **Checagem barata antes do vetor**: nome normalizado com índice único pega a duplicata óbvia sem chamar o serviço.
- **Corrida entre dois geradores**: dois candidatos parecidos podem passar juntos. Se importa, serialize a geração (fila única, `pg_advisory_xact_lock`) ou rode um job de reconciliação que marca pares acima do limiar para revisão.
- **Serviço de embed fora do ar**: decida explicitamente. Para dedup, o seguro é *não* publicar o item até ter vetor (fica pendente e o sweeper embeda); para sugestões, o seguro é seguir sem sugestão.

## Escopo da busca

Filtre no SQL o que não é comparável: dono (`user_id`), tipo (`multi_select`, categoria), `embed_model`. Com scan exato o filtro é de graça. Com HNSW o filtro vira pós-filtro e pode devolver menos de `k` (veja `rollout-and-ci.md`).
