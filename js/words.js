// Number to words (English), e.g. 62903 -> "Sixty Two Thousand Nine Hundred and Three"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}
function below1000(n) {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100), r = n % 100;
  return ONES[h] + ' Hundred' + (r ? ' and ' + below100(r) : '');
}
function words(n) {
  if (n === 0) return 'Zero';
  const units = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
  let out = '';
  for (const [v, name] of units) {
    if (n >= v) {
      const q = Math.floor(n / v);
      out += (out ? ' ' : '') + words(q) + ' ' + name;
      n -= q * v;
    }
  }
  if (n > 0) {
    out += (out ? (n < 100 ? ' and ' : ' ') : '') + below1000(n);
  }
  return out;
}

export function amountInWords(amount) {
  const a = Math.round((Number(amount) || 0) * 100) / 100;
  const rupees = Math.floor(a + 1e-9);
  const paisa = Math.round((a - rupees) * 100);
  let s = words(rupees) + ' Rupees';
  if (paisa > 0) s += ' and ' + words(paisa) + ' Paisa';
  return s + ' only';
}
