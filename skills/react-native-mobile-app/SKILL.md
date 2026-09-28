---
name: react-native-mobile-app
description: Cria um app mobile React Native com Expo (SDK 57, React Native 0.86, React 19.2) e expo-router, em TypeScript, dentro de um monorepo pnpm/Turborepo como apps/mobile - development build via EAS (sem Expo Go), NativeWind v4 com tema claro/escuro por variáveis CSS, arquitetura MVVM por feature com zustand, MMKV para estado persistido e SecureStore para tokens, client de API com transporte trocável (http real ou mock em memória), contrato zod compartilhado com o backend, login com refresh token e renovação single-flight, Jest em dois projetos (lógica em Node puro + telas com jest-expo). Use sempre que o usuário falar em "app mobile", "app React Native", "Expo", "app iOS/Android", "EAS build", "expo-router", "adicionar apps/mobile ao monorepo", "jogo mobile", "estilizar/criar tela no app", "tema claro/escuro no app", "persistir preferência no app", ou quiser um app nativo consumindo a API (REST ou GraphQL) do backend NestJS.
---

# App React Native (Expo) no monorepo

Referência viva: o app mobile do termhub (chat com streaming, notificações, sessão com PIN/biometria), que roda em produção com Expo SDK 57. Esta skill destila a estrutura e as decisões; os templates em `assets/` foram instalados, tipados e testados (`tsc` limpo, Jest verde, `expo install --check` sem divergência).

## Stack e por quê

| Peça | Escolha | Motivo |
|---|---|---|
| Framework | Expo SDK 57 (`expo ~57.0`), RN 0.86.3, React 19.2.3 | Build nativo na nuvem (EAS), módulos Expo mantidos, upgrades de SDK guiados |
| Execução | **Development build** (`expo-dev-client`), nunca Expo Go | Qualquer módulo nativo (MMKV, crypto, mapas) quebra no Expo Go |
| Navegação | `expo-router` (rotas por arquivo, `typedRoutes`) | Deep link de graça (`<scheme>://rota/<id>`), layouts aninhados |
| Estilo | **NativeWind v4 + Tailwind 3** (padrão de todo layout), cores em variáveis CSS | `bg-app-bg` troca claro/escuro sem `dark:` em toda tela |
| Estado | **zustand** (factory `createXStore(deps)` + singleton), único gerenciador | Store testável em Node puro com deps falsas |
| Persistência | **MMKV** (estado, via `persist`) + SecureStore (segredos) | MMKV é síncrono e rápido; token só no Keychain/Keystore |
| API | client sobre `Transport` (`FetchTransport` ou mock) + zod | App roda sem backend; resposta fora do contrato vira erro tratável |
| Testes | Jest com projetos `logic` e `ui` | Regra MVVM verificada: lógica não pode importar `react-native` |

## Passo a passo

### 1. Estrutura no monorepo

Copie `assets/app/` para `apps/mobile/` e `assets/packages/api-contract/` para `packages/api-contract/`. Troque os placeholders:

- `app.json`: `<Nome do App>`, `<slug>`, `<conta-expo>`, `<scheme>`, `<com.dominio.app>` (bundle id e package: definitivos, trocar depois é outro app na loja).
- `eas.json`: `<api-...>` por perfil.
- `src/services/storage.ts`: `<app>` (id do MMKV); `test/*-setup.js`: `<scheme>`.
- Crie `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png` dentro de `apps/mobile/`.

No monorepo (detalhes em `monorepo-setup` → `references/add-app-or-package.md`):

- **Uma versão de React no repo inteiro.** O RN fixa a versão exata; Next.js tem que usar a mesma. Na raiz: `"pnpm": { "overrides": { "react": "19.2.3", "react-dom": "19.2.3" } }`. Upgrade de SDK do Expo sobe o React de todos os apps.
- **O app mobile não entra em imagem Docker.** No Dockerfile do monorepo, copie `apps/mobile/package.json` no stage `deps` (o lockfile o referencia) e instale com `pnpm install --frozen-lockfile --filter "!mobile"`.
- **Metro**: `expo/metro-config` detecta a raiz do workspace sozinho; não mexa em `watchFolders`. Se o Metro não achar módulo ou aparecerem duas cópias de `react`, a saída é `node-linker=hoisted` no `.npmrc` da raiz.
- **Contrato**: `@repo/api-contract` (zod, compilado para `dist/`) é importado pelo backend para validar e pelo app para decodificar. No EAS, o hook `eas-build-post-install` compila o package depois do install.

