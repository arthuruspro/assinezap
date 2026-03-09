/**
 * AssineZap — Processar todas as mensagens recebidas no WhatsApp
 *
 * Gatilho: Webhook POST do Z-API (cada mensagem recebida)
 *
 * CAMINHO A — Mensagem de cliente:
 *   Filtros → Busca cliente → Verifica renovação → Switch estado:
 *     aguardando_pdf: valida PDF → salva URL → pede phone signatário
 *     aguardando_whatsapp: valida phone → cria signatário → envia doc + botão
 *
 * CAMINHO B — Aceite de assinatura:
 *   Busca signatário pendente → registra aceite → gera comprovante → envia a ambos → deleta
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabase-client.ts';
import { normalizePhoneZapi } from '../_shared/phone.ts';
import { sendText, sendDocument, sendButtonList, getAssinezapConfig } from '../_shared/zapi.ts';

const zapi = getAssinezapConfig();

function formatarData(iso: string | null): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function timestampBrasilia(): string {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  ).toISOString();
}

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
    const body = payload.body || payload;
    const supabase = getSupabaseClient();

    // ===== FILTROS =====
    if (body.fromMe) return ok('ignorado: fromMe');
    if (body.isGroup) return ok('ignorado: grupo');
    if (body.type !== 'ReceivedCallback') return ok('ignorado: não é ReceivedCallback');

    // ===== NORMALIZAR PHONE =====
    const { sem55: whatsapp_sem55, com55: whatsapp_com55 } = normalizePhoneZapi(body.phone || '');

    // ===== EXTRAIR TEXTO =====
    const texto = (
      body.text?.message ||
      body.listResponseMessage?.title ||
      body.buttonsResponseMessage?.message ||
      ''
    ).toUpperCase().trim();

    // ===== VERIFICAR SE É CÓDIGO DE ACEITE =====
    const isCodigoAceite = /^LI,? ACEITO E ASSINO/.test(texto);

    if (isCodigoAceite) {
      // ========== CAMINHO B: ACEITE DE ASSINATURA ==========
      const phone_raw = (body.phone || '').replace('@c.us', '').replace(/\D/g, '');
      let whatsapp_signatario = phone_raw.startsWith('55') ? phone_raw : '55' + phone_raw;
      // Normalizar: adicionar 9 se necessário
      const sem55sig = whatsapp_signatario.substring(2);
      if (sem55sig.length === 10) {
        whatsapp_signatario = '55' + sem55sig.substring(0, 2) + '9' + sem55sig.substring(2);
      }

      // Buscar signatário pendente
      const { data: signatarios } = await supabase
        .from('signatarios')
        .select('*')
        .eq('whatsapp_signatario', whatsapp_signatario)
        .is('timestamp_aceite', null);

      if (!signatarios || signatarios.length === 0) {
        return ok('ignorado: nenhum signatário pendente encontrado');
      }

      const registro = signatarios[0];

      // Registrar timestamp aceite
      const timestamp_aceite = timestampBrasilia();
      await supabase
        .from('signatarios')
        .update({ timestamp_aceite })
        .eq('id', registro.id);

      // Gerar comprovante texto
      const texto_comprovante = [
        '=== COMPROVANTE DE ASSINATURA ELETRONICA ===',
        '',
        `Documento: ${registro.nome_arquivo}`,
        `Enviado por: ${registro.nome_cliente}`,
        `Signatario (WhatsApp): ${registro.whatsapp_signatario}`,
        `Data e hora do envio: ${formatarData(registro.timestamp_envio)}`,
        `Data e hora do aceite: ${formatarData(timestamp_aceite)}`,
        `Resposta registrada: ${registro.codigo_aceito}`,
        '',
        '---',
        'Este comprovante atesta que o signatario acima recebeu, leu e aceitou o documento indicado, tendo validade juridica conforme a Medida Provisoria no 2.200-2/2001.',
        '=== FIM DO COMPROVANTE ===',
      ].join('\n');

      // Enviar comprovante ao signatário
      await sendText(zapi, registro.whatsapp_signatario, texto_comprovante);

      // Enviar "contrato assinado" + comprovante ao cliente
      const phone_sem55_sig = registro.whatsapp_signatario.replace(/^55/, '');
      await sendText(
        zapi,
        '55' + registro.whatsapp_cliente,
        `✅ *Seu contrato foi assinado!*\n\nAssinante: ${phone_sem55_sig}`
      );
      await sendText(
        zapi,
        '55' + registro.whatsapp_cliente,
        `Seu documento ${registro.nome_arquivo} foi assinado pelo signatario (${registro.whatsapp_signatario}).\n\n${texto_comprovante}`
      );

      // Deletar registro do signatário
      await supabase
        .from('signatarios')
        .delete()
        .eq('id', registro.id);

      return ok('aceite processado');

    } else {
      // ========== CAMINHO A: MENSAGEM DE CLIENTE ==========

      // Buscar cliente
      const { data: clientes } = await supabase
        .from('clientes')
        .select('*')
        .eq('whatsapp_cliente', whatsapp_sem55);

      const cliente = clientes && clientes.length > 0 ? clientes[0] : null;
      const ativo = cliente && cliente.status_cliente === 'ativo';

      if (!ativo) {
        await sendText(zapi, whatsapp_com55, 'Sua assinatura está inativa. Ative em assinezap.com');
        return ok('cliente inativo');
      }

      // ===== VERIFICAR RENOVAÇÃO 30 DIAS =====
      let contador_documentos = cliente.contador_documentos || 0;
      const renovacao = new Date(cliente.data_renovacao);
      const agora = new Date();

      if (renovacao <= agora) {
        // Expirou: renovar
        const nova_renovacao = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('clientes')
          .update({ contador_documentos: 0, data_renovacao: nova_renovacao })
          .eq('whatsapp_cliente', whatsapp_sem55);
        contador_documentos = 0;
      }

      // ===== SWITCH NO ESTADO =====
      const estado = cliente.estado_cliente;

      if (estado === 'aguardando_pdf') {
        // ----- ESTADO: AGUARDANDO PDF -----
        const isPdf = body.document && body.document.mimeType === 'application/pdf';

        if (!isPdf) {
          await sendText(zapi, whatsapp_com55, 'Por favor, envie o documento em formato PDF');
          return ok('não é PDF');
        }

        if (contador_documentos >= 100) {
          await sendText(zapi, whatsapp_com55, 'Voce atingiu o limite de 100 documentos do mes. Para aumentar seu limite: assinezap.com');
          return ok('limite atingido');
        }

        // Extrair URL e nome do documento
        const document_url = body.document?.documentUrl;
        const nome_arquivo = body.document?.fileName || `documento_${Date.now()}.pdf`;

        if (!document_url) {
          return ok('erro: URL do documento não encontrada');
        }

        // Salvar URL e mudar estado
        await supabase
          .from('clientes')
          .update({
            caminho_pdf: document_url,
            nome_arquivo,
            estado_cliente: 'aguardando_whatsapp',
            contador_documentos: contador_documentos + 1,
          })
          .eq('whatsapp_cliente', whatsapp_sem55);

        await sendText(zapi, whatsapp_com55, 'Agora me envie o WhatsApp do seu cliente no formato 11999999999');
        return ok('PDF recebido, aguardando phone');

      } else if (estado === 'aguardando_whatsapp') {
        // ----- ESTADO: AGUARDANDO WHATSAPP DO SIGNATÁRIO -----
        const textoMsg = (body.text?.message || '').trim();
        const isNumeroValido = /^\d{10,11}$/.test(textoMsg);

        if (!isNumeroValido) {
          await sendText(zapi, whatsapp_com55, 'Por favor, envie apenas o numero com DDD, ex: 11999999999');
          return ok('número inválido');
        }

        const whatsapp_signatario = '55' + textoMsg;

        // Buscar último código de aceite para este signatário
        const { data: ultimosSig } = await supabase
          .from('signatarios')
          .select('codigo_aceito')
          .eq('whatsapp_signatario', whatsapp_signatario)
          .order('id', { ascending: false })
          .limit(1);

        let proximo_numero = 1;
        if (ultimosSig && ultimosSig.length > 0 && ultimosSig[0].codigo_aceito) {
          const match = ultimosSig[0].codigo_aceito.match(/(\d+)$/);
          if (match) proximo_numero = parseInt(match[1]) + 1;
        }
        const codigo_aceito = `LI, ACEITO E ASSINO${proximo_numero}`;

        // Re-buscar dados completos do cliente
        const { data: clienteAtualArr } = await supabase
          .from('clientes')
          .select('*')
          .eq('whatsapp_cliente', whatsapp_sem55);

        const clienteAtual = clienteAtualArr && clienteAtualArr.length > 0 ? clienteAtualArr[0] : cliente;
        const timestamp_envio = timestampBrasilia();

        // Criar registro de signatário
        await supabase.from('signatarios').insert({
          codigo_aceito,
          whatsapp_signatario,
          whatsapp_cliente: whatsapp_sem55,
          nome_cliente: clienteAtual.nome_cliente,
          nome_arquivo: clienteAtual.nome_arquivo,
          caminho_pdf: 'stored_in_clientes_table',
          timestamp_envio,
        });

        // Enviar PDF ao signatário
        const document_url = clienteAtual.caminho_pdf;
        if (document_url) {
          await sendDocument(zapi, whatsapp_signatario, document_url, clienteAtual.nome_arquivo || 'documento.pdf');
        }

        // Enviar botão de aceite ao signatário
        await sendButtonList(
          zapi,
          whatsapp_signatario,
          `${clienteAtual.nome_cliente} enviou este documento para voce assinar.\nVoce declara que leu e aceita integralmente o documento acima?`,
          [{ id: '1', label: 'LI, ACEITO E ASSINO' }]
        );

        // Limpar PDF do cliente e voltar para aguardando_pdf
        await supabase
          .from('clientes')
          .update({
            caminho_pdf: null,
            nome_arquivo: null,
            estado_cliente: 'aguardando_pdf',
          })
          .eq('whatsapp_cliente', whatsapp_sem55);

        // Confirmar ao cliente
        await sendText(
          zapi,
          whatsapp_com55,
          'O pedido de assinatura foi enviado ao seu cliente. Assim que ele assinar, te envio o comprovante juridico.\n\nPara enviar um documento para outro cliente, e so me mandar o PDF aqui.'
        );

        return ok('signatário registrado e doc enviado');
      }

      return ok('estado desconhecido');
    }
  } catch (err) {
    console.error('Erro na função assinezap-whatsapp-processar-mensagem:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});

function ok(msg: string): Response {
  return new Response(JSON.stringify({ ok: true, msg }), { status: 200 });
}
