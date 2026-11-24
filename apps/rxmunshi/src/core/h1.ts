// Schedule H1 register. Rule 65 of the Drugs and Cosmetics Rules: each supply of
// an H1 drug is recorded at the time of supply with the prescriber's name and
// address, the patient's name, the drug and the quantity, kept for three years.
import type { H1Entry, ISODate } from './types';
import { addDays, parseDate } from './util';

export const H1_REQUIRED: { key: keyof H1Entry; label: string }[] = [
  { key: 'dispensed_date', label: 'date of supply' },
  { key: 'patient_name', label: 'patient name' },
  { key: 'doctor_name', label: 'prescriber name' },
  { key: 'doctor_address', label: 'prescriber address' },
  { key: 'drug_name', label: 'drug name' },
  { key: 'qty', label: 'quantity' },
];

export function h1Missing(e: Partial<H1Entry>): string[] {
  return H1_REQUIRED.filter(({ key }) => {
    const v = e[key];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (key === 'qty' && !(Number(v) > 0));
  }).map((r) => r.label);
}

export function retainUntil(d: ISODate): ISODate {
  const t = new Date(parseDate(d));
  t.setUTCFullYear(t.getUTCFullYear() + 3);
  return t.toISOString().slice(0, 10);
}

const COLS: (keyof H1Entry)[] = [
  'dispensed_date',
  'patient_name',
  'patient_address',
  'doctor_name',
  'doctor_address',
  'doctor_reg_no',
  'drug_name',
  'batch_no',
  'qty',
  'retain_until',
];

const HEAD = [
  'Date of supply',
  'Patient name',
  'Patient address',
  'Prescriber name',
  'Prescriber address',
  'Prescriber reg. no.',
  'Drug name',
  'Batch no.',
  'Quantity',
  'Retain until',
];

export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function h1CSV(entries: H1Entry[], shop?: { name: string; drug_license_no: string }): string {
  const rows = [...entries].sort((a, b) => (a.dispensed_date < b.dispensed_date ? -1 : 1));
  const out: string[] = [];
  if (shop) out.push(csvCell(`Schedule H1 register · ${shop.name} · DL ${shop.drug_license_no}`));
  out.push(HEAD.map(csvCell).join(','));
  for (const e of rows) out.push(COLS.map((c) => csvCell(e[c])).join(','));
  return out.join('\r\n') + '\r\n';
}

/** Entries the shop must still keep (three years from supply). */
export function inRetention(entries: H1Entry[], today: ISODate) {
  return entries.filter((e) => e.retain_until >= today || addDays(e.dispensed_date, 3 * 365) >= today);
}
