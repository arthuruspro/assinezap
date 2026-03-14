/**
 * Helper Anthropic API (Claude Opus 4.6)
 * Máquina de Criativos 80/20 — Radar Jurídico
 *
 * Gera copies, analisa métricas, cria conclusões
 */

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const MODEL = 'claude-opus-4-6'; // Claude Opus 4.6

function getApiKey(): string {
  return Deno.env.get('ANTHROPIC_API_KEY')!;
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
    'anthropic-version': '2023-06-01',
  };
}

// ═══════════════════════════════════════════════════
// INTERFACE GENÉRICA
// ═══════════════════════════════════════════════════

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Envia mensagem pro Claude e retorna a resposta. */
export async function chat(
  systemPrompt: string,
  messages: ClaudeMessage[],
  maxTokens = 4096,
): Promise<ClaudeResponse> {
  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`Anthropic API Error: ${data.error.message} (type: ${data.error.type})`);
  }

  const textBlock = (data.content as Array<{ type: string; text: string }>)
    .find(b => b.type === 'text');

  return {
    text: textBlock?.text || '',
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

// ═══════════════════════════════════════════════════
// GERAÇÃO DE COPIES
// ═══════════════════════════════════════════════════

export interface CopyGerada {
  headline: string;
  texto: string;
  angulo: string;
}

/**
 * Gera copies pra Facebook Ads do Radar Jurídico.
 * Split configurável: X similares aos winners + Y diferentes (default 7/3).
 * No ciclo 1 (sem dados), distribui entre os ângulos.
 */
export async function gerarCopies(
  historicoWinners: string,
  historicoLosers: string,
  conclusoes: string,
  cicloAtual: number,
  numCriativos = 10,
  splitSimilares?: number,
): Promise<CopyGerada[]> {
  const systemPrompt = `Você é um copywriter especialista em Facebook Ads para o produto Radar Jurídico.

PRODUTO:
- Radar Jurídico: monitora processos judiciais e envia alertas de movimentação no WhatsApp.
- Preço: R$147/mês
- Público: empresários, autônomos, pessoas comuns com CPF (NÃO exclusivo pra advogados)

FORMATO DE CADA CRIATIVO:
Cada criativo tem 2 textos que vão NA IMAGEM do anúncio:
1. HEADLINE (máximo 10 palavras) — frase impactante que para o scroll, texto grande e vermelho
2. TEXTO (máximo 15 palavras) — complementa/reforça a headline, texto menor e preto

Total headline + texto: máximo 25 palavras.
O restante do anúncio (título, descrição, CTA) é fixo e genérico.

ÂNGULOS DISPONÍVEIS:
1. MEDO DE BLOQUEIO BANCÁRIO — bloqueio judicial de surpresa
2. NÃO SABER SE TEM PROCESSO — ignorância sobre situação jurídica
3. CONVENIÊNCIA / WHATSAPP — facilidade, paz de espírito
4. ADVOGADO CARO E LENTO — caro, demora
5. CONSEQUÊNCIAS GRAVES — escalada: intimação→multa→bloqueio→prisão
6. PROCESSO TRABALHISTA — ex-funcionário, Receita Federal
7. PREÇO / CUSTO-BENEFÍCIO — R$147 vs prejuízo de bloqueio
8. ANTES/DEPOIS — contraste sem vs com monitoramento

REGRAS ABSOLUTAS:
- Linguagem simples, como brasileiro comum fala no dia a dia
- Uma ideia por criativo
- A copy PRECISA deixar claro que é sobre PROCESSOS JUDICIAIS
- Se headline não menciona "processo", "CPF" ou "justiça", o texto precisa fechar
- NUNCA: jargão jurídico técnico, jargão de marketing, emojis, hashtags
- NUNCA: "Você sabia que...?", exageros, frases genéricas
- NUNCA: repetir uma copy que já flopou

FORMATO DE RESPOSTA:
Retorne EXATAMENTE um JSON array com ${numCriativos} objetos. Nenhum texto antes ou depois.
Cada objeto: {"headline":"...","texto":"...","angulo":"nome do ângulo"}`;

  let userPrompt: string;

  if (cicloAtual <= 1 || (!historicoWinners.trim() && !historicoLosers.trim())) {
    // Ciclo 1: sem dados, distribuir entre ângulos
    userPrompt = `Este é o CICLO 1 (sem dados anteriores). Crie ${numCriativos} copies distribuídas entre os ângulos disponíveis, variando de forma equilibrada.

Retorne APENAS o JSON array com ${numCriativos} objetos, sem markdown, sem \`\`\`, sem explicação.`;
  } else {
    const similares = splitSimilares != null ? splitSimilares : Math.min(5, numCriativos);
    const diferentes = numCriativos - similares;
    userPrompt = `CICLO ${cicloAtual}. Analise o histórico e gere ${numCriativos} copies.

WINNERS ATUAIS (20% melhores — inspire-se neles):
${historicoWinners || '(nenhum winner ainda)'}

LOSERS (80% piores — NÃO repetir esses padrões):
${historicoLosers || '(nenhum loser ainda)'}

CONCLUSÕES ACUMULADAS:
${conclusoes || '(nenhuma conclusão ainda)'}

GERE:
- ${similares} copies SIMILARES aos winners (mesmo ângulo/estilo, variações de palavras)${diferentes > 0 ? `\n- ${diferentes} copies COMPLETAMENTE DIFERENTES dos winners E dos losers (ângulo novo, abordagem nova)` : ''}

Retorne APENAS o JSON array com ${numCriativos} objetos, sem markdown, sem \`\`\`, sem explicação.`;
  }

  const response = await chat(systemPrompt, [
    { role: 'user', content: userPrompt },
  ], 4096);

  // Parse JSON da resposta
  let copies: CopyGerada[];
  try {
    // Limpar possíveis ```json ``` ao redor
    let cleaned = response.text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    copies = JSON.parse(cleaned);
  } catch {
    throw new Error(`Falha ao parsear JSON do Claude: ${response.text.substring(0, 200)}...`);
  }

  if (!Array.isArray(copies) || copies.length !== numCriativos) {
    throw new Error(`Claude retornou ${Array.isArray(copies) ? copies.length : 'não-array'} copies, esperava ${numCriativos}`);
  }

  return copies;
}

// ═══════════════════════════════════════════════════
// VALIDAÇÃO DE COPIES
// ═══════════════════════════════════════════════════

const PALAVRAS_PROIBIDAS = [
  'jurisprudência', 'petição inicial', 'despacho', 'tutela antecipada',
  'agravo', 'mandado de segurança', 'litispendência', 'solução inovadora',
  'plataforma robusta', 'revolucionário', 'o melhor do brasil',
];

export interface ValidacaoResult {
  valido: boolean;
  motivo?: string;
}

/** Valida uma copy conforme regras do briefing. */
export function validarCopy(copy: CopyGerada): ValidacaoResult {
  const headlineWords = copy.headline.trim().split(/\s+/).length;
  if (headlineWords > 10) {
    return { valido: false, motivo: `Headline tem ${headlineWords} palavras (máx 10)` };
  }

  const textoWords = copy.texto.trim().split(/\s+/).length;
  if (textoWords > 15) {
    return { valido: false, motivo: `Texto tem ${textoWords} palavras (máx 15)` };
  }

  const totalWords = headlineWords + textoWords;
  if (totalWords > 25) {
    return { valido: false, motivo: `Total ${totalWords} palavras (máx 25)` };
  }

  const textoLower = `${copy.headline} ${copy.texto}`.toLowerCase();
  for (const proibida of PALAVRAS_PROIBIDAS) {
    if (textoLower.includes(proibida.toLowerCase())) {
      return { valido: false, motivo: `Contém palavra proibida: "${proibida}"` };
    }
  }

  // Verifica se menciona processos judiciais (headline OU texto)
  const contextWords = ['processo', 'cpf', 'justiça', 'judicial', 'tribunal',
    'bloqueio', 'intimação', 'multa', 'prisão', 'conta bloqueada',
    'mandado', 'whatsapp', 'monitorar', 'monitoramento'];
  const hasContext = contextWords.some(w => textoLower.includes(w));
  if (!hasContext) {
    return { valido: false, motivo: 'Copy não deixa claro que é sobre processos judiciais' };
  }

  return { valido: true };
}

/**
 * Gera copies com validação e retry automático.
 * Se alguma copy falhar validação, regenera (máx 3 tentativas).
 */
export async function gerarCopiesValidadas(
  historicoWinners: string,
  historicoLosers: string,
  conclusoes: string,
  cicloAtual: number,
  numCriativos = 10,
  splitSimilares?: number,
): Promise<CopyGerada[]> {
  const maxTentativas = 3;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    console.log(`📝 Gerando ${numCriativos} copies (tentativa ${tentativa}/${maxTentativas})...`);
    const copies = await gerarCopies(historicoWinners, historicoLosers, conclusoes, cicloAtual, numCriativos, splitSimilares);

    const copiesValidas: CopyGerada[] = [];
    const copiesInvalidas: { copy: CopyGerada; motivo: string }[] = [];

    for (const copy of copies) {
      const result = validarCopy(copy);
      if (result.valido) {
        copiesValidas.push(copy);
      } else {
        copiesInvalidas.push({ copy, motivo: result.motivo! });
      }
    }

    console.log(`✅ ${copiesValidas.length} válidas, ❌ ${copiesInvalidas.length} inválidas`);

    if (copiesInvalidas.length > 0) {
      for (const inv of copiesInvalidas) {
        console.log(`  ❌ "${inv.copy.headline}" — ${inv.motivo}`);
      }
    }

    // Se todas válidas ou última tentativa, retorna o que tem
    if (copiesValidas.length >= numCriativos || tentativa === maxTentativas) {
      if (copiesValidas.length < numCriativos) {
        console.warn(`⚠️ Apenas ${copiesValidas.length}/${numCriativos} copies válidas após ${maxTentativas} tentativas`);
      }
      return copiesValidas.slice(0, numCriativos);
    }
  }

  // Nunca deve chegar aqui
  throw new Error('gerarCopiesValidadas: falha inesperada');
}

