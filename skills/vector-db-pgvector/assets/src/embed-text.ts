// O texto que vira vetor. Função pura, usada tanto para gravar quanto para consultar: se as duas
// pontas montarem o texto de jeitos diferentes, a similaridade cai sem erro nenhum aparecer.

/** Suba sempre que `embedText` mudar de formato: cada vetor é gravado com essa tag e o sweeper
 *  re-embeda os de versão antiga. Vetores de versões diferentes nunca são comparados. */
export const EMBED_TEXT_VERSION = 't1';

/** Normaliza o que distingue um item de outro. Deixe de fora o que é igual em todos (rótulos
 *  fixos, "Nome:", boilerplate): texto repetido puxa pares diferentes para perto de 1.0. */
export function embedText(item: { name: string; description: string }): string {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return `${norm(item.name)}. ${norm(item.description)}`;
}

/** Valor de `embed_model` gravado junto do vetor: nome do modelo + versão do texto. */
export const embedTag = (model: string): string => `${model}#${EMBED_TEXT_VERSION}`;
