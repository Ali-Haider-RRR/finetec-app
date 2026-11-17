// Builds a one-page A4 PDF from a JPEG (no libraries, works offline).
export function jpegToPdf(jpegBytes, imgW, imgH) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = chunk => {
    const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(b);
    length += b.length;
  };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };

  const PW = 595.28, PH = 841.89;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  push('\nendstream\nendobj\n');
  const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
