// Model output is untrusted: coerce it into exact shapes, clamp numbers,
// normalise expiry dates and cap lengths before anything else sees it.
import type { BillLine, ISODate } from './types';
import type { BillRead } from './fixtures';
import type { RxRead } from './rx';
import { parseExpiry } from './util';

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const num = (v: unknown, min = 0, max = 1e7) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};
const date = (v: unknown, fallback: ISODate) => {
  const s = str(v, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : parseExpiry(s) ?? fallback;
};

export function sanitizeBill(raw: unknown, today: ISODate): BillRead {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lines = Array.isArray(o.lines) ? o.lines.slice(0, 80) : [];
  return {
    distributor_name: str(o.distributor_name) || 'Unknown distributor',
    bill_no: str(o.bill_no, 40),
    bill_date: date(o.bill_date, today),
    lines: lines.map((l): BillLine => {
      const x = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
      const expiry = parseExpiry(str(x.expiry ?? x.expiry_date, 20));
      const confidence = num(x.confidence, 0, 1);
      return {
        medicine_name: str(x.medicine_name),
        batch_no: str(x.batch_no, 30),
        expiry_date: expiry ?? '',
        qty: Math.round(num(x.qty, 0, 100000)),
        free_qty: Math.round(num(x.free_qty, 0, 100000)),
        cost_inr: Math.round(num(x.cost_inr, 0, 1e6) * 100) / 100,
        mrp_inr: Math.round(num(x.mrp_inr, 0, 1e6) * 100) / 100,
        is_schedule_h1: x.is_schedule_h1 === true,
        // an unreadable expiry is never "confident"
        confidence: expiry ? confidence : Math.min(confidence, 0.5),
      };
    }).filter((l) => l.medicine_name),
  };
}

export function sanitizeRx(raw: unknown, today: ISODate): RxRead {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lines = Array.isArray(o.lines) ? o.lines.slice(0, 30) : [];
  return {
    doctor_name: str(o.doctor_name),
    doctor_address: str(o.doctor_address, 200),
    doctor_reg_no: str(o.doctor_reg_no, 40),
    patient_name: str(o.patient_name),
    patient_address: str(o.patient_address, 200),
    date: date(o.date, today),
    lines: lines
      .map((l) => {
        const x = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
        return { name: str(x.name), dose: str(x.dose, 60), qty: Math.max(1, Math.round(num(x.qty, 1, 100))), confidence: num(x.confidence ?? 0.8, 0, 1) };
      })
      .filter((l) => l.name),
  };
}
