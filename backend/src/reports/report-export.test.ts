import { describe, expect, it } from 'vitest';
import { renderCsv, renderPdf } from './report-export';
describe('report exports', () => {
  it('escapes CSV and emits a valid PDF envelope', () => {
    expect(renderCsv({ notes: 'rain, then "clear"' })).toContain(
      '"rain, then ""clear"""',
    );
    const pdf = renderPdf('Daily report', {
      notes: 'Shift complete',
    }).toString();
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.endsWith('%%EOF')).toBe(true);
  });
});
