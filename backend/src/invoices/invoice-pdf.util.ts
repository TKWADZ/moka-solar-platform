function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function buildInvoicePdf(params: {
  invoiceNumber: string;
  customerName: string;
  contractNumber: string;
  issuedAt: string;
  dueDate: string;
  totalAmount: string;
  lines: string[];
}) {
  const textLines = [
    'Moka Solar Invoice',
    `Invoice: ${params.invoiceNumber}`,
    `Customer: ${params.customerName}`,
    `Contract: ${params.contractNumber}`,
    `Issued at: ${params.issuedAt}`,
    `Due date: ${params.dueDate}`,
    `Total amount: ${params.totalAmount}`,
    'Items:',
    ...params.lines,
  ];

  const content = [
    'BT',
    '/F1 12 Tf',
    '50 790 Td',
    ...textLines.map((line, index) =>
      `${index === 0 ? '' : '0 -18 Td '}(${escapePdfText(line)}) Tj`.trim(),
    ),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(content, 'utf8')} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}
