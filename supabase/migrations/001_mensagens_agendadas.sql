-- Tabela para mensagens agendadas com delay (substitui Wait nodes do n8n)
-- Usada por: radar-juridico-cakto-boas-vindas (15min + 16min)
--            radar-juridico-cakto-feedback-cancelamento (5min)
-- Processada por: enviar-mensagens-agendadas (cron a cada 1 min)

CREATE TABLE IF NOT EXISTS mensagens_agendadas (
  id              SERIAL PRIMARY KEY,
  produto         TEXT NOT NULL,                        -- 'radar-juridico' ou 'assinezap'
  origem          TEXT NOT NULL,                        -- nome da função que agendou
  phone           TEXT NOT NULL,                        -- Phone com 55, pronto pro Z-API
  message         TEXT NOT NULL,                        -- Texto completo da mensagem
  zapi_instance   TEXT NOT NULL,                        -- Instance ID do Z-API
  zapi_token      TEXT NOT NULL,                        -- Token do Z-API
  enviar_em       TIMESTAMPTZ NOT NULL,                 -- Quando enviar
  status          TEXT NOT NULL DEFAULT 'pendente',     -- pendente / enviada / erro
  enviada_em      TIMESTAMPTZ,                          -- Quando foi realmente enviada
  erro            TEXT,                                 -- Mensagem de erro (se falhou)
  tentativas      INTEGER NOT NULL DEFAULT 0,           -- Contador de tentativas
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT now()    -- Quando foi criada
);

-- Índice para busca rápida de mensagens pendentes (usado pelo cron)
CREATE INDEX IF NOT EXISTS idx_mensagens_pendentes
  ON mensagens_agendadas (enviar_em)
  WHERE status = 'pendente';
