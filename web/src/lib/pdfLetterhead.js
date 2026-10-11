// Shared letterhead for every MAO PDF report.
//
// Replicates the structure of an official government form letterhead: the office
// seal beside an escalating location-to-office text block, and a report title
// beneath a rule. Only the layout is borrowed. All copy is the project's own.
//
// Deliberately contains no star, watermark or stamp graphic.

export const SEAL_SRC = '/medina-official-seal.jpg';

// Escalating hierarchy: generic location context first, the specific office last.
const CONTEXT_LINES = [
  'Republic of the Philippines',
  'Province of Misamis Oriental',
  'Municipality of Medina',
];

const OFFICE_LINE = 'MUNICIPAL AGRICULTURE OFFICE';

const MARGIN = 40;
const SEAL_SIZE = 62;
const SEAL_GAP = 18;

const INK = { slate700: [71, 85, 105], slate900: [15, 23, 42], green: [18, 98, 66] };

// Base-14 Times Roman. Metric-compatible with Times New Roman, so the letterhead
// gets the serif look without embedding a licensed Microsoft font file, which would
// add roughly 300KB to every exported report.
const HEAD_FONT = 'times';

// jsPDF needs the bytes inline, and a relative /public URL is not reachable from a
// file saved off disk, so the seal is fetched once and cached for later exports.
let sealCache = null;

export async function loadSeal(src = SEAL_SRC) {
  if (sealCache) return sealCache;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Seal could not be loaded (${res.status})`);

  const bytes = new Uint8Array(await res.arrayBuffer());
  // Chunked so a large asset cannot blow the argument limit on String.fromCharCode.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  const isPng = src.toLowerCase().endsWith('.png');
  sealCache = { dataUrl: `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${btoa(binary)}`, format: isPng ? 'PNG' : 'JPEG' };
  return sealCache;
}

function widestLine(doc) {
  doc.setFont(HEAD_FONT, 'normal');
  doc.setFontSize(9);
  let widest = 0;
  for (const line of CONTEXT_LINES) widest = Math.max(widest, doc.getTextWidth(line));

  doc.setFont(HEAD_FONT, 'bold');
  doc.setFontSize(13);
  // Letter-spacing is added per character, so it has to be counted here too.
  return Math.max(widest, doc.getTextWidth(OFFICE_LINE) + OFFICE_LINE.length * 0.5);
}

/**
 * Draws the letterhead and returns the Y coordinate where report content may begin.
 *
 * @param doc       jsPDF document, already created
 * @param title     dynamic report title, e.g. 'BENEFICIARY RECORDS'
 * @param dateLabel shown top right, e.g. 'October 2, 2026'
 */
export function drawLetterhead(doc, { title, dateLabel }) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Text stays centred on the page, and the seal is parked just to its left. The
  // text block is the anchor, so the logo tracks it instead of sitting on the margin.
  const textWidth = widestLine(doc);
  const textCenterX = pageWidth / 2;
  const sealX = textCenterX - textWidth / 2 - SEAL_GAP - SEAL_SIZE;

  const CONTEXT_LEAD = 11;
  const OFFICE_GAP = 9;
  const OFFICE_LEAD = 16;

  let y = 52;
  const firstBaseline = y;
  const lastContextBaseline = y + CONTEXT_LEAD * (CONTEXT_LINES.length - 1);
  const officeBaseline = lastContextBaseline + CONTEXT_LEAD + OFFICE_GAP;

  // Seal is vertically centred against the whole four-line block.
  const blockTop = firstBaseline - 8;
  const blockBottom = officeBaseline + 5;
  const sealY = (blockTop + blockBottom) / 2 - SEAL_SIZE / 2;

  doc.addImage(sealCache.dataUrl, sealCache.format, sealX, sealY, SEAL_SIZE, SEAL_SIZE, undefined, 'FAST');

  y = firstBaseline;
  doc.setFont(HEAD_FONT, 'normal');
  doc.setFontSize(9);
  doc.setCharSpace(0);
  doc.setTextColor(...INK.slate700);
  for (const line of CONTEXT_LINES) {
    doc.text(line, textCenterX, y, { align: 'center' });
    y += CONTEXT_LEAD;
  }

  doc.setFont(HEAD_FONT, 'bold');
  doc.setFontSize(13);
  doc.setCharSpace(0.5);
  doc.setTextColor(...INK.slate900);
  doc.text(OFFICE_LINE, textCenterX, officeBaseline, { align: 'center' });
  doc.setCharSpace(0);

  if (dateLabel) {
    doc.setFont(HEAD_FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...INK.slate700);
    doc.text(dateLabel, pageWidth - MARGIN, firstBaseline - 4, { align: 'right' });
  }

  // Rule beneath the seal and text block, before the report title.
  let ruleY = Math.max(sealY + SEAL_SIZE, blockBottom) + 14;
  doc.setDrawColor(...INK.slate700);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, ruleY, pageWidth - MARGIN, ruleY);

  ruleY += 24;
  doc.setFont(HEAD_FONT, 'bold');
  doc.setFontSize(15);
  doc.setCharSpace(0.6);
  doc.setTextColor(...INK.green);
  doc.text(String(title).toUpperCase(), pageWidth / 2, ruleY, { align: 'center' });
  doc.setCharSpace(0);

  // No rule under the title; spacing alone separates it from the content below.
  return ruleY + 16;
}

// Printed once, bottom right of the final page, so the record count reads as a
// closing total rather than repeating on every sheet.
export function drawFooterTotal(doc, label) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK.slate700);
  doc.text(label, pageWidth - MARGIN, pageHeight - 20, { align: 'right' });
}

// Page numbers moved to the bottom left to keep the bottom right corner clear.
export function drawPageNumber(doc, page) {
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK.slate700);
  doc.text(`Page ${page}`, MARGIN, pageHeight - 20, { align: 'left' });
}