export function renderCsv(content: Record<string, unknown>) {
  return [
    ['field', 'value'],
    ...Object.entries(content).map(([key, value]) => [key, format(value)]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

export function renderPdf(title: string, content: Record<string, unknown>) {
  const lines = [
    title,
    ...Object.entries(content).map(
      ([key, value]) => `${key}: ${format(value)}`,
    ),
  ]
    .flatMap((line) => chunks(ascii(line), 88))
    .slice(0, 48);
  const stream = [
    'BT',
    '/F1 10 Tf',
    '50 760 Td',
    ...lines
      .flatMap((line, index) => [
        index ? '0 -14 Td' : '',
        `(${escapePdf(line)}) Tj`,
      ])
      .filter(Boolean),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
function format(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
function ascii(value: string) {
  return value.replace(/[^\x20-\x7e]/g, '?');
}
function escapePdf(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}
function chunks(value: string, size: number) {
  return value.match(new RegExp(`.{1,${size}}`, 'g')) ?? [''];
}
