// Acceptance checks for the beneficiary registration requirements of ACM
// Assistant (Farmer / Livestock Owner / Fisherfolk / Coconut Farmer, RSBSA).
//
// Drives the keyword fallback directly, so the registration branch is answered
// without calling the LLM. The fallback only touches the database when a question
// falls through to the ordinary FAQ matcher, and the checks that do that tolerate
// a missing database.
//
//   node scripts/chatbot-requirements-check.mjs
//
// Exits 0 when every case passes, 1 otherwise.

process.env.LLM_API_KEY = ''; // never let a check reach the model

const { faqFallback } = await import('../src/services/chatbot.js');
const { pool } = await import('../src/config/db.js');

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${extra ? ' :: ' + extra : ''}`); }
}

const ask = (message, lang, history = []) =>
  faqFallback(message, { kind: 'public' }, lang, history).then((r) => r.answer);

const CLARIFY_EN =
  'What type of beneficiary are you registering as: Farmer, Livestock Owner, Fisherfolk, or Coconut Farmer?';
const CLARIFY_BIS = 'Unsang klase sa beneficiary imong i-register';

const hasStandardDocs = (text) =>
  /Valid ID \u2014 photocopy with three \(3\) specimen signatures/.test(text) &&
  /2x2 ID picture/.test(text);
const hasCoconutDocs = (text) =>
  /Tax declaration (?:or|o) deed of sale/.test(text) &&
  /specimen signatures/.test(text) &&
  !/2x2/.test(text);

console.log('--- English ---');
{
  const text = await ask('What are the requirements for farmer registration?', 'en');
  check('farmer: gives Farmer docs', /^For Farmer \(RSBSA\) registration/.test(text) && hasStandardDocs(text), text);
  check('farmer: no other type is mixed in', !/Coconut Farmer|Fisherfolk|Livestock Owner/.test(text));
}
{
  const text = await ask('What documents do I need as a livestock owner?', 'en');
  check('livestock: gives Livestock Owner docs', /^For Livestock Owner \(RSBSA\)/.test(text) && hasStandardDocs(text), text);
}
{
  const text = await ask('What should a fisherman bring for RSBSA registration?', 'en');
  check('fisherfolk: gives Fisherfolk docs', /^For Fisherfolk \(RSBSA\)/.test(text) && hasStandardDocs(text), text);
}
{
  const text = await ask('What are the requirements for coconut farmer registration?', 'en');
  check('coconut: gives Coconut Farmer docs', /^For Coconut Farmer \(RSBSA\)/.test(text) && hasCoconutDocs(text), text);
  check('coconut: never asks for a 2x2 picture', !/2x2/.test(text));
}
{
  const text = await ask('What are the requirements to register as a beneficiary?', 'en');
  check('type unknown: asks the clarifying question', text === CLARIFY_EN, text);
  check('type unknown: lists no documents yet', !/specimen signatures|2x2/.test(text));
}

console.log('--- Bisaya ---');
{
  const text = await ask("Unsa'y requirements para mahimong beneficiary?", 'bis');
  check('bisaya, type unknown: clarifies in Bisaya', text.includes(CLARIFY_BIS), text);
}
{
  const text = await ask('Unsa ang requirements sa coconut farmer?', 'bis');
  check('bisaya coconut: Bisaya docs, no 2x2', /Para sa Coconut Farmer \(RSBSA\)/.test(text) && hasCoconutDocs(text), text);
}
{
  const text = await ask('Unsa ang kinahanglan sa mag-uuma para magparehistro?', 'bis');
  check('bisaya farmer: Bisaya docs', /Para sa Farmer \(RSBSA\)/.test(text) && /Valid ID/.test(text) && /2x2/.test(text), text);
}

console.log('--- Tagalog ---');
{
  const text = await ask('Ano ang requirements ng farmer?', 'tl');
  check('tagalog farmer: Tagalog docs', /Para sa Farmer \(RSBSA\) registration, ihanda/.test(text) && /Isang \(1\) 2x2 ID picture/.test(text), text);
}

console.log('--- Follow-up turns ---');
{
  const history = [{ role: 'user', content: 'What are the requirements to register as a beneficiary?' }];
  const text = await ask('Farmer', 'en', history);
  check('follow-up "Farmer": answers the chosen type', /^For Farmer \(RSBSA\)/.test(text) && hasStandardDocs(text), text);
}
{
  const history = [{ role: 'user', content: 'What are the requirements to register as a beneficiary?' }];
  const text = await ask('Coconut Farmer', 'en', history);
  check('follow-up "Coconut Farmer": coconut docs only', /^For Coconut Farmer \(RSBSA\)/.test(text) && hasCoconutDocs(text), text);
}

console.log('--- Program questions are not hijacked ---');
{
  const text = await ask('What are the requirements for the Rice Farmers Financial Assistance?', 'en');
  check('financial assistance: not answered with RSBSA Farmer docs', !hasStandardDocs(text), text);
}

console.log('--- Knowledge base rows match the fallback templates ---');
try {
  const [rows] = await pool.query(
    "SELECT answer, keywords FROM faqs WHERE keywords LIKE '%acm-req:%'"
  );
  const byType = new Map();
  for (const row of rows) {
    const marker = String(row.keywords).match(/acm-req:([a-z]+)/);
    if (marker) byType.set(marker[1], row.answer);
  }
  check('db: one row per beneficiary type', byType.size === 4, `types=${[...byType.keys()].join(',')}`);
  for (const [type, answer] of byType) {
    const fallbackText = await ask(`What are the requirements for ${type} registration?`, 'en');
    check(`db: ${type} row matches the fallback answer`, answer === fallbackText,
      `db=${JSON.stringify(answer)} fallback=${JSON.stringify(fallbackText)}`);
  }
} catch (err) {
  console.log(`SKIP  db comparison (${err?.code || err?.name || 'unavailable'})`);
}

await pool.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
