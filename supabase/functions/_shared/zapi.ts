/**
 * Helper para chamadas à Z-API (envio de mensagens WhatsApp)
 * Suporta: texto, documento PDF, botões
 */

export interface ZapiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

const ZAPI_BASE = 'https://api.z-api.io/instances';

function headers(config: ZapiConfig): Record<string, string> {
  return {
    'Client-Token': config.clientToken,
    'Content-Type': 'application/json',
  };
}

/** Envia mensagem de texto simples */
export async function sendText(config: ZapiConfig, phone: string, message: string) {
  const url = `${ZAPI_BASE}/${config.instanceId}/token/${config.token}/send-text`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ phone, message }),
  });
  return res.json();
}

/** Envia documento PDF via URL */
export async function sendDocument(config: ZapiConfig, phone: string, documentUrl: string, fileName: string) {
  const url = `${ZAPI_BASE}/${config.instanceId}/token/${config.token}/send-document/pdf`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ phone, document: documentUrl, fileName }),
  });
  return res.json();
}

/** Envia mensagem com botões interativos */
export async function sendButtonList(
  config: ZapiConfig,
  phone: string,
  message: string,
  buttons: Array<{ id: string; label: string }>
) {
  const url = `${ZAPI_BASE}/${config.instanceId}/token/${config.token}/send-button-list`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({
      phone,
      message,
      buttonList: {
        buttons: buttons.map((b) => ({ id: b.id, label: b.label })),
      },
    }),
  });
  return res.json();
}

/** Retorna config da instância AssineZap */
export function getAssinezapConfig(): ZapiConfig {
  return {
    instanceId: Deno.env.get('ASSINEZAP_ZAPI_INSTANCE')!,
    token: Deno.env.get('ASSINEZAP_ZAPI_TOKEN')!,
    clientToken: Deno.env.get('ZAPI_CLIENT_TOKEN')!,
  };
}

/** Retorna config da instância Radar Jurídico */
export function getRadarConfig(): ZapiConfig {
  return {
    instanceId: Deno.env.get('RADAR_ZAPI_INSTANCE')!,
    token: Deno.env.get('RADAR_ZAPI_TOKEN')!,
    clientToken: Deno.env.get('ZAPI_CLIENT_TOKEN')!,
  };
}
