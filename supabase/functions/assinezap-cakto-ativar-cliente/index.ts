/**
 * AssineZap — Ativar cliente quando compra é aprovada na Cakto
 *
 * Gatilho: Webhook POST da Cakto (purchase_approved)
 * Ações:
 *   1. Extrai nome e telefone do payload
 *   2. Verifica se cliente já existe no Supabase
 *   3. Se existe: reativa (status=ativo, estado=aguardando_pdf)
 *   4. Se não existe: cria novo registro
 *   5. Envia mensagem de boas-vindas via Z-API
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabase-client.ts';
import { extractCaktoCustomer } from '../_shared/cakto.ts';
import { normalizePhoneCaktoSem55 } from '../_shared/phone.ts';
import { sendText, getAssinezapConfig } from '../_shared/zapi.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const payload = await req.json();
    const customer = extractCaktoCustomer(payload);
    const whatsapp_cliente = normalizePhoneCaktoSem55(customer.phone);
    const nome_cliente = customer.name;

    if (!whatsapp_cliente || whatsapp_cliente.length < 10) {
      return new Response(JSON.stringify({ error: 'Telefone inválido' }), { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Verificar se cliente já existe
    const { data: existentes } = await supabase
      .from('clientes')
      .select('*')
      .eq('whatsapp_cliente', whatsapp_cliente);

    const clienteExiste = existentes && existentes.length > 0;

    if (clienteExiste) {
      // Reativar cliente existente
      await supabase
        .from('clientes')
        .update({
          status_cliente: 'ativo',
          estado_cliente: 'aguardando_pdf',
        })
        .eq('whatsapp_cliente', whatsapp_cliente);

      console.log(`Cliente ${whatsapp_cliente} reativado`);
    } else {
      // Criar novo cliente
      const dataRenovacao = new Date();
      dataRenovacao.setDate(dataRenovacao.getDate() + 30);

      await supabase
        .from('clientes')
        .insert({
          whatsapp_cliente,
          nome_cliente,
          status_cliente: 'ativo',
          estado_cliente: 'aguardando_pdf',
          contador_documentos: 0,
          data_renovacao: dataRenovacao.toISOString(),
        });

      console.log(`Novo cliente ${whatsapp_cliente} criado`);
    }

    // Enviar boas-vindas via Z-API
    const zapi = getAssinezapConfig();
    const msg = `Ola ${nome_cliente}! Bem-vindo ao AssineZap! Vou coletar a assinatura digital do seu cliente e te enviar o comprovante juridico.\n\nPara isso, me envie o documento a ser assinado em formato PDF aqui 👇`;
    await sendText(zapi, '55' + whatsapp_cliente, msg);

    return new Response(JSON.stringify({ ok: true, whatsapp_cliente, novo: !clienteExiste }), { status: 200 });

  } catch (err) {
    console.error('Erro na função assinezap-cakto-ativar-cliente:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
