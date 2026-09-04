const OPENAI_URL = 'https://api.openai.com/v1/responses';

// Simple in-memory limiter for basic abuse protection on a single serverless instance.
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 20;
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now); hits.set(ip, arr); return true;
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host && !originHost.endsWith('.vercel.app')) {
        return res.status(403).json({ error: 'Invalid origin' });
      }
    } catch {}
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
  if (!allowed(ip)) return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });

  const message = clean(req.body?.message, 5000);
  if (!message) return res.status(400).json({ error: 'Please enter a question.' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'AI service is not configured yet.' });

  const packages = Array.isArray(req.body?.packages) ? req.body.packages.slice(0, 100) : [];
  const currentSelection = req.body?.currentSelection || null;
  const seasonData = req.body?.seasonData || {};

  const instructions = `You are HUNDY GUIDE, the official AI travel assistant for Hunder Travelogues.

Your role:
- Understand complex, multi-part questions naturally and answer them completely.
- Be an expert travel assistant. You may answer general travel questions, destination questions, itineraries, seasons, weather, transport, safety, packing, routes and trip planning.
- Use web research whenever current, changing, local, factual, or time-sensitive travel information would improve the answer. Do not pretend to have live information if you did not research it.
- Combine web research with the official Hunder Travelogues data supplied below.
- When recommending a Hunder Travelogues package, recommend ONLY combinations that actually exist in the supplied package data. Never invent an official Hunder package.
- If the user asks how to use the website: explain that they first select trip duration, then choose the main destination, then select the available planned destination combinations/sub-destinations, review trip details, fill the confirmation form and proceed to WhatsApp.
- Be helpful, conversational and practical. If a question has several requirements, address every requirement.
- For high-stakes safety, legal, visa, medical, or emergency issues, advise checking official/local authorities where appropriate.

OFFICIAL HUNDER PACKAGES:\n${JSON.stringify(packages)}\n\nCURRENT CUSTOMER SELECTION:\n${JSON.stringify(currentSelection)}\n\nSEASONAL KNOWLEDGE BASE:\n${JSON.stringify(seasonData)}`;

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        instructions,
        input: message,
        tools: [{ type: 'web_search' }],
        tool_choice: 'auto',
        store: false
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'AI request failed.' });
    }

    const answer = data.output_text || data.output?.flatMap(item =>
      item.type === 'message' ? (item.content || []).map(c => c.text || '').filter(Boolean) : []
    ).join('\n') || 'I could not generate an answer.';

    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(500).json({ error: 'HUNDY could not reach the AI service right now.' });
  }
};
