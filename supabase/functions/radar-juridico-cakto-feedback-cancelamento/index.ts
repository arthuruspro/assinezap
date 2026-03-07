/**
 * Radar Jurídico — Agendar mensagem de feedback após cancelamento, reembolso ou MED
 *
 * Gatilho: Webhook POST da Cakto (refund, chargeback, subscription_canceled)
 * Ação: Agenda mensagem de feedback para 5 minutos depois na tabela mensagens_agendadas
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabase-client.ts';
import { extractCaktoCustomer, extractCaktoEvent, firstName } from '../_shared/cakto.ts';
import { normalizePhoneCaktoCom55 } from '../_shared/phone.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const payload = await req.json();
    const evento = extractCaktoEvent(payload);

    // Validar se é um evento relevante
    const eventosValidos = ['refund', 'chargeback', 'subscription_canceled', 'purchase_refunded', 'subscription_cancellation'];
    const eventoValido = eventosValidos.some(
      (e) => evento.includes(e) || evento.includes('cancel') || evento.includes('refund') || evento.includes('chargeback')
    );

    if (!eventoValido) {
      console.log(`Evento ignorado: ${evento}`);
      return new Response(JSON.stringify({ ok: true, ignorado: true, evento }), { status: 200 });
    }

    const customer = extractCaktoCustomer(payload);
    const phone = normalizePhoneCaktoCom55(customer.phone);
    const nome = firstName(customer.name);

    if (!phone || phone.length < 12) {
      return new Response(JSON.stringify({ error: 'Telefone inválido' }), { status: 400 });
    }

    // Montar mensagem de feedback
    const message = `Oi, ${nome}! Tudo bem?\n\nSou o fundador do Radar Jurídico.\n\nVi que você cancelou a assinatura e queria entender o que aconteceu, não pra te convencer de nada, só pra melhorar o serviço pras próximas pessoas.\n\nMe conta: *o que te fez cancelar?*`;

    // Agendar para 5 minutos depois
    const enviarEm = new Date(Date.now() + 5 * 60 * 1000);

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('mensagens_agendadas').insert({
      produto: 'radar-juridico',
      origem: 'radar-juridico-cakto-feedback-cancelamento',
      phone,
      message,
      zapi_instance: Deno.env.get('RADAR_ZAPI_INSTANCE')!,
      zapi_token: Deno.env.get('RADAR_ZAPI_TOKEN')!,
      enviar_em: enviarEm.toISOString(),
    });

    if (error) {
      console.error('Erro ao agendar mensagem:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log(`Feedback agendado para ${nome} (${phone}) em ${enviarEm.toISOString()}`);
    return new Response(JSON.stringify({ ok: true, phone, enviar_em: enviarEm.toISOString() }), { status: 200 });

  } catch (err) {
    console.error('Erro na função radar-juridico-cakto-feedback-cancelamento:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
