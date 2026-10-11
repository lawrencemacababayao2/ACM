import { pool } from '../config/db.js';
import { formatTimeRange } from '../lib/utils.js';
import {
  targetLabel,
  audienceMatchSql,
  audienceMatchParams,
  publicMatchSql,
} from '../lib/targetTypes.js';
import { trainingLifecycle, programLifecycle } from '../lib/lifecycle.js';
import { REQUEST_CONFIG } from '../lib/requestConfig.js';
import rateLimits from '../config/rateLimits.js';

// NLP chatbot (ACM Assistant).
// Uses any OpenAI-compatible /chat/completions API when LLM_API_KEY is set.
// Falls back to keyword/intent matching over the FAQ knowledge base.

// Who the caller is decides which posts the assistant may draw on:
//
//   { kind: 'admin' }              staff -- no restriction
//   { kind: 'beneficiary', type }  a signed-in app user -- their own type, plus
//                                  'all' and 'public', the same rule the home feed
//                                  applies
//   { kind: 'public' }             the anonymous landing website -- general-public
//                                  posts ONLY, never anything aimed at registered
//                                  beneficiaries
//
// Returns a SQL fragment (empty for staff) and its bind params, so it can be
// appended to each table's WHERE. The audience column exists on programs,
// trainings and announcements alike.
function audienceClause(scope) {
  if (!scope || scope.kind === 'admin') return { sql: '', params: [] };
  if (scope.kind === 'beneficiary' && scope.type) {
    return { sql: ` AND ${audienceMatchSql()}`, params: audienceMatchParams(scope.type) };
  }
  return { sql: ` AND ${publicMatchSql()}`, params: [] };
}

async function loadPublishedPrograms(scope) {
  const { sql, params } = audienceClause(scope);
  const [programs] = await pool.query(
    `SELECT id, title, description, target_type, target_beneficiary_types, venue, schedule, end_at, cancelled
     FROM programs WHERE status = 'published' AND cancelled = 0${sql} ORDER BY title`,
    params
  );
  // Only still-relevant activities are listed: upcoming or ongoing.
  const current = programs.filter((p) => {
    const phase = programLifecycle(p);
    return phase === 'upcoming' || phase === 'ongoing';
  });
  if (!current.length) return [];
  const ids = current.map((p) => p.id);
  const [benefits] = await pool.query(
    `SELECT program_id, benefit FROM program_benefits
     WHERE program_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`,
    ids
  );
  const byProgram = benefits.reduce((acc, b) => {
    (acc[b.program_id] = acc[b.program_id] || []).push(b.benefit);
    return acc;
  }, {});
  return current.map((p) => ({ ...p, benefits: byProgram[p.id] || [] }));
}

// Same relevance rule as programs: only published, non-cancelled sessions that
// have not finished are surfaced to the assistant.
async function loadActiveTrainings(scope) {
  const { sql, params } = audienceClause(scope);
  const [rows] = await pool.query(
    `SELECT title, description, venue, event_date, start_time, end_time, status
     FROM trainings WHERE status <> 'cancelled' AND publish_status = 'published'${sql}
     ORDER BY event_date`,
    params
  );
  return rows.filter((t) => {
    const phase = trainingLifecycle(t);
    return phase === 'upcoming' || phase === 'ongoing';
  });
}

function formatProgramLine(p) {
  const parts = [`- **${p.title}**${p.description ? ' — ' + p.description : ''}`];
  if (p.benefits && p.benefits.length) parts.push(`  **Benefits:** ${p.benefits.join(', ')}`);
  const audience = targetLabel(p);
  if (audience) parts.push(`  **For:** ${audience}`);
  if (p.venue) parts.push(`  **Venue:** ${p.venue}`);
  if (p.schedule) parts.push(`  **Schedule:** ${String(p.schedule).slice(0, 16)}`);
  return parts.join('\n');
}

// Numbered variant of the same shape, for the "what programs do you have" answer.
function formatProgramDetail(p, n) {
  const parts = [`### ${n}. ${p.title}`];
  if (p.description) parts.push(`**Description:**\n${p.description}\n`);
  if (p.benefits && p.benefits.length) parts.push(`**Benefits:**\n${p.benefits.join('\n')}\n`);
  const audience = targetLabel(p);
  if (audience) parts.push(`**For:**\n${audience}\n`);
  if (p.venue) parts.push(`**Venue:**\n${p.venue}\n`);
  if (p.schedule) parts.push(`**Schedule:**\n${String(p.schedule).slice(0, 16)}\n`);
  return parts.join('\n');
}

