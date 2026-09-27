type Listener = () => void;

/**
 * Pub/sub mínimo, sem payload: um módulo reage a um evento sem importar quem o dispara, e as
 * dependências ficam numa direção só (ex.: toda store persistida se zera em `sessionEnded`).
 */
export function signal() {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(): void {
      listeners.forEach((listener) => listener());
    },
  };
}

/** Fim da sessão (logout, conta removida, refresh recusado): toda store com dado do usuário zera. */
export const sessionEnded = signal();
/** O app voltou ao foreground (emitido pelo app/_layout.tsx): sockets/polls retomam. */
export const appForeground = signal();
