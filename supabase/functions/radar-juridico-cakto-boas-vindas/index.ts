/**
 * Radar Jurídico — Agendar boas-vindas após compra aprovada na Cakto
 *
 * Gatilho: Webhook POST da Cakto (purchase_approved)
 * Ações:
 *   1. Extrai nome, telefone e CPF do payload
 *   2. Agenda Msg 1 para 15 minutos depois: "Seu monitoramento está ativo ✅" + link Escavador
 *   3. Agenda Msg 2 para 16 minutos depois: Pitch remoção de processos
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabase-client.ts';
import { extractCaktoCustomer, firstName } from '../_shared/cakto.ts';
import { normalizePhoneCaktoCom55 } from '../_shared/phone.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const payload = await req.json();
    const customer = extractCaktoCustomer(payload);
    const phone = normalizePhoneCaktoCom55(customer.phone);
    const nome = firstName(customer.name);
    const cpf = customer.cpf;

    if (!phone || phone.length < 12) {
      return new Response(JSON.stringify({ error: 'Telefone inválido' }), { status: 400 });
    }

    const now = Date.now();
    const radarInstance = Deno.env.get('RADAR_ZAPI_INSTANCE')!;
    const radarToken = Deno.env.get('RADAR_ZAPI_TOKEN')!;

    // Mensagem 1: enviar em 15 minutos
    const msg1 = `*Seu monitoramento está ativo* ✅\n\nAvisaremos assim que surgir um novo processo em seu nome.\n\n🔍 *Veja seus processos atuais* clicando aqui: escavador.com/busca?q=${cpf}`;

    // Mensagem 2: enviar em 16 minutos (15 + 1)
    const msg2 = `🚨 Oi ${nome}, tudo bem?\n\nIdentificamos que se alguém pesquisar seu nome no Google agora, um familiar, um cliente, um vizinho, vai encontrar *todos os seus processos judiciais expostos no JusBrasil e Escavador.*\n\nIsso pode te prejudicar numa vaga de emprego, na aprovação de um crédito ou simplesmente *manchar sua reputação* com quem você convive.\n\nNós escondemos isso. Rápido, sem burocracia, por R$397 (pagamento único - cobre todos os processos, atuais e futuros).\n\nQuer resolver agora? É só clicar aqui:\nhttps://pay.cakto.com.br/32mm37f_781601?sck=whatsapp`;

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('mensagens_agendadas').insert([
      {
        produto: 'radar-juridico',
        origem: 'radar-juridico-cakto-boas-vindas',
        phone,
        message: msg1,
        zapi_instance: radarInstance,
        zapi_token: radarToken,
        enviar_em: new Date(now + 15 * 60 * 1000).toISOString(),
      },
      {
        produto: 'radar-juridico',
        origem: 'radar-juridico-cakto-boas-vindas',
        phone,
        message: msg2,
        zapi_instance: radarInstance,
        zapi_token: radarToken,
        enviar_em: new Date(now + 16 * 60 * 1000).toISOString(),
      },
    ]);

    if (error) {
      console.error('Erro ao agendar boas-vindas:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log(`Boas-vindas agendadas para ${nome} (${phone}): msg1 em 15min, msg2 em 16min`);
    return new Response(JSON.stringify({ ok: true, phone, nome, msgs_agendadas: 2 }), { status: 200 });

  } catch (err) {
    console.error('Erro na função radar-juridico-cakto-boas-vindas:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
