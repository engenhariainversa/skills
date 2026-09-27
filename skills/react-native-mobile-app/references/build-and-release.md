# Build, EAS e publicação

## Development build, não Expo Go

Qualquer módulo nativo fora do Expo Go (MMKV, crypto, SDK de mapa/anúncio) exige **development build**: um app seu, instalado no aparelho/simulador, com `expo-dev-client`, que carrega o JS do Metro. Faça isso desde o dia 1; migrar depois é retrabalho.

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init                                   # 1x por conta: grava extra.eas.projectId no app.json
npx eas-cli build --profile development --platform ios      # ou android; gera o instalável
pnpm --filter mobile start                         # Metro; o dev build conecta nele
```

`ios/` e `android/` **não** são commitados: o EAS roda `expo prebuild` na nuvem a partir do `app.json` (Continuous Native Generation). Mudança nativa = plugin no `app.json` + novo dev build. Só JS mudou? Basta o Metro.

## Perfis do eas.json

| Perfil | Uso | Distribuição |
|---|---|---|
| `development` | dev client, aponta para API de dev/staging | internal (link/QR) |
| `preview` | build de teste "como produção" para quem testa | internal |
| `production` | lojas, `autoIncrement` do build number | store |

`EXPO_PUBLIC_*` de cada perfil entram no bundle **no build**. Mudar a URL da API exige novo build (ou update OTA do JS). Nunca ponha segredo em `EXPO_PUBLIC_*`: vai legível dentro do app.

`appVersionSource: "remote"`: o EAS guarda o build number; não edite à mão.

## Monorepo no EAS

- O EAS faz upload do repositório inteiro e roda o install com o gerenciador detectado pelo lockfile da raiz (pnpm).
- Package do workspace consumido compilado (ex.: `@repo/api-contract` com `dist/`): o hook `"eas-build-post-install": "pnpm --filter @repo/api-contract build"` no `package.json` do app compila depois do install, na nuvem. Localmente, `prestart`/Turborepo fazem o mesmo.
- `.easignore` (ou `.gitignore`) enxuga o upload: ignore `apps/*/.next`, `node_modules`, dumps.

## Rodar sem Node na máquina

O host de servidor não tem Node: typecheck e testes rodam em container (mesmo padrão das outras skills):

```bash
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e COREPACK_HOME=/tmp/cp -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -v "$PWD:/w" -w /w node:22 sh -c 'corepack pnpm@10 install && corepack pnpm@10 --filter @repo/api-contract build \
  && corepack pnpm@10 --filter mobile typecheck && corepack pnpm@10 --filter mobile test'
```

Build na nuvem também dá para disparar de container com `EXPO_TOKEN` (token de acesso da conta Expo, guardado como secret, nunca no repo): `npx eas-cli build --profile preview --platform android --non-interactive --no-wait`.

O Metro para desenvolver no aparelho precisa rodar numa máquina na mesma rede do celular (ou `expo start --tunnel`); normalmente é o laptop de quem desenvolve.

## Credenciais e lojas (a cargo de quem opera)

- iOS: conta Apple Developer; `npx eas-cli credentials` gera/gerencia certificados e profiles. Push: chave APNs (.p8) no EAS.
- Android: keystore gerado e guardado pelo EAS; push via conta de serviço FCM v1 no EAS.
- Nunca commite `.p8`, `.p12`, `.jks`, `.mobileprovision`, `google-services.json` de produção (o `.gitignore` do template já cobre os binários).
- `npx eas-cli submit --profile production` envia para as lojas depois de configurar App Store Connect / Play Console.

## Permissões

Declare no `app.json`, em pt-BR, com o *porquê* (a revisão da Apple rejeita texto genérico):

```json
"ios": { "infoPlist": { "NSCameraUsageDescription": "A câmera é usada para ..." } },
"plugins": [["expo-location", { "locationWhenInUsePermission": "Sua localização mostra as máquinas perto de você." }]]
```

Plugins de módulos Expo (`expo-location`, `expo-camera`, `expo-image-picker`, `expo-notifications`, `expo-local-authentication`) aceitam as strings de permissão como opção; prefira isso a editar `infoPlist` à mão. Android: liste só as permissões usadas em `android.permissions`.

## Push (expo-notifications)

Plugin `["expo-notifications", { "color": "#..." }]` no `app.json`, `Notifications.getExpoPushTokenAsync({ projectId })` depois do login (projectId vem de `Constants.expoConfig.extra.eas.projectId`), `PUT /push-token` no backend, envio pelo Expo Push Service. Payload com ids para deep link (`<scheme>://rota/<id>`), nunca conteúdo sensível. Precisa de dev build e aparelho físico.

## Checklist antes de um build de produção

1. `pnpm --filter mobile typecheck && pnpm --filter mobile test`
2. `npx expo install --check` (versões alinhadas ao SDK) e `npx expo-doctor`
3. `EXPO_PUBLIC_API_URL` do perfil `production` aponta para a API certa
4. Ícone, splash, nome, `bundleIdentifier`/`package` definitivos (trocar depois = app novo na loja)
