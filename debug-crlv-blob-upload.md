# Debug Session: crlv-blob-upload [OPEN]

## Sintoma
- Upload de CRLV com `@vercel/blob` nao guarda o ficheiro e/ou nao atualiza o Neon.

## Hipoteses
- O frontend nao envia `FormData` corretamente.
- O `file` nao chega valido na route handler.
- O `put()` do Blob falha por token/configuracao.
- O `UPDATE` na tabela `frota_veiculos` falha apos o upload.
- O frontend nao mostra a mensagem exata devolvida pela API.

## Plano
- Instrumentar frontend e backend sem mudar a logica de negocio.
- Reproduzir e recolher evidencia.
- Analisar logs e entao aplicar o menor ajuste necessario.

## Evidencia
- Reproducao apos instrumentacao devolveu no frontend: `BLOB_READ_WRITE_TOKEN nao configurado. Configure o token do Vercel Blob antes de enviar CRLVs.`

## Estado das Hipoteses
- Frontend nao envia `FormData` corretamente: nao confirmada.
- O `file` nao chega valido na route handler: nao confirmada.
- O `put()` do Blob falha por token/configuracao: confirmada por ausencia de `BLOB_READ_WRITE_TOKEN`.
- O `UPDATE` na tabela `frota_veiculos` falha apos o upload: ainda nao testado porque a execucao para antes.
- O frontend nao mostra a mensagem exata devolvida pela API: resolvido pela instrumentacao atual.
