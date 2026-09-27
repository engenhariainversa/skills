# Arquitetura do app: MVVM por feature

Destilado de um app Expo em produção (chat com streaming, notificações, sessão com PIN e biometria). Leia quando for criar a primeira feature ou desviar do template.

## Pastas

```
app/                          rotas do expo-router; finas: cada arquivo renderiza a view de uma feature
  _layout.tsx                 ThemeProvider, Stack, redirect por fase da sessão, AppState → sinais
  index.tsx                   entrada (login)
  (tabs)/_layout.tsx          as abas
  <recurso>/[id].tsx          rotas de detalhe = alvos de deep link (<scheme>://<recurso>/<id>)
src/features/<feature>/
  model/                      funções puras e tipos (formatar, filtrar, mapear) — Node puro
  viewmodel/                  createXStore(deps) (zustand) + useXStore (singleton com deps reais)
  view/                       telas e componentes da feature
src/services/
  api/                        config, transport (fetch | mock), client, errors, mock
  storage.ts                  MMKV + StateStorage para `persist` do zustand
  vault.ts                    SecureStore com conjunto fechado de chaves
  signal.ts                   pub/sub sem payload (sessionEnded, appForeground)
src/ui/                       Screen, Button, Field, Sheet... (NativeWind)
src/theme/tokens.ts           paleta em variáveis CSS, claro e escuro
test/                         setups do Jest, fakes de módulos nativos, helpers
```

## Regras que seguram a arquitetura

1. **Views nunca chamam a API.** Leem a store (`useXStore(selector)`) e disparam ações dela.
2. **Model, viewmodel e services não importam `react-native` nem `expo-router`.** O projeto `logic` do Jest mocka os dois para lançar erro: a regra é verificada, não combinada. O que depende de plataforma (AppState, Linking) fica na view e vira sinal (`appForeground.emit()`).
3. **Factory + singleton**: `createXStore({ api, session })` é testável com o `MockTransport`; `useXStore.ts` só liga as deps reais. Deps entre stores por função (`session: () => useSessionStore.getState()`), não por import circular.
4. **Toda store com dado do usuário assina `sessionEnded`** e se zera; e usa um contador de geração para descartar respostas que chegaram depois do logout ou de um request mais novo.
5. **Estado vindo do servidor entra por um caminho só.** Ex.: num chat, a mensagem aparece quando o evento do socket chega, nunca com append local no envio; evita duplicata e divergência.
6. **Toda resposta é validada com zod** do contrato compartilhado. Resposta fora do contrato vira `ApiError(502, 'BAD_RESPONSE')`, nunca um `SyntaxError` com HTML de portal cativo na tela.
7. **Textos visíveis em pt-BR; código, comentários e commits como o resto do repo.**

## Modo mock

`EXPO_PUBLIC_API_MODE=mock` (padrão quando a variável falta) troca o `FetchTransport` por um servidor em memória que responde o mesmo contrato (URLs, status, corpos, eventos de socket). Serve para: rodar no simulador sem backend, demo, e todos os testes de store/tela. Controles que só existem no mock (ex.: "simular aprovação") ficam num objeto `mockControls` que é `null` em `http`.

## Persistência

| O quê | Onde |
|---|---|
| Tokens, chaves, qualquer segredo | `expo-secure-store` via `vault` (Keychain/Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) |
| Preferências, cache de listas, rascunhos | MMKV via `persist` do zustand (`createJSONStorage(() => mmkvStateStorage)`) |
| Escritas frequentes (streaming) | throttle da escrita no MMKV + flush quando o app vai para background |

## Auth: do simples ao forte

- **Padrão do template**: login → access token (memória, curto) + refresh token (SecureStore, rotativo). 401 `TOKEN_EXPIRED` → uma renovação single-flight → uma nova tentativa. Refresh recusado (401/403) → logout; falha de rede → mantém a sessão (pode ser offline).
- **Mais forte (quando o app autoriza ações sensíveis)**: chave do aparelho gerada no Secure Enclave/Keystore, cada request assinado com prova DPoP (inclui hash do token e horário corrigido pelo `Date` do servidor), cadastro do aparelho aprovado na web, PIN verificado no servidor (nunca localmente; errar 3× bloqueia, mais erros revogam o aparelho) e biometria como atalho para desembrulhar o segredo do PIN. Só vale o custo se roubar o token tiver consequência grave.
- **Versão mínima**: mande `X-App-Version: <plataforma>/<versão>+<build>` e deixe o backend responder `426` para builds antigos que quebrariam o contrato.

## Testes

- `logic` (`*.test.ts`): Node puro, rápido; stores contra o `MockTransport`, fakes de MMKV/SecureStore.
- `ui` (`*.test.tsx`): jest-expo + Testing Library. Na RNTL 14 `render` e `fireEvent` são assíncronos: use `await`, senão a atualização da store sai fora do `act` e o console acusa.
- `testTimeout` global de 30 s: o primeiro render num worker transforma RN + NativeWind e passa de 5 s no CI.
- Um checklist manual curto no README do app para o que só aparelho físico testa (biometria, Keychain, push).
