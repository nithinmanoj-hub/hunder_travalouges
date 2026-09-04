const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Simple abuse protection
const hits = new Map();

function allowed(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 15;

  const arr = (hits.get(ip) || []).filter(
    (t) => now - t < windowMs
  );

  if (arr.length >= limit) return false;

  arr.push(now);
  hits.set(ip, arr);

  return true;
}

function clean(value, max) {
  return typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';
}

module.exports = async (req, res) => {

  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  // Basic rate limiting
  const ip = (
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    'unknown'
  ).toString().split(',')[0].trim();

  if (!allowed(ip)) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute.'
    });
  }

  const message = clean(req.body?.message, 5000);

  if (!message) {
    return res.status(400).json({
      error: 'Please enter a question.'
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'Gemini AI is not configured yet.'
    });
  }

  const packages = Array.isArray(req.body?.packages)
    ? req.body.packages.slice(0, 100)
    : [];

  const currentSelection =
    req.body?.currentSelection || null;

  const seasonData =
    req.body?.seasonData || {};

  const systemPrompt = `
You are HUNDY GUIDE, the official AI travel assistant for Hunder Travelogues.

Your job is to help customers plan trips intelligently.

IMPORTANT RULES:

- Understand complex and multi-part questions.
- Answer every part of the customer's question.
- Be conversational, helpful and practical.
- Use the official Hunder Travelogues package information below.
- Never invent a Hunder Travelogues package that doesn't exist.
- When recommending packages, only recommend combinations found in the supplied package data.
- Help with destinations, seasons, weather, best time to visit, packing, routes, transport and trip planning.
- If asked how to use the Hunder Travelogues website, explain:

  1. Select trip duration.
  2. Select the main destination.
  3. Select available planned destinations/sub-destinations.
  4. Review the trip details.
  5. Fill the confirmation form.
  6. Proceed to WhatsApp.

- If the customer asks about the current trip they are selecting, use CURRENT CUSTOMER SELECTION.
- If information is uncertain or may change, clearly mention that conditions can change.

OFFICIAL HUNDER TRAVELOGUES PACKAGES:

${JSON.stringify(packages)}

CURRENT CUSTOMER SELECTION:

${JSON.stringify(currentSelection)}

SEASONAL KNOWLEDGE:

${JSON.stringify(seasonData)}
`;

  try {

    const response = await fetch(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({

          systemInstruction: {
            parts: [
              {
                text: systemPrompt
              }
            ]
          },

          contents: [
            {
              role: 'user',

              parts: [
                {
                  text: message
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500
          }

        })

      }
    );

    const data = await response.json();

    if (!response.ok) {

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          'Gemini AI request failed.'
      });

    }

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('') ||
      'I could not generate an answer.';

    return res.status(200).json({
      answer
    });

  } catch (error) {

    return res.status(500).json({
      error:
        'HUNDY could not reach the AI service right now.'
    });

  }

};