// The office's request catalog: the equipment, services and supplies a
// registered beneficiary can ask the MAO for. It is general information about
// what the office offers rather than audience-targeted content, so every scope
// may draw on it -- it is exactly what the app's request form is built from.
function serviceCatalogText() {
  const lines = [];
  for (const cfg of Object.values(REQUEST_CONFIG)) {
    if (!cfg || !Array.isArray(cfg.options) || !cfg.options.length) continue;
    const items = cfg.options.map((o) => o.label).join(', ');
    lines.push(`- ${cfg.heading}: ${items}`);
  }
  return lines.join('\n');
}

async function buildSystemContext(scope) {
  const [faqs] = await pool.query('SELECT question, answer FROM faqs');
  const programs = await loadPublishedPrograms(scope);
  const trainings = await loadActiveTrainings(scope);
  const catalog = serviceCatalogText();

  let s =
  'You are "ACM Assistant", the official AI assistant of the Municipal Agriculture Office (MAO) of ' +
  'Medina, Misamis Oriental for the AgriConnect Medina system.\n\n' +

  'KNOWLEDGE RULES:\n' +
  '- Answer ONLY using the official information provided below.\n' +
  '- The ACTIVE PROGRAMS, UPCOMING TRAININGS and REQUEST CATALOG sections are the\n' +
  '  COMPLETE and AUTHORITATIVE lists. Never name a program, training, service, benefit,\n' +
  '  requirement, schedule or date that is not explicitly written in them.\n' +
  '- If a section is missing or empty, say plainly that nothing is available for that\n' +
  '  right now and suggest contacting the MAO office. Never invent items to fill the gap\n' +
  '  and never fall back on general knowledge about other agriculture offices.\n' +
  '- What a beneficiary may REQUEST is exactly the REQUEST CATALOG and nothing else. Never\n' +
  '  call something requestable just because an FAQ says the office provides it.\n' +
  '- NEVER reveal the personal data of any beneficiary, farmer, staff member or user (names,\n' +
  '  phone numbers, addresses, RSBSA numbers) and never describe how the system\'s database,\n' +
  '  internal routes, SMS/notification internals or staff-only tools work. Decline politely\n' +
  '  and tell the user to contact the MAO office.\n\n' +

  'LANGUAGE DETECTION:\n' +
  '- First identify the language used by the user.\n' +
  '- If the user writes in English, reply in English.\n' +
  '- If the user writes in Tagalog/Filipino, reply in Tagalog/Filipino.\n' +
  '- If the user writes in Bisaya/Cebuano, reply in Bisaya/Cebuano.\n' +
  '- If the user mixes English and Bisaya, reply naturally in Bisaya with common English words when appropriate.\n' +
  '- If the user mixes English and Tagalog, reply naturally in Tagalog with common English words when appropriate.\n' +
  '- Do not translate the user message unless they specifically ask for a translation.\n' +
  '- Do not change languages unnecessarily.\n' +
  '- Always answer in the same primary language as the users latest message.\n\n' +

  'RESPONSE STYLE:\n' +
  '- Write like a helpful ChatGPT-style assistant.\n' +
  '- Keep responses clear, readable, and well-spaced.\n' +
  '- NEVER put a long list of information into one paragraph.\n' +
  '- Put each item on its own section.\n' +
  '- Leave a blank line between sections.\n' +
  '- Use Markdown formatting when useful.\n' +
  '- Use **bold** for important labels.\n' +
  '- Use numbered lists for multiple items.\n' +
  '- Use bullet points for short lists.\n' +
  '- Use headings for separate programs or major topics.\n' +
  '- Keep answers concise unless the user asks for more details.\n\n';

  // The layout examples are only added when there is data to lay out. If one
  // were always present the model tends to copy the placeholder rows verbatim
  // when a section is empty, printing "Program Name"/"Another Program" as if
  // they were real entries.
  if (programs.length) {
    s +=
    'PROGRAM FORMAT:\n' +
    'When listing programs, use this structure, repeating the block per program:\n\n' +
    'Here are the available programs from the MAO of Medina:\n\n' +
    '### 1. <program title>\n\n' +
    '**Description:**\n' +
    '<the program description>\n\n' +
    '**Benefits:**\n' +
    '<what beneficiaries get>\n\n' +
    '**Schedule:**\n' +
    '<when or where it is available>\n\n' +
    'Do not combine Description, Benefits, and Schedule into one paragraph, and never\n' +
    'print the placeholder text itself.\n\n';
  }

  if (trainings.length) {
    s +=
    'TRAININGS FORMAT:\n' +
    'When listing upcoming trainings, use this structure, repeating the block per training:\n\n' +
    'Here are the upcoming trainings from the MAO of Medina:\n\n' +
    '### 1. <training title>\n\n' +
    '**Date:**\n' +
    '<date and time>\n\n' +
    '**Venue:**\n' +
    '<location>\n\n' +
    '**Description:**\n' +
    '<short description>\n\n' +
    'Never print the placeholder text itself.\n\n';
  }

  if (catalog) {
    s +=
    'REQUEST CATALOG FORMAT:\n' +
    'When asked what services, equipment or supplies can be requested or availed, list the\n' +
    'items from the REQUEST CATALOG below, grouped by beneficiary type (a heading per group\n' +
    'and a bullet per item). A beneficiary sends a request in the AgriConnect Medina app\n' +
    '(sign in, tap +, choose the item, fill in the details, submit) and the MAO reviews and\n' +
    'schedules it. The catalog is the ONLY list of requestable items: do not add anything\n' +
    'that is not in it, and never say an item can be requested when it only appears in an\n' +
    'FAQ. Do not invent items.\n\n';
  }

  if (faqs.length) {
    s += '=== OFFICIAL FAQS ===\n' +
      faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n') + '\n\n';
  }
  if (programs.length) {
    s += '=== ACTIVE PROGRAMS ===\n' +
      programs
        .map(formatProgramLine)
        .join('\n') + '\n\n';
  }
  if (trainings.length) {
    s += '=== UPCOMING TRAININGS / SEMINARS ===\n' +
      trainings
        .map(t => {
          const time = formatTimeRange(t.start_time, t.end_time);
          return `- ${t.title}${t.description ? ' — ' + t.description : ''}` +
            (t.event_date ? ` (Date: ${t.event_date})` : '') +
            (time ? ` at ${time}` : '') +
            (t.venue ? ` (Venue: ${t.venue})` : '');
        })
        .join('\n') + '\n\n';
  }
  if (catalog) {
    s += '=== REQUEST CATALOG (what a beneficiary can request) ===\n' + catalog + '\n\n';
  }
  return s;
}

