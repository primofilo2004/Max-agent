export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { ticker, name, type } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  let system, user;

  if (type === 'macro') {
    system = `Sei MAX, analista macro per trading warrants. Rispondi SOLO in italiano. Restituisci SOLO questo JSON senza markdown:
{"fed":"analisi Fed/tassi USA 1-2 frasi","bce":"analisi BCE/BTP 1-2 frasi","macro":"dato macro più importante oggi","sentiment":"Bullish/Bearish/Neutrale con motivazione","alert":"alert importante o stringa vuota","vix":"livello VIX e impatto sui warrants"}`;
    user = `Briefing macro ${new Date().toISOString().split("T")[0]} per trader warrants su azioni USA. Analizza: Fed, BCE, spread BTP-Bund, VIX, dati macro rilevanti di oggi.`;
  } else {
    system = `Sei MAX, analista senior di warrants. Rispondi SOLO in italiano. Restituisci SOLO questo JSON senza markdown:
{
  "bias": "CALL o PUT o NEUTRALE",
  "rischio": "Alto o Medio o Basso",
  "sentiment": "Bullish o Bearish o Neutrale",
  "earnings_date": "es. Agosto 2026 oppure N/D",
  "expiry_minima": "es. Dicembre 2026",
  "pre_earnings_action": "es. Liquidare 70% posizione prima degli earnings",
  "bullets": [
    "📰 NEWS: [fatto specifico con numeri reali]",
    "📈 PREZZO: [prezzo attuale, variazione % recente, trend]",
    "🎯 CATALYST: [prossimo evento e direzione attesa]",
    "👥 ANALISTI: [consensus, target price, upgrade/downgrade recenti]",
    "⚠️ RISCHIO: [rischio principale che invalida la view]"
  ],
  "strategia": "🟢 CALL / 🔴 PUT su ${ticker} | Strike: [prezzo] | Scadenza: [trimestre] | Perché: [motivazione concreta] | Stop: -25% warrant"
}
Ogni bullet DEVE avere dati reali: prezzi, percentuali, date, nomi. VIETATO essere vago.`;
    user = `Analizza ${name} (${ticker}) oggi ${new Date().toISOString().split("T")[0]}. Cerca news recenti, prezzo attuale, prossimi earnings, sentiment analisti. Regola: scadenza warrant = earnings + 3 mesi minimi.`;
  }

  // Prima chiamata
  const res1 = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    }),
  });

  const data1 = await res1.json();

  // Se il modello ha usato il web search, faccio il secondo turno
  if (data1.stop_reason === 'tool_use') {
    const messages = [
      { role: 'user', content: user },
      { role: 'assistant', content: data1.content },
      { role: 'user', content: data1.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'Search completed' }))
      },
    ];

    const res2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system,
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    const data2 = await res2.json();
    const text = data2.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    return new Response(JSON.stringify({ result: text }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const text = data1.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  return new Response(JSON.stringify({ result: text }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
