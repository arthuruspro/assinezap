/**
 * Radar Jurídico — Gerar PIX Automático via Asaas
 *
 * Gatilho: POST do frontend asaas.html
 * Recebe: { cpf, whatsapp, nome?, email?, area_atuacao?, utm? }
 * Retorna: { qrCodeImage, qrCodeText, authorizationId }
 *
 * Fluxo:
 *   1. Valida CPF e WhatsApp
 *   2. Salva lead no Supabase (radar_leads)
 *   3. Busca ou cria cliente na Asaas pelo CPF (com nome/email)
 *   4. Cria autorização PIX Automático (R$147/mês)
 *   5. Retorna QR Code + authorizationId para polling
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  findCustomerByCpf,
  createCustomer,
  createPixAutomaticAuthorization,
} from '../_shared/asaas.ts';
import { getSupabaseClient } from '../_shared/supabase-client.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function validateCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (parseInt(cpf[9]) !== d1) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return parseInt(cpf[10]) === d2;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS });
  }

  try {
    const {
      cpf: cpfRaw,
      whatsapp: whatsappRaw,
      nome,
      email,
      area_atuacao,
      utm,
    } = await req.json();

    // Validar CPF
    const cpf = (cpfRaw || '').replace(/\D/g, '');
    if (!validateCpf(cpf)) {
      return jsonResponse({ error: 'CPF inválido' }, 400);
    }

    // Validar WhatsApp (10 ou 11 dígitos)
    const whatsapp = (whatsappRaw || '').replace(/\D/g, '');
    if (whatsapp.length < 10 || whatsapp.length > 11) {
      return jsonResponse({ error: 'WhatsApp inválido' }, 400);
    }

    // Salvar lead no Supabase
    try {
      const sb = getSupabaseClient();
      const leadData: Record<string, unknown> = {
        cpf,
        whatsapp,
      };
      if (nome) leadData.nome = nome;
      if (email) leadData.email = email;
      if (area_atuacao) leadData.area_atuacao = area_atuacao;
      if (utm) leadData.utm = utm;

      await sb.from('radar_leads').insert(leadData);
      console.log(`Lead salvo: CPF ${cpf.substring(0, 3)}***`);
    } catch (leadErr) {
      // Não bloquear o checkout se falhar salvar o lead
      console.error('Erro ao salvar lead (não bloqueante):', leadErr);
    }

    // Buscar ou criar cliente no Asaas (agora com nome e email)
    let customerId = await findCustomerByCpf(cpf);
    if (!customerId) {
      const customerEmail = email || `${cpf}@radar-juridico.com`;
      const customerName = nome || `Cliente ${cpf.substring(0, 3)}***`;
      customerId = await createCustomer(customerEmail, customerName, cpf);
    }

    // Gerar contractId único (máx 35 chars)
    const shortId = Date.now().toString(36);
    const cpfShort = cpf.slice(0, 8);
    const contractId = `rj-${cpfShort}-${shortId}`;

    // Criar autorização PIX Automático R$147/mês
    const result = await createPixAutomaticAuthorization(customerId, 147, contractId);

    console.log(`PIX Automático gerado para CPF ${cpf.substring(0, 3)}***: auth=${result.authorizationId}`);
    return jsonResponse({
      qrCodeImage: result.encodedImage,
      qrCodeText: result.payload,
      authorizationId: result.authorizationId,
    });

  } catch (err) {
    console.error('Erro na função radar-juridico-asaas-gerar-pix:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