function faqFallback(message, scope) {
  return new Promise((resolve) => {
    const tokens = String(message).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
    const run = async () => {
      try {
        const lower = String(message).toLowerCase();

        // Direct DB-backed answers (work without the LLM / FAQ)
        if (/\bprograms?\b/.test(lower) && /\b(list|available|offer|show|all|what)\b/.test(lower)) {
          const programs = await loadPublishedPrograms(scope);

          if (programs.length) {

            const list = programs.map((p, i) => formatProgramDetail(p, i + 1)).join('\n');

            return resolve({
              answer:
                `Here are the available programs from the MAO of Medina:\n\n${list}`,
              source: 'DB'
            });
          }
        }

        if (/\b(training|trainings|seminar|seminars)\b/.test(lower)) {
          const rows = await loadActiveTrainings(scope);
          if (rows.length) {
const list = rows.map((t, i) => {
          const time = formatTimeRange(t.start_time, t.end_time);
          return `${i + 1}. ${t.title}${t.event_date ? ' - ' + t.event_date : ''}` +
            (time ? ` at ${time}` : '') +
            (t.venue ? ` (${t.venue})` : '');
        }).join('\n');
            return resolve({ answer: 'Upcoming trainings/seminars by the MAO of Medina:\n' + list, source: 'DB' });
          }
          return resolve({ answer: 'There are no upcoming trainings scheduled right now. Please check the APP or contact the MAO office.', source: 'DB' });
        }

        if (/\b(announcement|announcements|news|update|updates)\b/.test(lower) && /\b(list|latest|recent|news|show)\b/.test(lower)) {
          const { sql, params } = audienceClause(scope);
          const [rows] = await pool.query(
            `SELECT title, created_at FROM announcements WHERE status = 'published'${sql} ORDER BY created_at DESC, id DESC LIMIT 5`,
            params
          );
          if (rows.length) {
            const list = rows.map((a, i) => `${i + 1}. ${a.title} (${String(a.created_at).slice(0, 10)})`).join('\n');
            return resolve({ answer: 'Latest announcements from the MAO of Medina:\n' + list, source: 'DB' });
          }
        }

        // Fall back to FAQ keyword matching
        const [rows] = await pool.query('SELECT question, answer, keywords FROM faqs');
        let best = null;
        let bestScore = 0;
        for (const f of rows) {
          const hay = `${f.question} ${f.keywords || ''} ${f.answer}`.toLowerCase();
          let score = 0;
          for (const t of tokens) if (hay.includes(t)) score += 1;
          if (score > bestScore) {
            bestScore = score;
            best = f;
          }
        }
        if (best && bestScore > 0) {
          resolve({ answer: best.answer, source: 'FAQ' });
        } else {
          resolve({
            answer: 'I am not sure about that yet. Please contact the Municipal Agriculture Office of Medina (Mon-Fri, 8AM-5PM) for assistance.',
            source: 'FAQ',
          });
        }
      } catch {
        resolve({ answer: 'ACM Assistant is temporarily unavailable. Please visit or call the MAO office.', source: 'FAQ' });
      }
    };
    run();
  });
}

