-- ============================================================
-- Migration 030 - beneficiary registration requirements in the FAQ knowledge base
--
-- ACM Assistant answers from the `faqs` table: the rows are injected into the
-- model's system prompt (=== OFFICIAL FAQS ===) and the keyword fallback matches
-- them when no model is available. These four rows are the official per-type
-- registration requirements, so they reach the assistant through the same
-- retrieval path as every other answer instead of a second, hardcoded source.
--
-- The `acm-req:<type>` marker in `keywords` lets the chatbot find the row for a
-- beneficiary type; the remaining keywords keep ordinary keyword matching working
-- in English, Tagalog and Bisaya.
--
-- Safe to re-run: each row is inserted only when its marker is missing.
-- ============================================================

INSERT INTO faqs (question, answer, keywords)
SELECT 'What are the requirements for Farmer (RSBSA) registration?',
       'For Farmer (RSBSA) registration, prepare the following:\n\n1. Valid ID — photocopy with three (3) specimen signatures.\n2. One (1) 2x2 ID picture.',
       'acm-req:farmer requirements registration farmer farmers rsbsa documents valid id photocopy specimen signatures 2x2 picture mag-uuma magsasaka rehistro kinahanglan dokumento'
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE keywords LIKE '%acm-req:farmer%');

INSERT INTO faqs (question, answer, keywords)
SELECT 'What are the requirements for Livestock Owner (RSBSA) registration?',
       'For Livestock Owner (RSBSA) registration, prepare the following:\n\n1. Valid ID — photocopy with three (3) specimen signatures.\n2. One (1) 2x2 ID picture.',
       'acm-req:livestock requirements registration livestock owner animal animals hayop kahayupan mananap baboy baka kanding manok rsbsa documents valid id photocopy specimen signatures 2x2 picture rehistro kinahanglan dokumento'
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE keywords LIKE '%acm-req:livestock%');

INSERT INTO faqs (question, answer, keywords)
SELECT 'What are the requirements for Fisherfolk (RSBSA) registration?',
       'For Fisherfolk (RSBSA) registration, prepare the following:\n\n1. Valid ID — photocopy with three (3) specimen signatures.\n2. One (1) 2x2 ID picture.',
       'acm-req:fisherfolk requirements registration fisherfolk fisher fisherman mangingisda pangisda isda rsbsa documents valid id photocopy specimen signatures 2x2 picture rehistro kinahanglan dokumento'
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE keywords LIKE '%acm-req:fisherfolk%');

INSERT INTO faqs (question, answer, keywords)
SELECT 'What are the requirements for Coconut Farmer (RSBSA) registration?',
       'For Coconut Farmer (RSBSA) registration, prepare the following:\n\n1. Tax declaration or deed of sale.\n2. Valid ID with three (3) specimen signatures.',
       'acm-req:coconut requirements registration coconut farmer niyog lubi copra tax declaration deed of sale rsbsa documents valid id specimen signatures rehistro kinahanglan dokumento'
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE keywords LIKE '%acm-req:coconut%');
