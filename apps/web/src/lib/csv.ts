// Browser-side CSV parser. Same logic as the API's helper; small enough
// that duplication is cheaper than spinning up a shared package.

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const cells = parseGrid(text);
  if (cells.length === 0) return { headers: [], rows: [] };
  const headers = cells[0]!.map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < cells.length; i += 1) {
    const row = cells[i]!;
    if (row.every((c) => c.length === 0)) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j += 1) {
      obj[headers[j]!] = (row[j] ?? '').trim();
    }
    rows.push(obj);
  }
  return { headers, rows };
}

function parseGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