const BISAYA_MARKERS = [
  'unsa', 'naa', 'adunay', 'karon', 'nga', 'ka', 'ko', 'nako', 'ako', 'mo', 'kamo',
  'kani', 'kana', 'kini', 'asa', 'hain', 'diin', 'dili', 'wala', 'gyud', 'gihapon',
  'tanan', 'uban', 'apil', 'pud', 'sad', 'nganong', 'giunsa', 'pila', 'diin',
  'ganahan', 'kinahanglan', 'buot', 'gusto', 'kay', 'para', 'bisan', 'unya',
  'kaayo', 'ingon', 'tua', 'ngari', 'didto', 'bay', 'man', 'untah', 'kanus-a',
  'mahitungod', 'akong', 'imong', 'kanang', 'kita', 'kanus', 'guerto', 'gawas',
  'unsaon', 'mangutana', 'pangutana', 'tanang', 'karong', 'buntag', 'gabii',
  'adlaw', 'amoa', 'inya', 'ngalan', 'panahon', 'ug', 'saayo', 'gihapong',
];

const TAGALOG_MARKERS = [
  'ano', 'paano', 'kailan', 'saan', 'bakit', 'sino', 'kanino', 'meron', 'mayroon',
  'pwede', 'maaari', 'hindi', 'oo', 'ngayon', 'dito', 'doon', 'ito', 'iyan', 'yan',
  'ganyan', 'ganito', 'wala', 'may', 'yung', 'po', 'ho', 'ilan', 'magkano',
  'sabihin', 'aking', 'ating', 'kung', 'kapag', 'pumunta', 'ibig', 'kasi', 'talaga',
  'sila', 'kami', 'tayo', 'natin', 'niyo', 'ngayong', 'dapat', 'paskil', 'bawal',
  'hakbang', 'tungkol', 'bilang', 'ang', 'mga', 'araw', 'oras', 'gagawin',
  'naman', 'namanlang', 'kailangan', 'nung', 'noong',
];

const ENGLISH_MARKERS = [
  'what', 'how', 'when', 'where', 'why', 'who', 'which', 'the', 'is', 'are', 'do',
  'does', 'can', 'will', 'would', 'could', 'you', 'of', 'to', 'and', 'for', 'with',
  'provide', 'provision', 'about', 'please', 'tell', 'my', 'me', 'am', 'have', 'has',
  'free', 'available', 'list', 'show', 'register', 'apply', 'requirements', 'days',
  'open', 'need', 'give', 'are', 'your', 'there', 'would',
];

function matchLang(tokens, markers) {
  let score = 0;
  for (const t of tokens) {
    if (markers.some((m) => m.length >= 4 && t.includes(m))) score += 1;
  }
  return score;
}

function detectLang(text) {
  const tokens = new Set(String(text).toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1));
  let en = 0, tl = 0, bi = 0;
  for (const t of tokens) {
    if (ENGLISH_MARKERS.includes(t)) en += 1;
    if (BISAYA_MARKERS.includes(t)) bi += 1;
    if (TAGALOG_MARKERS.includes(t)) tl += 1;
  }
  bi += matchLang(tokens, BISAYA_MARKERS);
  tl += matchLang(tokens, TAGALOG_MARKERS);
  if (bi > 0 && bi >= tl) return 'Bisaya (Cebuano)';
  if (tl > 0 && tl >= bi) return 'Tagalog (Filipino)';
  return 'English';
}

export async function answer(message, lang, scope) {
  const apiKey = process.env.LLM_API_KEY || '';
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  if (!apiKey) return faqFallback(message, scope);

  const detected = lang === 'bis' ? 'Bisaya (Cebuano)' : lang === 'en' ? 'English' : detectLang(message);

  try {
    const system = await buildSystemContext(scope);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5174',
        'X-Title': 'AgriConnect Medina - ACM Assistant',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'system', content: `The user's message is in ${detected}. The ENTIRE reply must be written ONLY in ${detected}. Do not use any other language.` },
          { role: 'user', content: String(message) },
        ],
        max_tokens: rateLimits.llm.maxOutputTokens,
        temperature: 0.1,
      }),
      // A provider that hangs must not leave a chatbot request sitting open
      // while the caller's rate-limit window ticks down; fail over to the FAQ
      // fallback instead.
      signal: AbortSignal.timeout(rateLimits.llm.timeoutMs),
    });
    if (!res.ok) return faqFallback(message, scope);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return faqFallback(message, scope);
    const trimmed = content.trim();
    return {
      answer: trimmed.length > rateLimits.llm.maxOutputChars
        ? `${trimmed.slice(0, rateLimits.llm.maxOutputChars)}…`
        : trimmed,
      source: 'AI',
    };
  } catch {
    return faqFallback(message, scope);
  }
}