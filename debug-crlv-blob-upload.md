# Debug Session: crlv-blob-upload [RESOLVIDO]

## Sintoma
- Upload de CRLV com `@vercel/blob` nunca anexava o documento.

## Causa raiz
- O Vercel Blob **store esta configurado como privado**, mas o codigo chamava `put()`
  com `access: "public"`. O Blob rejeitava com:
  `Cannot use public access on a private store. The store is configured with private access.`
- O erro `BLOB_READ_WRITE_TOKEN nao configurado` da sessao anterior era um sintoma
  secundario (servidor dev iniciado antes do token ser adicionado ao `.env.local`),
  que mascarava a causa real.

## Correcao
- `saveFleetVehicleCrlv` agora envia com `access: "private"`.
- Como blobs privados nao sao acessiveis por URL direta, foi criada a rota de proxy
  `GET /api/fleet/[vehicleId]/crlv/view`, que usa `get(url, { access: "private", token })`
  para transmitir o PDF de forma autenticada (inline ou `?download=1`).
- Frontend passou a apontar "Abrir/Baixar" e a pre-visualizacao para essa rota.

## Carga inicial
- `scripts/attach-fleet-crlvs.mjs` anexou os 69 CRLVs da pasta `CRLV - 2025`
  (42 em veiculos existentes + 27 cadastrados de forma provisoria via `--create-missing`).

## Atencao para producao (Vercel)
- `.env.local` nao e usado em producao. Garanta que `BLOB_READ_WRITE_TOKEN` (e `DATABASE_URL`)
  estejam definidos nas Environment Variables do projeto no painel da Vercel.
