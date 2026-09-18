---
name: nextjs-server-action-form
description: Implementa formulários no Next.js App Router com Server Action + useActionState, validação no servidor com erros por campo, honeypot anti-bot e persistência simples em JSON (sem banco), e mostra como testar o envio por curl sem navegador. Use sempre que o usuário pedir "formulário de cadastro/inscrição/contato/lead", "landing page com formulário", "salvar respostas do formulário", "form com validação" em Next.js 15/16, ou quando precisar testar uma Server Action a partir do terminal.
---

# Formulário com Server Action no Next.js

## Estrutura

```
src/app/actions.ts              'use server': valida FormData, chama a persistência, devolve FormState
src/components/<nome>-form.tsx  'use client': useActionState(action, initial) -> erros, valores, pending, sucesso
src/lib/<entidade>.ts           'server-only': grava em DATA_DIR/<entidade>.json (troque por banco quando precisar)
src/content/site.ts             opções de select/checkbox compartilhadas entre form e validação
```

Antes de escrever código, leia `node_modules/next/dist/docs/01-app/02-guides/forms.md` e `01-getting-started/07-mutating-data.md` da versão instalada: a API muda entre versões e o `AGENTS.md` gerado pelo `create-next-app` pede isso.

## Regras que evitam retrabalho

**Contrato da action.** Com `useActionState` a assinatura é `(prevState, formData) => Promise<FormState>`. Devolva sempre um objeto com `status: "idle" | "success" | "error"`, `message`, `errors` por campo e `values` (os valores digitados, para repovoar o form com `defaultValue` quando der erro). Nunca lance exceção para erro de validação; lançar derruba o form inteiro com uma tela genérica.

**Fonte única das opções.** Áreas, períodos e afins ficam em `src/content/site.ts` como `as const`; o form renderiza a partir daí e a action valida com um `Set` dos mesmos valores. Assim uma opção nova não passa despercebida na validação.

**Sanitização barata.** Um helper `text(formData, key, max)` que faz `trim()` e `slice(0, max)` em cada campo evita payloads gigantes sem depender de biblioteca. Para checkboxes use `formData.getAll(key)` e filtre pelo `Set`.

**Honeypot.** Um input `name="website"` posicionado fora da tela (`absolute -left-[9999px]`, `tabIndex={-1}`, `aria-hidden`). Se vier preenchido, responda sucesso sem gravar: o bot acha que funcionou e não insiste.

**Dedupe por e-mail** em minúsculas na camada de persistência, devolvendo `{ ok: false, reason: "duplicate" }` para a action transformar em erro amigável no campo.

**Consentimento (LGPD).** Checkbox obrigatório dizendo para que os dados serão usados. Valide no servidor também (`formData.get("consent") === "on"`).

**Sucesso.** Quando `state.status === "success"`, renderize a mensagem de confirmação no lugar do form. `pending` desabilita o botão e troca o texto.

## Persistência em JSON

`assets/volunteers.ts` é o modelo: `DATA_DIR` (env, com fallback `./data`), leitura tolerante a arquivo inexistente, escrita atômica (tmp + rename) e uma fila de promessas para serializar gravações concorrentes no mesmo processo. Vale para inscrições de evento, leads, listas de espera. Se o app rodar com mais de um processo ou precisar de consulta, troque `saveVolunteer` por um banco; o resto não muda.

No Docker, `DATA_DIR` aponta para um volume (`/data` em prod, `/app/data` em dev montado do host). Adicione `/data` ao `.gitignore`.

Para exportar: `docker compose --profile prod exec app cat /data/<entidade>.json > export.json`.

## Testar sem navegador

Chamar a Server Action "na mão" com o header `Next-Action` costuma falhar (erro *Connection closed*) porque o React codifica os argumentos de forma própria. O caminho confiável é o de **progressive enhancement**: o form renderizado no HTML traz inputs ocultos (`$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1`, `$ACTION_KEY`), e um POST `multipart/form-data` com eles mais os campos do form executa a action e devolve a página re-renderizada. Roteiro completo em `references/testing-with-curl.md`. Verifique os três casos: válido (grava e mostra sucesso), duplicado e inválido (mensagens por campo).