```bash
pnpm install                                    # na raiz (ou no container, veja references/build-and-release.md)
pnpm --filter @repo/api-contract build
pnpm --filter mobile typecheck && pnpm --filter mobile test
npx expo install --check                        # dentro de apps/mobile: versões batem com o SDK?
```

Para instalar libs nativas use `npx expo install <lib>` (escolhe a versão compatível com o SDK), não `pnpm add` direto.

### 2. Arquitetura

MVVM por feature: `src/features/<feature>/{model,viewmodel,view}`, rotas finas em `app/`, serviços em `src/services/`. As regras (views não chamam API, viewmodels sem `react-native`, toda store se zera em `sessionEnded`, estado do servidor entra por um caminho só) e a tabela de persistência estão em `references/architecture.md`. Leia antes da primeira feature nova.

O template traz a feature `session` completa como modelo: `createSessionStore` (boot → `restore()` pelo refresh no SecureStore → `signedIn`/`signedOut`), `login-screen` e o redirect por fase em `app/_layout.tsx` (também esconde a splash quando a fase sai de `booting`).

### 3. Layout: NativeWind é o padrão

Toda tela e todo componente são escritos com `className` e utilitários do Tailwind. É assim que o app fica consistente e troca de tema sem esforço, e é o que os testes de UI esperam. O contrato de uma view:

- **Cores só pelos tokens `app-*`** (`bg-app-bg`, `bg-app-surface`, `text-app-text`, `text-app-muted`, `border-app-border`, `bg-app-accent`, `text-app-danger`, `text-app-ok`). Eles são variáveis CSS que o `ThemeProvider` injeta por esquema, então nenhuma tela usa `dark:` nem hex. Cor nova: acrescente nos dois esquemas de `src/theme/tokens.ts` e em `keys` do `tailwind.config.js`.
- **Espaçamento, tipografia, borda, flex e sombra pelo Tailwind** (`px-6`, `gap-4`, `rounded-xl`, `text-2xl font-bold`, `flex-row items-center`, `shadow-md`). `StyleSheet.create` e `style={{...}}` não aparecem em views. Sombra/elevação inclusive: `shadow-*` do NativeWind vira `shadow*` no iOS e `elevation` no Android; no tema escuro a sombra some, por isso todo card leva também `border border-app-border`.
- **Onde `className` não chega** (`trackColor` do `Switch`, `tabBarStyle`, `screenOptions`, `ActivityIndicator`), leia a mesma paleta com `tokens[useSchemeName()]`.
- **Peça repetida vira componente em `src/ui/`** (`Screen`, `Button`, `Field`, `Card`...), aceitando `className` para variação, em vez de duplicar classes entre telas.
- **Nenhuma lib de componentes** (Paper, Tamagui, gluestack): os componentes são `View`/`Text`/`Pressable` com classes. Ícones: `@expo/vector-icons`.

O modelo é `src/features/session/view/login-screen.tsx`: campo, botão e erro só com classes. Se as classes não surtirem efeito, algo destes cinco arquivos saiu do lugar (todos vêm no template): `babel.config.js` (`jsxImportSource: 'nativewind'` + preset `nativewind/babel`), `metro.config.js` (`withNativeWind(..., { input: './global.css' })`), `tailwind.config.js` (preset `nativewind/preset`, `content` cobrindo `app/` e `src/`, cores `var(--app-*)`), `global.css` (as três diretivas `@tailwind`) e `nativewind-env.d.ts` (tipos de `className`). `app/_layout.tsx` importa o `global.css` e envolve tudo no `ThemeProvider`.

### 4. Estado: zustand + MMKV

Um único gerenciador de estado no app inteiro: **zustand**. Um único lugar para estado persistido não sensível: **MMKV**, pelo `persist` do zustand. O que decide onde cada dado mora:

