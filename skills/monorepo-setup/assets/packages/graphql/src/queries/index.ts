// Um arquivo por domínio (users.ts, orders.ts...), cada um exportando documentos `gql` tipados
// (`TypedDocumentNode<Resultado, Variaveis>`). Query, mutation e subscription do mesmo domínio
// ficam juntos; os apps importam daqui, nunca escrevem `gql` dentro de componente.
export {};
