# Edge Functions — AssineZap + Radar Jurídico

## Visão geral de todos os fluxos

```mermaid
flowchart LR
    subgraph CAKTO["🛒 Cakto (pagamentos)"]
        C1[Compra AssineZap]
        C2[Cancelamento AssineZap]
        C3[Compra Radar Jurídico]
        C4[Cancelamento / Reembolso / MED Radar]
    end

    subgraph EDGE["⚡ Supabase Edge Functions"]
        F1[assinezap-cakto-ativar-cliente]
        F2[assinezap-cakto-desativar-cliente]
        F3[assinezap-whatsapp-processar-mensagem]
        F4[radar-juridico-cakto-boas-vindas]
        F5[radar-juridico-cakto-feedback-cancelamento]
        F6[enviar-mensagens-agendadas]
    end

    subgraph DB["🗄️ Supabase PostgreSQL"]
        T1[(clientes)]
        T2[(signatarios)]
        T3[(mensagens_agendadas)]
    end

    subgraph WHATSAPP["📱 WhatsApp via Z-API"]
        W1[AssineZap WhatsApp]
        W2[Radar Jurídico WhatsApp]
    end

    subgraph CRON["⏰ Cron"]
        CR[cron-job.org a cada 1 min]
    end

    C1 -->|webhook| F1
    C2 -->|webhook| F2
    C3 -->|webhook| F4
    C4 -->|webhook| F5

    W1 -->|webhook msg recebida| F3

    F1 --> T1
    F1 --> W1
    F2 --> T1
    F3 --> T1
    F3 --> T2
    F3 --> W1
    F4 --> T3
    F5 --> T3

    CR -->|POST| F6
    F6 --> T3
    F6 --> W2
```

## Funções por produto

### AssineZap (assinatura eletrônica via WhatsApp)

| Função | Gatilho | O que faz |
|--------|---------|-----------|
| `assinezap-cakto-ativar-cliente` | Cakto compra aprovada | Cria/reativa cliente + msg boas-vindas |
| `assinezap-cakto-desativar-cliente` | Cakto cancelamento | Marca cliente como inativo |
| `assinezap-whatsapp-processar-mensagem` | Z-API (cada msg WhatsApp) | Fluxo completo: PDF → signatário → aceite → comprovante |

### Radar Jurídico (monitoramento processual)

| Função | Gatilho | O que faz |
|--------|---------|-----------|
| `radar-juridico-cakto-boas-vindas` | Cakto compra aprovada | Agenda 2 msgs (15min + 16min) |
| `radar-juridico-cakto-feedback-cancelamento` | Cakto cancel/refund/MED | Agenda msg feedback (5min) |

### Compartilhada

| Função | Gatilho | O que faz |
|--------|---------|-----------|
| `enviar-mensagens-agendadas` | Cron a cada 1 min | Processa e envia msgs pendentes |

## Como ver o fluxo de cada função

Cada pasta tem um arquivo `flow.mermaid` com o diagrama visual. Abra no GitHub para ver renderizado automaticamente.

## Secrets necessários

```
ASSINEZAP_ZAPI_INSTANCE
ASSINEZAP_ZAPI_TOKEN
RADAR_ZAPI_INSTANCE
RADAR_ZAPI_TOKEN
ZAPI_CLIENT_TOKEN
SUPABASE_SERVICE_ROLE_KEY
```