| Dado | Onde mora |
|---|---|
| Vale para mais de um componente, sobrevive à navegação, ou vem do servidor | Store zustand em `src/features/<feature>/viewmodel/createXStore.ts` (factory com deps) + `useXStore.ts` (singleton) |
| Precisa sobreviver ao fechar do app (preferências, filtro escolhido, cache de lista, rascunho) | A mesma store, com `persist(..., { name, storage: createJSONStorage(() => mmkvStateStorage) })` |
| Segredo (token, chave, PIN embrulhado) | `vault` (SecureStore), nunca MMKV |
| Efêmero de um componente só (texto sendo digitado, sheet aberta) | `useState` na view |

Não entram: Redux, MobX, jotai, React Query/SWR, `Context` como store, `AsyncStorage`. Se um dado do servidor precisa de cache e revalidação, é uma store com `load()`, contador de geração e `sessionEnded` (regras 3 a 5 de `references/architecture.md`). `src/services/storage.ts` já exporta `mmkvStateStorage` e `resetPersistedStores()` (logout); `createSessionStore` e o teste dele mostram a factory com deps falsas.

### 5. Falando com o backend

- **REST** (template): `createApiClient` em `src/services/api/client.ts`. Um método por rota, resposta validada com o schema do contrato, `401 TOKEN_EXPIRED` → uma renovação single-flight → uma nova tentativa, header `X-App-Version` para o backend recusar builds velhos (`426`). O corpo de erro do contrato é `{ code, error }`: `code` estável para o app decidir, `error` em pt-BR para mostrar.
- **GraphQL** (backend NestJS do `monorepo-setup`): reuse `@repo/graphql` com Apollo; client, auth link e retry em `references/graphql-client.md`.
- **Modo mock**: `EXPO_PUBLIC_API_MODE=mock` (padrão sem `.env`) roda o app inteiro contra `src/services/api/mock.ts`. Cresça o mock junto com o contrato: é ele que deixa testar telas e rodar no simulador sem backend.

URL da API: `EXPO_PUBLIC_API_URL`, do `.env` local no `expo start` e do `eas.json` por perfil no build. Tudo que é `EXPO_PUBLIC_*` fica legível dentro do app: **nunca segredo**. Emulador Android fala com o host em `10.0.2.2`; aparelho físico, pelo IP da máquina na LAN. Uma API atrás de Cloudflare Access não é alcançável pelo app: deixe a rota mobile fora do Access.

### 6. Rodar

```bash
cd apps/mobile
cp .env.example .env                           # ou sem .env = modo mock
npx eas-cli init                               # 1x: grava o projectId
npx eas-cli build --profile development --platform android   # instala no aparelho
pnpm --filter mobile start                     # Metro; o dev build conecta
```

`ios/` e `android/` nunca são commitados (o EAS gera no build). Mudou algo nativo (plugin, permissão, lib nativa)? Novo dev build. Só JS? Metro basta.

### 7. Testes

`jest.config.js` tem dois projetos: `logic` (`*.test.ts`, Node puro, `react-native`/`expo-router` mockados para **lançar erro**) e `ui` (`*.test.tsx`, jest-expo + Testing Library). Fakes de MMKV e SecureStore em `test/fakes/`. Na RNTL 14, `render` e `fireEvent` são assíncronos: `await` nos dois. Veja os dois testes da feature `session` como modelo.

### 8. Build e lojas

`references/build-and-release.md`: perfis `development`/`preview`/`production`, monorepo no EAS, typecheck/test em Docker (servidor sem Node), build disparado com `EXPO_TOKEN`, credenciais Apple/Google, permissões com texto em pt-BR, push com `expo-notifications`, checklist antes de produção.

## O que fica a cargo de quem opera

- Conta Expo (`eas login`), Apple Developer e Google Play Console; credenciais de push (APNs `.p8`, FCM v1) no EAS.
- `EXPO_TOKEN` como secret, se o build for disparado por CI. Nunca no repo.
- Testar no aparelho físico o que o Jest não cobre (Keychain, biometria, push, câmera/localização).

## Próximos passos comuns

- Monorepo com backend e CMS: skill `monorepo-setup` (acrescente `apps/mobile` pelo checklist).
- API publicada com domínio para o app acessar: skill `docker-nginx-cloudflare-proxy`.
- Busca por similaridade no backend (ex.: evitar itens duplicados): skill `vector-db-pgvector`.
