// F4 · Rx to Register: match prescription lines to stock (FEFO) and find
// same-salt alternatives for the pharmacist to choose from.
import type { Batch, Drug, ISODate } from './types';
import { fefo } from './expiry';
import { normName, similarity, sum } from './util';

export interface RxLine {
  name: string;
  dose?: string;
  qty: number; // packs
  confidence?: number;
}

export interface RxRead {
  doctor_name: string;
  doctor_address: string;
  doctor_reg_no: string;
  patient_name: string;
  patient_address: string;
  date: ISODate;
  lines: RxLine[];
}

export interface RxMatch {
  line: RxLine;
  drug: Drug | null;
  score: number;
  is_h1: boolean;
  in_stock: number;
  picks: { batch: Batch; qty: number }[]; // FEFO allocation
  short: number;
  alternatives: { drug: Drug; in_stock: number }[];
}

export function findDrug(name: string, drugs: Drug[]): { drug: Drug | null; score: number } {
  let best: Drug | null = null;
  let score = 0;
  for (const d of drugs) {
    const s = Math.max(similarity(name, d.name), normName(name) === normName(d.name) ? 1 : 0);
    if (s > score) {
      score = s;
      best = d;
    }
  }
  return score >= 0.6 ? { drug: best, score } : { drug: null, score };
}

function batchesOf(drug: Drug | null, name: string, batches: Batch[]) {
  return batches.filter((b) => (drug && b.drug_id === drug.id) || normName(b.medicine_name) === normName(drug?.name ?? name));
}

export function allocateFEFO(batches: Batch[], qty: number, today: ISODate) {
  const picks: { batch: Batch; qty: number }[] = [];
  let left = qty;
  for (const b of fefo(batches, today)) {
    if (left <= 0) break;
    const take = Math.min(b.qty, left);
    picks.push({ batch: b, qty: take });
    left -= take;
  }
  return { picks, short: Math.max(0, left) };
}

export function matchRx(rx: RxRead, drugs: Drug[], batches: Batch[], today: ISODate): RxMatch[] {
  return rx.lines.map((line) => {
    const { drug, score } = findDrug(line.name, drugs);
    const own = batchesOf(drug, line.name, batches);
    const { picks, short } = allocateFEFO(own, line.qty, today);
    const alternatives = drug
      ? drugs
          .filter((d) => d.id !== drug.id && normName(d.salt) === normName(drug.salt))
          .map((d) => ({ drug: d, in_stock: sum(fefo(batchesOf(d, d.name, batches), today), (b) => b.qty) }))
          .filter((a) => a.in_stock > 0)
      : [];
    return {
      line,
      drug,
      score,
      is_h1: drug?.schedule === 'H1' || picks.some((p) => p.batch.is_schedule_h1),
      in_stock: sum(fefo(own, today), (b) => b.qty),
      picks,
      short,
      alternatives,
    };
  });
}