// ═══════════════════════════════════════════════════
// CONCLUSÕES
// ═══════════════════════════════════════════════════

export interface Conclusao {
  conclusao: string;
  evidencia: string;
  confianca: 'baixa' | 'media' | 'alta';
}

/** Gera conclusões analisando winners vs losers. */
export async function gerarConclusoes(
  winners: string,
  losers: string,
  conclusoesAnteriores: string,
  cicloAtual: number,
): Promise<Conclusao[]> {
  const systemPrompt = `Você é um analista de performance de Facebook Ads. Seu trabalho é identificar PADRÕES nos criativos que funcionam (winners) vs os que flopam (losers).

Responda as 10 perguntas abaixo com base nos dados:
1. Qual ÂNGULO aparece mais entre os winners?
2. Qual ÂNGULO aparece mais entre os losers?
3. Qual TIPO DE HEADLINE ganha? (pergunta? afirmação? número? provocação?)
4. Qual TIPO DE HEADLINE perde?
5. Qual TAMANHO de copy performa melhor? (curta ou longa?)
6. Alguma PALAVRA aparece em todos os winners? Qual?
7. Alguma PALAVRA aparece em todos os losers? Qual?
8. O que os winners têm em COMUM entre si?
9. O que os losers têm em COMUM entre si?
10. Algum padrão NOVO surgiu nesse ciclo que não existia antes?

Retorne APENAS um JSON array de conclusões, sem markdown.
Cada conclusão: {"conclusao":"...","evidencia":"IDs dos criativos","confianca":"baixa"}
Confiança: "baixa" (1 ciclo), "media" (reforça padrão anterior), "alta" (4+ ciclos confirmando)`;

  const userPrompt = `CICLO ${cicloAtual}

WINNERS (20% melhores):
${winners || '(nenhum)'}

LOSERS (80% piores):
${losers || '(nenhum)'}

CONCLUSÕES ANTERIORES (pra comparar e reforçar/contradizer):
${conclusoesAnteriores || '(nenhuma)'}

Analise e retorne as conclusões. APENAS JSON array, sem \`\`\`, sem explicação.`;

  const response = await chat(systemPrompt, [
    { role: 'user', content: userPrompt },
  ], 4096);

  let conclusoes: Conclusao[];
  try {
    let cleaned = response.text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    conclusoes = JSON.parse(cleaned);
  } catch {
    throw new Error(`Falha ao parsear conclusões do Claude: ${response.text.substring(0, 200)}...`);
  }

  return conclusoes;
}
