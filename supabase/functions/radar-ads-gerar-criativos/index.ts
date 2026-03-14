/**
 * Edge Function: radar-ads-gerar-criativos
 *
 * Passo 1 do ciclo diário:
 * 1. Lê histórico (winners, losers, conclusões) do banco
 * 2. Chama Claude Opus 4.6 pra gerar 10 copies
 * 3. Valida cada copy
 * 4. Gera 10 imagens PNG (SVG→resvg)
 * 5. Salva imagens no Supabase Storage
 * 6. Salva criativos no banco com status 'pendente'
 *
 * Trigger: chamado pelo orquestrador do ciclo ou manualmente
 */

import { getSupabaseClient } from '../_shared/supabase-client.ts';
import { gerarCopiesValidadas, type CopyGerada } from '../_shared/anthropic.ts';
import { initImageGen, gerarImagemPNG } from '../_shared/image-gen.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const sb = getSupabaseClient();

    // 1. Determinar ciclo atual + ler config da campanha
    const { data: config } = await sb
      .from('radar_ads_config')
      .select('ciclo_atual, campanha_config')
      .single();

    // deno-lint-ignore no-explicit-any
    const cc: Record<string, any> = config?.campanha_config || {};
    const CRIATIVOS_POR_CICLO = cc.criativos_por_ciclo || 5;
    const SPLIT_SIMILARES = cc.split_similares != null ? cc.split_similares : 5;

    const novoCiclo = (config?.ciclo_atual || 0) + 1;
    console.log(`🔄 Iniciando geração para Ciclo ${novoCiclo} (${CRIATIVOS_POR_CICLO} criativos, split ${SPLIT_SIMILARES}/${CRIATIVOS_POR_CICLO - SPLIT_SIMILARES})`);

    // 2. Criar registro do ciclo
    await sb.from('radar_ads_ciclos').insert({
      numero_ciclo: novoCiclo,
      total_criativos: CRIATIVOS_POR_CICLO,
    });

    // 3. Ler histórico de criativos do banco
    const { data: todosAtivos } = await sb
      .from('radar_ads_criativos')
      .select('id, headline, texto, angulo, cpa, cpic, cpc, cpm, spend, impressions, status, rank_geral')
      .in('status', ['ativo', 'morto', 'extensao'])
      .order('rank_geral', { ascending: true, nullsFirst: false });

    const criativos = todosAtivos || [];
    const total = criativos.length;
    const cutoff = Math.floor(total * 0.2);

    const winners = criativos.filter(c => c.status === 'ativo' && c.rank_geral && c.rank_geral <= cutoff);
    const losers = criativos.filter(c => c.status === 'morto' || (c.rank_geral && c.rank_geral > cutoff));

    const winnersStr = winners.map(w =>
      `#${w.rank_geral} [${w.angulo}] Headline:"${w.headline}" Texto:"${w.texto}" — CPA:${w.cpa || '-'} CPIC:${w.cpic || '-'} CPC:${w.cpc || '-'} CPM:${w.cpm || '-'}`
    ).join('\n');

    const losersStr = losers.slice(0, 30).map(l =>
      `#${l.rank_geral} [${l.angulo}] Headline:"${l.headline}" Texto:"${l.texto}" — CPA:${l.cpa || '-'} CPIC:${l.cpic || '-'} CPC:${l.cpc || '-'} CPM:${l.cpm || '-'}`
    ).join('\n');

    // 4. Ler conclusões
    const { data: conclusoesData } = await sb
      .from('radar_ads_conclusoes')
      .select('ciclo, conclusao, confianca')
      .order('criado_em', { ascending: false })
      .limit(20);

    const conclusoesStr = (conclusoesData || []).map(c =>
      `[Ciclo ${c.ciclo}] (${c.confianca}) ${c.conclusao}`
    ).join('\n');

    // 5. Gerar copies via Claude
    console.log('📝 Chamando Claude pra gerar copies...');
    const copies = await gerarCopiesValidadas(winnersStr, losersStr, conclusoesStr, novoCiclo, CRIATIVOS_POR_CICLO, SPLIT_SIMILARES);
    console.log(`✅ ${copies.length} copies geradas e validadas`);

    // 6. Inicializar gerador de imagens
    await initImageGen();

    // 7. Gerar imagens e salvar
    const criativosSalvos: Array<{ id: number; headline: string }> = [];

    for (let i = 0; i < copies.length; i++) {
      const copy = copies[i];
      console.log(`🖼️ [${i + 1}/${copies.length}] Gerando imagem: "${copy.headline.substring(0, 40)}"`);

      // Gerar PNG
      const pngBytes = gerarImagemPNG({
        headline: copy.headline,
        texto: copy.texto,
      });

      // Upload pro Supabase Storage
      const fileName = `ciclo_${novoCiclo}_criativo_${i + 1}.png`;
      const { error: uploadError } = await sb.storage
        .from('radar-ads-criativos')
        .upload(fileName, pngBytes, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error(`❌ Erro upload ${fileName}:`, uploadError);
        continue;
      }

      // Pegar URL pública
      const { data: urlData } = sb.storage
        .from('radar-ads-criativos')
        .getPublicUrl(fileName);

      // Salvar no banco
      const { data: criativo, error: insertError } = await sb
        .from('radar_ads_criativos')
        .insert({
          ciclo: novoCiclo,
          headline: copy.headline,
          texto: copy.texto,
          primary_text: '', // não usado — só headline + texto na imagem
          angulo: copy.angulo,
          status: 'pendente',
          imagem_url: urlData.publicUrl,
        })
        .select('id, headline')
        .single();

      if (insertError) {
        console.error(`❌ Erro ao salvar criativo:`, insertError);
        continue;
      }

      criativosSalvos.push(criativo);
    }

    // 8. Atualizar ciclo atual no config
    await sb
      .from('radar_ads_config')
      .update({ ciclo_atual: novoCiclo, atualizado_em: new Date().toISOString() })
      .eq('id', 1);

    console.log(`✅ Ciclo ${novoCiclo}: ${criativosSalvos.length} criativos gerados e salvos`);

    return jsonResponse({
      ok: true,
      ciclo: novoCiclo,
      criativos: criativosSalvos.length,
      detalhes: criativosSalvos,
    });

  } catch (err) {
    console.error('❌ Erro em radar-ads-gerar-criativos:', err);
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
