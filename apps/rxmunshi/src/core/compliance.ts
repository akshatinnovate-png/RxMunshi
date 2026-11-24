// F6 · Inspector Mode: what a drug inspector would check, scored.
import type { DB, ISODate } from './types';
import { bucketOf, onShelf } from './expiry';
import { h1Missing } from './h1';
import { creditAgeDays } from './returns';
import { hasActiveConsent } from './refills';
import { daysBetween, sum } from './util';

export type CheckState = 'pass' | 'warn' | 'fail';

export interface Check {
  id: string;
  title: string;
  state: CheckState;
  detail: string;
  weight: number;
  fix?: { label: string; href: string };
}

export function complianceChecks(db: DB, today: ISODate): Check[] {
  const shop = db.shops[0];
  const checks: Check[] = [];

  const lic = shop ? daysBetween(today, shop.license_valid_until) : -1;
  checks.push({
    id: 'licence',
    title: 'Retail drug licence valid',
    state: lic < 0 ? 'fail' : lic < 60 ? 'warn' : 'pass',
    detail: shop
      ? lic < 0
        ? `Licence ${shop.drug_license_no} expired ${-lic} days ago.`
        : `Licence ${shop.drug_license_no} valid for ${lic} more days.`
      : 'No shop profile.',
    weight: 20,
    fix: { label: 'Shop profile', href: '/settings' },
  });

  const reg = shop ? daysBetween(today, shop.pharmacist_reg_valid_until) : -1;
  checks.push({
    id: 'pharmacist',
    title: 'Registered pharmacist on record',
    state: !shop?.pharmacist_reg_no ? 'fail' : reg < 0 ? 'fail' : reg < 60 ? 'warn' : 'pass',
    detail: shop?.pharmacist_reg_no
      ? `${shop.pharmacist_name} · reg. ${shop.pharmacist_reg_no} · ${reg < 0 ? 'expired' : `renews in ${reg} days`}.`
      : 'Add the pharmacist registration number.',
    weight: 15,
    fix: { label: 'Shop profile', href: '/settings' },
  });

  const incomplete = db.schedule_h1_logs.filter((e) => h1Missing(e).length > 0);
  checks.push({
    id: 'h1',
    title: 'Schedule H1 register complete',
    state: incomplete.length === 0 ? 'pass' : 'fail',
    detail:
      incomplete.length === 0
        ? `${db.schedule_h1_logs.length} entries, all with prescriber, patient, drug and quantity.`
        : `${incomplete.length} of ${db.schedule_h1_logs.length} entries are missing: ${[...new Set(incomplete.flatMap(h1Missing))].join(', ')}.`,
    weight: 25,
    fix: { label: 'Open H1 register', href: '/h1' },
  });

  const expiredOnShelf = onShelf(db.inventory_batches).filter((b) => bucketOf(b, today) === 'expired');
  checks.push({
    id: 'expired',
    title: 'Expired stock segregated',
    state: expiredOnShelf.length === 0 ? 'pass' : 'fail',
    detail:
      expiredOnShelf.length === 0
        ? 'No expired batch is mixed with saleable stock.'
        : `${expiredOnShelf.length} expired batches still marked saleable (₹${sum(expiredOnShelf, (b) => b.qty * b.cost_inr).toFixed(0)}). Return or quarantine them.`,
    weight: 20,
    fix: { label: 'Open Expiry Radar', href: '/expiry' },
  });

  const optedIn = db.chronic_patients.filter((p) => p.dpdp_opt_in);
  const noRecord = optedIn.filter((p) => !hasActiveConsent(p, db.consent_log));
  checks.push({
    id: 'consent',
    title: 'DPDP consent recorded for every messaged patient',
    state: noRecord.length === 0 ? 'pass' : 'fail',
    detail:
      noRecord.length === 0
        ? `${optedIn.length} patients opted in, each with a consent record.`
        : `${noRecord.length} patients marked opted-in without a consent record: ${noRecord.map((p) => p.patient_name).join(', ')}.`,
    weight: 10,
    fix: { label: 'Open Refills', href: '/refills' },
  });

  const stale = db.credit_notes.filter((c) => c.status === 'pending' && creditAgeDays(c, today) > 60);
  checks.push({
    id: 'credits',
    title: 'Expiry returns documented and closed',
    state: stale.length === 0 ? 'pass' : 'warn',
    detail:
      stale.length === 0
        ? 'Every return slip is either settled or under 60 days old.'
        : `${stale.length} return slips pending over 60 days.`,
    weight: 5,
    fix: { label: 'Open Money-back', href: '/returns' },
  });

  const unbilled = db.inventory_batches.filter((b) => b.status === 'active' && !b.bill_id && !b.distributor_name);
  checks.push({
    id: 'purchase',
    title: 'Every batch traceable to a purchase bill',
    state: unbilled.length === 0 ? 'pass' : 'warn',
    detail: unbilled.length === 0 ? 'All batches carry a distributor.' : `${unbilled.length} batches have no distributor.`,
    weight: 5,
  });

  return checks;
}

export function complianceScore(checks: Check[]): number {
  const total = sum(checks, (c) => c.weight);
  const got = sum(checks, (c) => (c.state === 'pass' ? c.weight : c.state === 'warn' ? c.weight / 2 : 0));
  return Math.round((got / total) * 100);
}
