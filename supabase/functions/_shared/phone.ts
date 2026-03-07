/**
 * Utilitários de normalização de telefone brasileiro
 * Usado por todas as Edge Functions do AssineZap e Radar Jurídico
 */

/**
 * Normaliza telefone vindo da Cakto para o formato SEM 55 (padrão do AssineZap).
 * Cakto envia com ou sem 55: "5535991326444" ou "35991326444"
 * Retorna: "35991326444" (11 dígitos: DDD + 9 + número)
 */
export function normalizePhoneCaktoSem55(raw: string): string {
  let phone = raw.replace(/\D/g, '');
  if (phone.startsWith('55')) {
    phone = phone.substring(2);
  }
  // Se tem 10 dígitos (DDD + 8 dígitos), adiciona o 9 após o DDD
  if (phone.length === 10) {
    phone = phone.substring(0, 2) + '9' + phone.substring(2);
  }
  return phone;
}

/**
 * Normaliza telefone vindo da Cakto para o formato COM 55 (padrão do Radar Jurídico / Z-API).
 * Retorna: "5535991326444"
 */
export function normalizePhoneCaktoCom55(raw: string): string {
  let phone = raw.replace(/\D/g, '');
  if (!phone.startsWith('55')) {
    phone = '55' + phone;
  }
  const sem55 = phone.substring(2);
  if (sem55.length === 10) {
    phone = '55' + sem55.substring(0, 2) + '9' + sem55.substring(2);
  }
  return phone;
}

/**
 * Normaliza telefone vindo do Z-API webhook.
 * Z-API envia: "5535991326444@c.us" ou "5535991326444"
 * Retorna: { sem55: "35991326444", com55: "5535991326444" }
 */
export function normalizePhoneZapi(raw: string): { sem55: string; com55: string } {
  let phone = raw.replace('@c.us', '').replace(/\D/g, '');
  let sem55 = phone.startsWith('55') ? phone.substring(2) : phone;
  // Adiciona 9 se faltando
  if (sem55.length === 10) {
    sem55 = sem55.substring(0, 2) + '9' + sem55.substring(2);
  }
  return { sem55, com55: '55' + sem55 };
}
