import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));
const PORT = process.env.PORT || 3000;
const TRUSTED_DOMAINS = ['reuters.com','bloomberg.com','cnbc.com','ft.com','wsj.com','marketwatch.com','investing.com','coindesk.com','theblock.co','cointelegraph.com','apnews.com','bbc.com'];
const TOPICS = {
  all: '(economy OR markets OR finance OR forex OR gold OR bitcoin OR cryptocurrency OR Federal Reserve OR inflation OR tariffs)',
  economy: '(economy OR inflation OR GDP OR jobs OR central bank OR Federal Reserve OR tariffs)',
  forex: '(forex OR currency OR dollar OR DXY OR EUR/USD OR USD/JPY OR bond yields)',
  gold: '(gold OR XAU/USD OR bullion OR precious metals)',
  crypto: '(bitcoin OR cryptocurrency OR crypto OR ethereum OR ETF)',
  fed: '("Federal Reserve" OR Fed OR FOMC OR interest rates OR Treasury yields)',
  geopolitics: '(geopolitics OR war OR sanctions OR tariffs OR trade dispute)'
};

const newsCache = new Map();
const CACHE_TTL = 60 * 1000;
let nextGdeltRequestAt = 0;
let gdeltQueue = Promise.resolve();

async function fetchGdelt(url) {
  const request = gdeltQueue.then(async () => {
    const wait = Math.max(0, nextGdeltRequestAt - Date.now());
    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    nextGdeltRequestAt = Date.now() + 5000;
    return fetch(url, {
      headers: { 'User-Agent': 'MarketPulse/1.0' },
      signal: AbortSignal.timeout(15000)
    });
  });

  gdeltQueue = request.then(() => undefined, () => undefined);
  return request;
}

function isTrusted(url) { try { const h = new URL(url).hostname.replace(/^www\./,''); return TRUSTED_DOMAINS.some(d => h === d || h.endsWith('.'+d)); } catch { return false; } }
function categorize(text='') { const t=text.toLowerCase(); if (/bitcoin|crypto|ethereum|coinbase|digital asset/.test(t)) return 'Crypto'; if (/gold|bullion|xau|precious metal/.test(t)) return 'Gold'; if (/forex|currency|dollar|eur\/usd|yen|sterling|dxy/.test(t)) return 'Forex'; if (/federal reserve|\bfed\b|fomc|interest rate|treasury yield/.test(t)) return 'Fed'; if (/war|sanction|tariff|geopolit|trade dispute/.test(t)) return 'Geopolitics'; return 'Economy'; }
app.get('/api/health', (_req,res)=>res.json({ok:true, aiConfigured:!!process.env.OPENAI_API_KEY, calendarConfigured:!!process.env.FINNHUB_API_KEY}));

app.get('/api/news', async (req, res) => {
  const topic = TOPICS[req.query.topic] ? req.query.topic : 'all';
  const trustedOnly = req.query.trusted === 'true';
  const cached = newsCache.get(topic);

  try {
    let articles;

    if (cached && Date.now() - cached.time < CACHE_TTL) {
      articles = cached.articles;
    } else {
      const query = `${TOPICS[topic]} (site:reuters.com OR site:bloomberg.com OR site:cnbc.com OR site:ft.com OR site:wsj.com OR site:marketwatch.com OR site:investing.com OR site:coindesk.com OR site:theblock.co OR site:cointelegraph.com OR site:apnews.com OR site:bbc.com)`;

      const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
      url.search = new URLSearchParams({
        query,
        mode: 'ArtList',
        format: 'json',
        sort: 'HybridRel',
        maxrecords: '50',
        timespan: '24h',
        sourcelang: 'english'
      }).toString();

      const response = await fetchGdelt(url);
      if (!response.ok) {
        throw new Error(`News provider returned ${response.status}`);
      }

      const data = await response.json();

      articles = (data.articles || [])
        .map(a => ({
          title: a.title,
          url: a.url,
          source: a.domain || new URL(a.url).hostname.replace(/^www\./, ''),
          publishedAt: a.seendate
            ? `${a.seendate.slice(0,4)}-${a.seendate.slice(4,6)}-${a.seendate.slice(6,8)}T${a.seendate.slice(9,11)}:${a.seendate.slice(11,13)}:${a.seendate.slice(13,15)}Z`
            : null,
          language: a.language,
          category: categorize(a.title),
          trusted: isTrusted(a.url)
        }))
        .filter(a => a.title && a.url);

      newsCache.set(topic, { articles, time: Date.now() });
    }

    if (trustedOnly) {
      articles = articles.filter(a => a.trusted);
    }

    res.json({
      articles,
      fetchedAt: cached && Date.now() - cached.time < CACHE_TTL
        ? new Date(cached.time).toISOString()
        : new Date().toISOString(),
      provider: 'GDELT',
      note: 'News discovery is near-real-time, not a guaranteed instant terminal feed.'
    });
  } catch (e) {
    if (cached) {
      let articles = cached.articles;
      if (trustedOnly) articles = articles.filter(a => a.trusted);

      return res.json({
        articles,
        fetchedAt: new Date(cached.time).toISOString(),
        provider: 'GDELT',
        note: 'Showing cached news because the provider is temporarily unavailable.'
      });
    }

    res.status(502).json({
      error: 'Could not fetch news right now.',
      detail: e.message
    });
  }
});

