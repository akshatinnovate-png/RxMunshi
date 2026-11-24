import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySignature } from './whatsapp';
import { sanitizeBill, sanitizeRx } from '@/core/ocr';

describe('webhook signature', () => {
  it('accepts only the right HMAC', () => {
    const body = '{"entry":[]}';
    const sig = 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
    expect(verifySignature(body, sig, 's3cret')).toBe(true);
    expect(verifySignature(body + ' ', sig, 's3cret')).toBe(false);
    expect(verifySignature(body, sig, 'other')).toBe(false);
    expect(verifySignature(body, null, 's3cret')).toBe(false);
    expect(verifySignature(body, sig, undefined)).toBe(false);
  });
});

describe('OCR output sanitising', () => {
  it('coerces, clamps and lowers confidence on unreadable expiry', () => {
    const r = sanitizeBill({ distributor_name: 'X', bill_no: 7, lines: [
      { medicine_name: 'Telma 40', batch_no: 'T1', expiry: '03/27', qty: '10', cost_inr: '162.456', mrp_inr: 238, confidence: 0.9 },
      { medicine_name: 'Pan 40', batch_no: 'P1', expiry: '??', qty: -5, cost_inr: 'abc', mrp_inr: 199, confidence: 0.99 },
      { medicine_name: '', qty: 1 },
    ] }, '2026-11-24');
    expect(r.bill_no).toBe('7');
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ expiry_date: '2027-03-31', qty: 10, cost_inr: 162.46, confidence: 0.9 });
    expect(r.lines[1]).toMatchObject({ expiry_date: '', qty: 0, cost_inr: 0, confidence: 0.5 });
    expect(sanitizeBill(null, '2026-11-24').lines).toEqual([]);
  });
  it('sanitises prescriptions', () => {
    const r = sanitizeRx({ doctor_name: 'Dr A', patient_name: 'B', lines: [{ name: 'Dolo 650', qty: 0 }] }, '2026-11-24');
    expect(r.lines[0].qty).toBe(1);
    expect(r.date).toBe('2026-11-24');
  });
});
