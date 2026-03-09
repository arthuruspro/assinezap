/**
 * AssineZap — Desativar cliente quando cancela assinatura na Cakto
 *
 * Gatilho: Webhook POST da Cakto (subscription_canceled)
 * Ação: Marca o cliente como inativo no Supabase
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabase-client.ts';
import { extractCaktoCustomer } from '../_shared/cakto.ts';
import { normalizePhoneCaktoSem55 } from '../_shared/phone.ts';

serve(async (req) => {
  // ⚠️ DESATIVADO TEMPORARIAMENTE
  return new Response(JSON.stringify({ status: 'disabled', msg: 'AssineZap desativado temporariamente' }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const payload = await req.json();
    const customer = extractCaktoCustomer(payload);
    const whatsapp_cliente = normalizePhoneCaktoSem55(customer.phone);

    if (!whatsapp_cliente || whatsapp_cliente.length < 10) {
      return new Response(JSON.stringify({ error: 'Telefone inválido' }), { status: 400 });
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('clientes')
      .update({ status_cliente: 'inativo' })
      .eq('whatsapp_cliente', whatsapp_cliente);

    if (error) {
      console.error('Erro ao desativar cliente:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log(`Cliente ${whatsapp_cliente} desativado com sucesso`);
    return new Response(JSON.stringify({ ok: true, whatsapp_cliente }), { status: 200 });

  } catch (err) {
    console.error('Erro na função assinezap-cakto-desativar-cliente:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
