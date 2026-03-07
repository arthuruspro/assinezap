/**
 * Processador de mensagens agendadas — substitui TODOS os Wait nodes do n8n
 *
 * Gatilho: cron-job.org ou pg_cron a cada 1 minuto
 * Ação: Busca mensagens pendentes onde enviar_em <= agora, envia via Z-API, marca como enviada
 * Retry: até 3 tentativas, depois marca como 'erro'
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabase-client.ts';
import { sendText } from '../_shared/zapi.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const supabase = getSupabaseClient();
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;

    // Buscar mensagens pendentes que já devem ser enviadas
    const { data: mensagens, error } = await supabase
      .from('mensagens_agendadas')
      .select('*')
      .eq('status', 'pendente')
      .lte('enviar_em', new Date().toISOString())
      .lt('tentativas', 3)
      .order('enviar_em', { ascending: true })
      .limit(50); // Processa no máximo 50 por execução

    if (error) {
      console.error('Erro ao buscar mensagens:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!mensagens || mensagens.length === 0) {
      return new Response(JSON.stringify({ processadas: 0, erros: 0 }), { status: 200 });
    }

    let processadas = 0;
    let erros = 0;

    for (const msg of mensagens) {
      try {
        // Enviar via Z-API usando instance/token da mensagem
        await sendText(
          {
            instanceId: msg.zapi_instance,
            token: msg.zapi_token,
            clientToken,
          },
          msg.phone,
          msg.message
        );

        // Marcar como enviada
        await supabase
          .from('mensagens_agendadas')
          .update({
            status: 'enviada',
            enviada_em: new Date().toISOString(),
          })
          .eq('id', msg.id);

        processadas++;
        console.log(`✅ Msg ${msg.id} enviada para ${msg.phone} (${msg.produto}/${msg.origem})`);
      } catch (err) {
        const tentativas = msg.tentativas + 1;
        await supabase
          .from('mensagens_agendadas')
          .update({
            tentativas,
            status: tentativas >= 3 ? 'erro' : 'pendente',
            erro: (err as Error).message,
          })
          .eq('id', msg.id);

        erros++;
        console.error(`❌ Msg ${msg.id} falhou (tentativa ${tentativas}):`, (err as Error).message);
      }
    }

    console.log(`Processamento concluído: ${processadas} enviadas, ${erros} erros`);
    return new Response(JSON.stringify({ processadas, erros }), { status: 200 });

  } catch (err) {
    console.error('Erro na função enviar-mensagens-agendadas:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