app.get('/api/calendar', async (req,res) => {
  if (!process.env.FINNHUB_API_KEY) return res.json({events:[],configured:false,message:'Add FINNHUB_API_KEY in hosting environment variables to enable the economic calendar.'});
  try {
    const date = new Date(); const from = req.query.from || date.toISOString().slice(0,10); const to = req.query.to || new Date(date.getTime()+7*86400000).toISOString().slice(0,10);
    const url = new URL('https://finnhub.io/api/v1/calendar/economic'); url.search = new URLSearchParams({from,to,token:process.env.FINNHUB_API_KEY}).toString();
    const r = await fetch(url); if (!r.ok) throw new Error(`Calendar provider returned ${r.status}`); const data = await r.json();
    res.json({events:(data.economicCalendar||[]).map(e=>({date:e.time||e.date,country:e.country,event:e.event,impact:e.impact,actual:e.actual,estimate:e.estimate,previous:e.prev,unit:e.unit,currency:e.currency})),configured:true,provider:'Finnhub'});
  } catch(e) { res.status(502).json({error:'Could not fetch economic calendar.',detail:e.message}); }
});
app.post('/api/analyze', async (req,res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({error:'AI analysis is not configured. Add OPENAI_API_KEY to your server environment.'});
  const {title,source,publishedAt,url} = req.body || {};
  if (!title || typeof title !== 'string' || title.length > 500) return res.status(400).json({error:'Provide a valid news headline.'});
  try {
    const prompt = `Analyze this financial news headline for an educational market-monitoring dashboard. Do not invent facts beyond the headline. Headline: ${title}\nSource: ${source||'Unknown'}\nPublished: ${publishedAt||'Unknown'}\nURL: ${url||'Unknown'}\nReturn concise JSON with fields: summary (one or two sentences, clearly note headline-only limitations), gold (Bullish/Bearish/Neutral/Mixed/Unclear), usd (same labels), bitcoin (same labels), confidence (Low/Medium/High), timeHorizon (Immediate/Intraday/1-3 days), drivers (array of up to 3 short strings), whatToVerify (array of up to 3 strings). Consider that USD/yields and gold can react inversely in some conditions, but do not assume the relationship always holds. If impact cannot be inferred from the headline, use Unclear. This is not financial advice.`;
    const r = await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a cautious financial-news analyst. Distinguish facts from inference, avoid fabricated details, and return valid JSON only.'},{role:'user',content:prompt}]})});
    const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || `AI provider returned ${r.status}`);
    const content = data.choices?.[0]?.message?.content; if (!content) throw new Error('Empty AI response');
    res.json({analysis:JSON.parse(content),model:data.model});
  } catch(e) { res.status(502).json({error:'AI analysis failed.',detail:e.message}); }
});
app.listen(PORT,()=>console.log(`MarketPulse running on port ${PORT}`));
