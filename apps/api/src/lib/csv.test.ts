import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('parses a basic CSV', () => {
    const { headers, rows } = parseCsv('a,b,c\n1,2,3\n4,5,6\n');
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'name,price\n"Cap, asphalt 30yr",129.00\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual({ name: 'Cap, asphalt 30yr', price: '129.00' });
  });

  it('handles escaped quotes', () => {
    const csv = 'note\n"He said ""hi"""\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual({ note: 'He said "hi"' });
  });

  it('handles CRLF line endings', () => {
    const { rows } = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('skips fully empty trailing rows', () => {
    const { rows } = parseCsv('a\n1\n\n');
    expect(rows).toEqual([{ a: '1' }]);
  });

  it('returns empty result for empty input', () => {
    const { headers, rows } = parseCsv('');
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});
