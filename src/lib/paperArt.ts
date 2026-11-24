// Renders the sample wholesaler bills and prescriptions as printed paper (SVG),
// so the split-screen scanner always has an "original" on the left in Demo mode.
import type { BillRead } from '@/core/fixtures';
import type { RxRead } from '@/core/rx';
import { formatDate } from '@/core/util';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const mmYY = (d: string) => (d ? `${d.slice(5, 7)}/${d.slice(2, 4)}` : '--/--');

export function billSVG(b: BillRead, licence = ''): string {
  const W = 620;
  const rowH = 26;
  const top = 168;
  const H = top + b.lines.length * rowH + 150;
  const cols = [16, 46, 232, 316, 372, 420, 466, 528];
  const head = ['#', 'Product', 'Batch', 'Exp', 'Qty', 'Free', 'Rate', 'MRP'];
  let y = top;
  let rows = '';
  let total = 0;
  b.lines.forEach((l, i) => {
    total += l.qty * l.cost_inr;
    const smudge = l.confidence < 0.8 ? `<rect x="${cols[1] - 4}" y="${y - 16}" width="180" height="22" fill="#8a7f6a" opacity=".18"/>` : '';
    rows += `${smudge}<text x="${cols[0]}" y="${y}">${i + 1}</text><text x="${cols[1]}" y="${y}">${esc(l.medicine_name.toUpperCase())}</text><text x="${cols[2]}" y="${y}">${esc(l.batch_no)}</text><text x="${cols[3]}" y="${y}">${mmYY(l.expiry_date)}</text><text x="${cols[4] + 30}" y="${y}" text-anchor="end">${l.qty}</text><text x="${cols[5] + 26}" y="${y}" text-anchor="end">${l.free_qty || ''}</text><text x="${cols[6] + 52}" y="${y}" text-anchor="end">${l.cost_inr.toFixed(2)}</text><text x="${cols[7] + 54}" y="${y}" text-anchor="end">${l.mrp_inr.toFixed(2)}</text>${l.is_schedule_h1 ? `<text x="${cols[1] + 150}" y="${y}" font-weight="700" fill="#b00">H1</text>` : ''}`;
    y += rowH;
  });
  const gst = total * 0.12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Courier New, monospace" font-size="12.5" fill="#222">
<rect width="${W}" height="${H}" fill="#fbf8f0"/>
<g transform="rotate(-0.6 ${W / 2} ${H / 2})">
<text x="${W / 2}" y="38" text-anchor="middle" font-size="20" font-weight="700">${esc(b.distributor_name.toUpperCase())}</text>
<text x="${W / 2}" y="58" text-anchor="middle" font-size="11">Wholesale Chemists &amp; Druggists · Jamshedpur · DL ${esc(licence || '20B/21B')}</text>
<line x1="16" x2="${W - 16}" y1="72" y2="72" stroke="#222"/>
<text x="16" y="96" font-weight="700">TAX INVOICE</text>
<text x="16" y="116">Bill No: ${esc(b.bill_no)}</text>
<text x="${W - 16}" y="116" text-anchor="end">Date: ${formatDate(b.bill_date)}</text>
<text x="16" y="134">To: SHARMA MEDICAL HALL, SAKCHI</text>
<line x1="16" x2="${W - 16}" y1="144" y2="144" stroke="#222"/>
${head.map((h, i) => `<text x="${i >= 4 ? cols[i] + (i === 4 ? 30 : i === 5 ? 26 : 52) + (i === 7 ? 2 : 0) : cols[i]}" y="${top - 8 - 4}" font-weight="700" ${i >= 4 ? 'text-anchor="end"' : ''}>${h}</text>`).join('')}
${rows}
<line x1="16" x2="${W - 16}" y1="${y - 10}" y2="${y - 10}" stroke="#222" stroke-dasharray="4 3"/>
<text x="${W - 16}" y="${y + 12}" text-anchor="end">Taxable ${total.toFixed(2)}</text>
<text x="${W - 16}" y="${y + 30}" text-anchor="end">GST 12% ${gst.toFixed(2)}</text>
<text x="${W - 16}" y="${y + 52}" text-anchor="end" font-size="15" font-weight="700">TOTAL ₹ ${(total + gst).toFixed(2)}</text>
<text x="16" y="${y + 90}" font-size="10.5">Goods once sold will be taken back only as per expiry return policy. E.&amp;O.E.</text>
<text x="16" y="${y + 106}" font-size="10" fill="#a33">SYNTHETIC SAMPLE · RxMunshi demo</text>
</g></svg>`;
}

export function rxSVG(rx: RxRead): string {
  const W = 520;
  const H = 640;
  const lines = rx.lines
    .map((l, i) => `<text x="70" y="${300 + i * 58}" font-size="22">${esc(l.name)}</text><text x="90" y="${324 + i * 58}" font-size="16" fill="#334">${esc(l.dose || '')} · ${l.qty} strip${l.qty > 1 ? 's' : ''}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="#1c2a5a" font-family="Segoe Print, Bradley Hand, Comic Sans MS, cursive">
<rect width="${W}" height="${H}" fill="#fdfcf7"/>
<rect x="0" y="0" width="${W}" height="96" fill="#e7eef9"/>
<text x="24" y="40" font-family="Georgia, serif" font-size="22" font-weight="700">${esc(rx.doctor_name)}</text>
<text x="24" y="62" font-family="Georgia, serif" font-size="12.5">MBBS, MD · Reg. ${esc(rx.doctor_reg_no)}</text>
<text x="24" y="80" font-family="Georgia, serif" font-size="12.5">${esc(rx.doctor_address)}</text>
<text x="24" y="140" font-size="18">Name: ${esc(rx.patient_name)}</text>
<text x="24" y="166" font-size="15">${esc(rx.patient_address)}</text>
<text x="${W - 24}" y="140" text-anchor="end" font-size="16">${formatDate(rx.date)}</text>
<text x="24" y="250" font-family="Georgia, serif" font-size="40" font-style="italic">Rx</text>
${lines}
<path d="M330 ${H - 90} q 30 -30 60 0 t 60 -10" stroke="#1c2a5a" fill="none" stroke-width="2"/>
<text x="${W - 24}" y="${H - 50}" text-anchor="end" font-size="13" font-family="Georgia, serif">Signature</text>
<text x="24" y="${H - 20}" font-size="10" fill="#a33" font-family="monospace">SYNTHETIC SAMPLE · RxMunshi demo</text>
</svg>`;
}

export const svgURL = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
