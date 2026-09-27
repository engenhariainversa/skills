// Contrato app ↔ backend em zod: o backend valida entrada/saída com estes schemas e o app valida
// toda resposta com os mesmos. Mudou a API? Muda aqui, e os dois lados quebram no typecheck.
// Compilado para ESM em dist/ (Node/NestJS consomem JS pronto; o Metro também).
import { z } from 'zod';

/** Todo erro da API tem este corpo: `code` estável para o app decidir, `error` em pt-BR para a pessoa. */
export const errorBody = z.object({ code: z.string(), error: z.string() });
export type TErrorBody = z.infer<typeof errorBody>;

export const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
export type TLoginBody = z.infer<typeof loginBody>;

export const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
});
export type TTokenResponse = z.infer<typeof tokenResponse>;

export const meResponse = z.object({ id: z.string(), name: z.string(), email: z.string() });
export type TMeResponse = z.infer<typeof meResponse>;
