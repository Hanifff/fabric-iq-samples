import { describe, expect, it } from 'vitest';

import { displayCell, parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses quoted cells, escaped quotes and CRLF rows', () => {
    const rows = parseCsv('Name,Hours\r\n"Topside, North",1663318.6000000022\r\n"Say ""hi""",2\r\n');
    expect(rows).toEqual([
      ['Name', 'Hours'],
      ['Topside, North', '1663318.6000000022'],
      ['Say "hi"', '2'],
    ]);
  });

  it('rounds long decimals for display', () => {
    expect(displayCell('1663318.6000000022')).toBe('1,663,318.6');
    expect(displayCell('0.5536495711')).toBe('0.554');
    expect(displayCell('CON-2422')).toBe('CON-2422');
  });
});
