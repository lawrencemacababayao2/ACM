import { loadSeal, drawLetterhead, drawFooterTotal, drawPageNumber } from './pdfLetterhead.js';

// Shared PDF builder for the record tables (Requests, Programs, Trainings).
//
// The output matches the Reports and Beneficiaries exports: A4 landscape, the
// same letterhead, and a page number/record total in the footer. `head` and
// `body` are already-formatted strings so each page decides its own columns.

function dateLabel(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Stable, sortable suffix for filenames: 2026-10-28-1430.
export function pdfFileStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export async function exportTablePdf({ title, filename, head, body, footerLabel }) {
  let fileHandle = null;
  if (window.showSaveFilePicker) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
      });
    } catch (err) {
      if (err?.name === 'AbortError') return { cancelled: true };
      throw err;
    }
  }

  // Loaded on demand so jsPDF stays out of the initial bundle.
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  await loadSeal();
  const cursorY = drawLetterhead(doc, { title, dateLabel: dateLabel() });

  autoTable(doc, {
    startY: cursorY,
    head: [head],
    body,
    styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [240, 247, 244], textColor: [18, 98, 66], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 252, 251] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => drawPageNumber(doc, doc.getNumberOfPages()),
  });

  if (footerLabel) drawFooterTotal(doc, footerLabel);

  const bytes = doc.output('arraybuffer');
  if (!bytes || !bytes.byteLength) throw new Error('PDF was empty');

  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return { saved: true, filename: fileHandle.name };
  }

  // Browsers without the File System Access API fall back to a download, the
  // same way Reports does.
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return { saved: true, filename };
}
