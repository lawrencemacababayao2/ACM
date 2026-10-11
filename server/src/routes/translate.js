import { Router } from 'express';
import { pool } from '../config/db.js';
import { wrap, HttpError } from '../lib/utils.js';

const router = Router();

const LANG_TARGETS = {
  bis: 'Bisaya (Cebuano)',
  ceb: 'Bisaya (Cebuano)',
  fil: 'Filipino (Tagalog)',
  tag: 'Filipino (Tagalog)',
};

const CHUNK_SIZE = 30;

function normalize(texts) {
  const out = [];
  for (const t of texts ?? []) {
    if (typeof t === 'string' && t.trim()) out.push(t.trim());
  }
  return [...new Set(out)];
}

function extractJsonArray(content) {
  if (!content) return [];
  try {
    const v = JSON.parse(content);
    if (Array.isArray(v)) return v;
  } catch { /* fall through */ }
  const m = String(content).match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const v = JSON.parse(m[0]);
      if (Array.isArray(v)) return v;
    } catch { /* ignore */ }
  }
  return [];
}

async function translateChunk(chunk, target) {
  const apiKey = process.env.LLM_API_KEY || '';
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  const system =
    'You are a professional translator working for a municipal agriculture office in the Philippines.\n' +
    `Translate the JSON array of ${chunk.length} strings below into ${target}.\n` +
    'Strict requirements:\n' +
    '- Return ONLY a single valid JSON array with exactly the same number of items and in the same order.\n' +
    '- Do not translate proper nouns, place names, numbers, percentages, URLs, phone numbers, or email addresses.\n' +
    '- Keep formatting (%, &, dates, numbers) intact.\n' +
    '- Use natural local terminology that farmers, fisherfolk, and residents understand.';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:5174',
      'X-Title': 'AgriConnect Medina - Translator',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(chunk) },
      ],
      max_tokens: 4000,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, `Translation API error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return extractJsonArray(data?.choices?.[0]?.message?.content);
}

// POST /api/translate  { texts: string[], lang: 'bis' | 'en' }
router.post('/', wrap(async (req, res) => {
  const lang = String(req.body.lang || 'bis');
  const target = LANG_TARGETS[lang];
  if (!target) throw new HttpError(400, 'Unsupported language');

  const texts = normalize(req.body.texts);
  if (!texts.length) return res.json([]);
  if (texts.length > 200) throw new HttpError(400, 'Too many texts (max 200 per request)');

  const apiKey = process.env.LLM_API_KEY || '';
  if (!apiKey) return res.json(texts);

  const [cached] = await pool.query(
    'SELECT source_text, translated FROM translations WHERE lang = ? AND source_text IN (?)',
    [lang, texts]
  );
  const cache = {};
  for (const c of cached) cache[c.source_text] = c.translated;

  const missing = texts.filter((t) => !(t in cache));
  const fresh = {};

  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE);
    const translated = await translateChunk(chunk, target);
    for (let j = 0; j < chunk.length; j++) {
      const v = translated[j];
      fresh[chunk[j]] = (typeof v === 'string' && v.trim()) ? v.trim() : chunk[j];
    }
  }

  const keys = Object.keys(fresh);
  if (keys.length) {
    const values = keys.map((t) => [t, lang, fresh[t]]);
    await pool.query(
      'INSERT INTO translations (source_text, lang, translated) VALUES ? ON DUPLICATE KEY UPDATE translated = VALUES(translated)',
      [values]
    );
  }

  res.json(texts.map((t) => cache[t] ?? fresh[t] ?? t));
}));

export default router;