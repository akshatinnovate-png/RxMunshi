// Synthetic demo dataset: a fictional pharmacy in Sakchi, Jamshedpur.
// Every date is relative to `today`, so the demo is always fresh.
// All people, phone numbers and licence numbers are made up.
import type { Batch, CreditNote, DB, Dispense, Drug, H1Entry, ISODate, Patient, PurchaseBill, Shop, Wholesaler, Consent, Order, AuditEvent } from './types';
import { addDays, round2 } from './util';
import { retainUntil } from './h1';

export const SHOP_ID = '00000000-0000-4000-8000-000000000001';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (d: ISODate, hh = 10, mm = 0) => `${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`;

export const DRUGS: Drug[] = [
  // chronic
  { id: 'd-telma40', name: 'Telma 40', salt: 'Telmisartan 40mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 238, chronic: true },
  { id: 'd-telmikind40', name: 'Telmikind 40', salt: 'Telmisartan 40mg', form: 'tab', schedule: 'H', pack: '10 tab strip', mrp_inr: 92, chronic: true },
  { id: 'd-glycomet500', name: 'Glycomet 500', salt: 'Metformin 500mg', form: 'tab', schedule: 'H', pack: '20 tab strip', mrp_inr: 34, chronic: true },
  { id: 'd-glyciphage500', name: 'Glyciphage 500', salt: 'Metformin 500mg', form: 'tab', schedule: 'H', pack: '20 tab strip', mrp_inr: 31, chronic: true },
  { id: 'd-glycometgp1', name: 'Glycomet GP 1', salt: 'Glimepiride 1mg + Metformin 500mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 128, chronic: true },
  { id: 'd-ecosprin75', name: 'Ecosprin 75', salt: 'Aspirin 75mg', form: 'tab', schedule: 'G', pack: '14 tab strip', mrp_inr: 5, chronic: true },
  { id: 'd-atorva10', name: 'Atorva 10', salt: 'Atorvastatin 10mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 118, chronic: true },
  { id: 'd-amlong5', name: 'Amlong 5', salt: 'Amlodipine 5mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 72, chronic: true },
  { id: 'd-amlokind5', name: 'Amlokind 5', salt: 'Amlodipine 5mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 28, chronic: true },
  { id: 'd-thyronorm50', name: 'Thyronorm 50', salt: 'Thyroxine 50mcg', form: 'tab', schedule: 'H', pack: '100 tab bottle', mrp_inr: 180, chronic: true },
  { id: 'd-rosuvas10', name: 'Rosuvas 10', salt: 'Rosuvastatin 10mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 312, chronic: true },
  { id: 'd-jalra50', name: 'Jalra 50', salt: 'Vildagliptin 50mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 265, chronic: true },
  { id: 'd-concor5', name: 'Concor 5', salt: 'Bisoprolol 5mg', form: 'tab', schedule: 'H', pack: '10 tab strip', mrp_inr: 140, chronic: true },
  // acute
  { id: 'd-dolo650', name: 'Dolo 650', salt: 'Paracetamol 650mg', form: 'tab', schedule: 'G', pack: '15 tab strip', mrp_inr: 34, chronic: false },
  { id: 'd-crocin650', name: 'Crocin 650', salt: 'Paracetamol 650mg', form: 'tab', schedule: 'G', pack: '15 tab strip', mrp_inr: 33, chronic: false },
  { id: 'd-pan40', name: 'Pan 40', salt: 'Pantoprazole 40mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 199, chronic: false },
  { id: 'd-pantocid40', name: 'Pantocid 40', salt: 'Pantoprazole 40mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 176, chronic: false },
  { id: 'd-azithral500', name: 'Azithral 500', salt: 'Azithromycin 500mg', form: 'tab', schedule: 'H', pack: '5 tab strip', mrp_inr: 119, chronic: false },
  { id: 'd-augmentin625', name: 'Augmentin 625 Duo', salt: 'Amoxicillin 500mg + Clavulanic acid 125mg', form: 'tab', schedule: 'H', pack: '10 tab strip', mrp_inr: 223, chronic: false },
  { id: 'd-allegra120', name: 'Allegra 120', salt: 'Fexofenadine 120mg', form: 'tab', schedule: 'H', pack: '10 tab strip', mrp_inr: 219, chronic: false },
  { id: 'd-montairlc', name: 'Montair LC', salt: 'Montelukast 10mg + Levocetirizine 5mg', form: 'tab', schedule: 'H', pack: '15 tab strip', mrp_inr: 287, chronic: false },
  { id: 'd-benadryl', name: 'Benadryl Cough Syrup', salt: 'Diphenhydramine syrup', form: 'syrup', schedule: 'OTC', pack: '150 ml bottle', mrp_inr: 128, chronic: false },
  { id: 'd-shelcal500', name: 'Shelcal 500', salt: 'Calcium 500mg + Vitamin D3', form: 'tab', schedule: 'OTC', pack: '15 tab strip', mrp_inr: 121, chronic: false },
  { id: 'd-becosules', name: 'Becosules', salt: 'Vitamin B complex', form: 'cap', schedule: 'OTC', pack: '20 cap strip', mrp_inr: 53, chronic: false },
  { id: 'd-digene', name: 'Digene Syrup', salt: 'Antacid gel', form: 'syrup', schedule: 'OTC', pack: '200 ml bottle', mrp_inr: 152, chronic: false },
  { id: 'd-ondem4', name: 'Ondem 4', salt: 'Ondansetron 4mg', form: 'tab', schedule: 'H', pack: '10 tab strip', mrp_inr: 64, chronic: false },
  // Schedule H1
  { id: 'd-taximo200', name: 'Taxim-O 200', salt: 'Cefixime 200mg', form: 'tab', schedule: 'H1', pack: '10 tab strip', mrp_inr: 109, chronic: false },
  { id: 'd-zifi200', name: 'Zifi 200', salt: 'Cefixime 200mg', form: 'tab', schedule: 'H1', pack: '10 tab strip', mrp_inr: 102, chronic: false },
  { id: 'd-levoflox500', name: 'Levoflox 500', salt: 'Levofloxacin 500mg', form: 'tab', schedule: 'H1', pack: '10 tab strip', mrp_inr: 98, chronic: false },
  { id: 'd-cepodem200', name: 'Cepodem 200', salt: 'Cefpodoxime 200mg', form: 'tab', schedule: 'H1', pack: '10 tab strip', mrp_inr: 214, chronic: false },
  { id: 'd-alprax025', name: 'Alprax 0.25', salt: 'Alprazolam 0.25mg', form: 'tab', schedule: 'H1', pack: '15 tab strip', mrp_inr: 41, chronic: false },
  { id: 'd-ultracet', name: 'Ultracet', salt: 'Tramadol 37.5mg + Paracetamol 325mg', form: 'tab', schedule: 'H1', pack: '15 tab strip', mrp_inr: 246, chronic: false },
];

const W1 = 'w-tatanagar';
const W2 = 'w-bistupur';
const W3 = 'w-kalpana';

export function seedDB(today: ISODate, now: string = new Date().toISOString()): DB {
  const r = rng(20261124);
  const shop: Shop = {
    id: SHOP_ID,
    name: 'Sharma Medical Hall',
    owner_name: 'Rakesh Sharma',
    phone: '919800000001',
    drug_license_no: 'JH-ESI-20-1187/21-1187',
    license_valid_until: addDays(today, 412),
    pharmacist_name: 'Rakesh Sharma',
    pharmacist_reg_no: 'JSPC-14523',
    pharmacist_reg_valid_until: addDays(today, 41),
    gstin: '20ABCDE1234F1Z5',
    address: 'Shop 4, Main Road, Sakchi',
    city: 'Jamshedpur',
    created_at: at(addDays(today, -400)),
  };

  const wholesalers: Wholesaler[] = [
    { id: W1, shop_id: SHOP_ID, name: 'Tatanagar Pharma Distributors', phone: '919800000101', license_no: 'JH-ESI-20B-0421/21B-0421', city: 'Sakchi', return_window_days: 30, credit_pct: 100, min_shelf_life_months: 6 },
    { id: W2, shop_id: SHOP_ID, name: 'Bistupur Medico Agencies', phone: '919800000102', license_no: 'JH-ESI-20B-0388/21B-0388', city: 'Bistupur', return_window_days: 60, credit_pct: 90, min_shelf_life_months: 6 },
    { id: W3, shop_id: SHOP_ID, name: 'Kalpana Drug House', phone: '919800000103', license_no: 'JH-ESI-20B-0510/21B-0510', city: 'Sakchi', return_window_days: 15, credit_pct: 80, min_shelf_life_months: 9 },
  ];
  const wName = (id: string) => wholesalers.find((w) => w.id === id)!.name;

  // [drug id, expiry offset (days from today), qty, wholesaler, extra]
  type Spec = [string, number, number, string, Partial<Batch>?];
  const specs: Spec[] = [
    // already expired and still on the shelf (compliance gap + return now)
    ['d-benadryl', -12, 6, W2],
    ['d-ondem4', -4, 9, W3],
    // ≤ 30 days
    ['d-allegra120', 9, 14, W1],
    ['d-montairlc', 18, 11, W2],
    ['d-shelcal500', 24, 20, W1],
    ['d-azithral500', 27, 12, W3],
    ['d-telma40', 21, 6, W1],
    // 31–60
    ['d-augmentin625', 38, 15, W1],
    ['d-digene', 44, 7, W2],
    ['d-pan40', 52, 18, W2],
    ['d-levoflox500', 57, 10, W3],
    ['d-glycometgp1', 46, 12, W1],
    // 61–90
    ['d-becosules', 66, 30, W2],
    ['d-taximo200', 71, 16, W1],
    ['d-rosuvas10', 79, 8, W2],
    ['d-dolo650', 84, 40, W1],
    // healthy stock
    ['d-telma40', 300, 10, W1],
    ['d-telmikind40', 420, 20, W2],
    ['d-glycomet500', 380, 40, W1],
    ['d-glyciphage500', 500, 25, W2],
    ['d-glycometgp1', 260, 8, W1],
    ['d-ecosprin75', 610, 90, W2],
    ['d-atorva10', 240, 6, W1],
    ['d-amlong5', 330, 3, W1],
    ['d-amlokind5', 450, 24, W2],
    ['d-thyronorm50', 200, 2, W3],
    ['d-jalra50', 290, 4, W1],
    ['d-concor5', 360, 12, W2],
    ['d-dolo650', 410, 60, W1],
    ['d-crocin650', 520, 30, W2],
    ['d-pan40', 390, 25, W2],
    ['d-pantocid40', 300, 10, W3],
    ['d-azithral500', 450, 10, W3],
    ['d-zifi200', 330, 8, W2],
    ['d-cepodem200', 280, 6, W1],
    ['d-alprax025', 350, 10, W3],
    ['d-ultracet', 400, 6, W1],
    ['d-shelcal500', 380, 25, W1],
    // history: returned expired Benadryl last month (dead-stock signal)
    ['d-benadryl', -45, 0, W2, { status: 'returned' }],
  ];

  const batches: Batch[] = specs.map(([did, exp, qty, wid, extra], i) => {
    const d = DRUGS.find((x) => x.id === did)!;
    const costFactor = 0.68 + r() * 0.1;
    const expiry = addDays(today, exp);
    return {
      id: `b-${String(i + 1).padStart(3, '0')}`,
      shop_id: SHOP_ID,
      drug_id: d.id,
      medicine_name: d.name,
      batch_no: `${d.name.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}${String(2400 + Math.floor(r() * 7000))}`,
      expiry_date: expiry,
      qty,
      cost_inr: round2(d.mrp_inr * costFactor),
      mrp_inr: d.mrp_inr,
      distributor_name: wName(wid),
      wholesaler_id: wid,
      is_schedule_h1: d.schedule === 'H1',
      dead_stock_risk: false,
      status: 'active',
      bill_id: null,
      received_at: addDays(today, -15 - Math.floor(r() * 150)),
      created_at: at(addDays(today, -30)),
      ...extra,
    };
  });
  // Benadryl on shelf is dead-stock risk (same drug was returned expired)
  for (const b of batches) if (b.drug_id === 'd-benadryl' && b.status === 'active') b.dead_stock_risk = true;

  const patients: Patient[] = [
    mkPatient('p-01', 'Sunita Devi', '919800001001', [['d-telma40', 'Telma 40', 2], ['d-ecosprin75', 'Ecosprin 75', 2]], 30, 2, 540, true, 'hi'),
    mkPatient('p-02', 'Ramesh Mahato', '919800001002', [['d-glycomet500', 'Glycomet 500', 3], ['d-atorva10', 'Atorva 10', 2]], 30, 1, 470, true, 'hi'),
    mkPatient('p-03', 'Farida Begum', '919800001003', [['d-thyronorm50', 'Thyronorm 50', 1]], 30, 3, 180, true, 'hi'),
    mkPatient('p-04', 'Joseph Kujur', '919800001004', [['d-amlong5', 'Amlong 5', 2], ['d-concor5', 'Concor 5', 3]], 30, 0, 564, true, 'en'),
    mkPatient('p-05', 'Anjali Singh', '919800001005', [['d-jalra50', 'Jalra 50', 2], ['d-glycometgp1', 'Glycomet GP 1', 2]], 30, 6, 786, true, 'en'),
    mkPatient('p-06', 'Mohan Lal Agarwal', '919800001006', [['d-rosuvas10', 'Rosuvas 10', 2], ['d-telma40', 'Telma 40', 2]], 30, 9, 1100, false, 'hi'),
    mkPatient('p-07', 'Kavita Soren', '919800001007', [['d-amlong5', 'Amlong 5', 2]], 30, 12, 144, true, 'hi'),
    mkPatient('p-08', 'Prakash Gupta', '919800001008', [['d-telma40', 'Telma 40', 2], ['d-glycomet500', 'Glycomet 500', 2]], 28, 2, 544, true, 'en'),
  ];
  function mkPatient(
    id: string,
    name: string,
    phone: string,
    meds: [string, string, number][],
    cycle: number,
    inDays: number,
    bill: number,
    optIn: boolean,
    lang: 'hi' | 'en',
  ): Patient {
    return {
      id,
      shop_id: SHOP_ID,
      patient_name: name,
      whatsapp_phone: phone,
      medicine_summary: meds.map((m) => m[1]).join(', '),
      medicines: meds.map(([drug_id, n, packs]) => ({ drug_id, name: n, packs_per_cycle: packs })),
      refill_cycle_days: cycle,
      next_refill_date: addDays(today, inDays),
      monthly_bill_inr: bill,
      dpdp_opt_in: optIn,
      preferred_lang: lang,
      refill_status: 'none',
      last_nudged_at: null,
      last_reply: null,
      created_at: at(addDays(today, -200)),
    };
  }

  const consents: Consent[] = patients
    .filter((p) => p.dpdp_opt_in && p.id !== 'p-07') // p-07: opted in on paper, no record yet (compliance gap)
    .map((p, i) => ({
      id: `c-${i + 1}`,
      shop_id: SHOP_ID,
      patient_id: p.id,
      purpose: 'Refill reminders on WhatsApp for my regular medicines',
      channel: 'counter',
      given_at: at(addDays(today, -180 + i * 7), 11, 15),
      withdrawn_at: null,
      evidence: 'Counter consent, read aloud in preferred language, signed on screen',
    }));

  // 60 days of synthetic dispensing for sell-through
  const dispenses: Dispense[] = [];
  const pace: Record<string, number> = {
    'd-dolo650': 2.2, 'd-pan40': 0.9, 'd-azithral500': 0.25, 'd-allegra120': 0.15, 'd-montairlc': 0.3, 'd-shelcal500': 0.5,
    'd-augmentin625': 0.35, 'd-becosules': 0.4, 'd-digene': 0.1, 'd-crocin650': 0.6, 'd-telma40': 0.35, 'd-glycomet500': 0.6,
    'd-ecosprin75': 1.1, 'd-atorva10': 0.3, 'd-amlong5': 0.45, 'd-taximo200': 0.2, 'd-levoflox500': 0.12, 'd-rosuvas10': 0.08,
    'd-concor5': 0.2, 'd-glycometgp1': 0.15, 'd-thyronorm50': 0.05, 'd-ondem4': 0.05, 'd-ultracet': 0.07, 'd-alprax025': 0.08,
  };
  let k = 0;
  for (let day = 60; day >= 1; day--) {
    const d = addDays(today, -day);
    for (const [did, p] of Object.entries(pace)) {
      const n = Math.floor(p + r());
      if (n > 0) {
        const drug = DRUGS.find((x) => x.id === did)!;
        dispenses.push({ id: `s-${++k}`, shop_id: SHOP_ID, batch_id: null, drug_id: did, medicine_name: drug.name, qty: n, patient_id: null, sold_at: at(d, 9 + Math.floor(r() * 11), Math.floor(r() * 60)) });
      }
    }
  }

  const doctors = [
    ['Dr. A. K. Sinha', 'Sinha Clinic, Bistupur, Jamshedpur', 'JMC-23114'],
    ['Dr. Neha Prasad', 'Tata Main Hospital OPD, Bistupur', 'JMC-30871'],
    ['Dr. S. Hembrom', 'Sakchi Health Centre, Sakchi', 'JMC-18802'],
  ];
  const h1Drugs = DRUGS.filter((d) => d.schedule === 'H1');
  const h1: H1Entry[] = Array.from({ length: 11 }, (_, i) => {
    const doc = doctors[i % doctors.length];
    const drug = h1Drugs[i % h1Drugs.length];
    const date = addDays(today, -3 - i * 4);
    return {
      id: `h-${i + 1}`,
      shop_id: SHOP_ID,
      dispensed_date: date,
      patient_name: ['Arun Kumar', 'Seema Oraon', 'Vikas Jha', 'Rina Das', 'Imran Ali', 'Pooja Rani', 'Deepak Murmu', 'Laxmi Devi', 'Sanjay Tiwari', 'Neelam Kumari', 'Ravi Shankar'][i],
      patient_address: ['Sakchi', 'Kadma', 'Sonari', 'Bistupur', 'Mango', 'Telco', 'Baridih', 'Jugsalai', 'Golmuri', 'Parsudih', 'Sidhgora'][i] + ', Jamshedpur',
      doctor_name: doc[0],
      doctor_address: i === 4 ? '' : doc[1], // one incomplete entry for Inspector Mode
      doctor_reg_no: doc[2],
      drug_name: drug.name,
      batch_no: `${drug.name.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}${3100 + i * 17}`,
      qty: 1 + (i % 2),
      rx_image_url: null,
      retain_until: retainUntil(date),
      created_by: 'Rakesh Sharma',
      created_at: at(date, 12),
    };
  });

  const credits: CreditNote[] = [
    credit('cn-1', W1, 'Cough syrup DX', 'CSD1120', 10, 1180, -52, 'pending', 2),
    credit('cn-2', W2, 'Benadryl Cough Syrup', 'BEN2231', 8, 712, -31, 'pending', 1),
    credit('cn-3', W3, 'Zincovit', 'ZIN5512', 12, 864, -17, 'pending', 0),
    credit('cn-4', W1, 'Combiflam', 'COM8812', 20, 620, -40, 'settled', 1, -6),
    credit('cn-5', W2, 'Cetzine', 'CET1290', 15, 405, -28, 'settled', 0, -3),
    credit('cn-6', W1, 'Volini Gel', 'VOL3321', 6, 840, -75, 'settled', 2, -38),
  ];
  function credit(
    id: string,
    wid: string,
    med: string,
    batch: string,
    qty: number,
    amt: number,
    raised: number,
    status: 'pending' | 'settled',
    chase: number,
    settled?: number,
  ): CreditNote {
    return {
      id,
      shop_id: SHOP_ID,
      wholesaler_id: wid,
      distributor_name: wName(wid),
      batch_id: null,
      medicine_name: med,
      batch_no: batch,
      qty,
      claim_amount_inr: amt,
      return_slip_no: `RS-${id.toUpperCase()}`,
      return_slip_pdf_url: null,
      status,
      raised_at: at(addDays(today, raised)),
      chase_count: chase,
      last_chased_at: chase ? at(addDays(today, raised + 15 * chase)) : null,
      settled_at: settled !== undefined ? at(addDays(today, settled)) : null,
      settled_amount_inr: settled !== undefined ? amt : null,
    };
  }

  // Earlier bills give the price history and scheme baseline used by the Delivery Verifier.
  const prevBills: PurchaseBill[] = [
    {
      id: 'pb-1',
      shop_id: SHOP_ID,
      wholesaler_id: W1,
      distributor_name: wName(W1),
      bill_no: 'TPD/25-26/4471',
      bill_date: addDays(today, -34),
      total_inr: 0,
      image_url: null,
      source: 'manual',
      lines: [
        line('Telma 40', 'TEL7712', addDays(today, 300), 10, 1, 162.5, 238),
        line('Glycomet 500', 'GLY4410', addDays(today, 380), 40, 4, 23.1, 34),
        line('Dolo 650', 'DOL1180', addDays(today, 410), 60, 6, 23.8, 34),
        line('Atorva 10', 'ATO2290', addDays(today, 240), 6, 0, 82.6, 118),
        line('Amlong 5', 'AML5521', addDays(today, 330), 10, 1, 50.4, 72),
      ],
      issues: [],
      order_id: null,
      created_at: at(addDays(today, -34), 17),
    },
  ];
  prevBills[0].total_inr = round2(prevBills[0].lines.reduce((s, l) => s + l.qty * l.cost_inr, 0));

  // The order now awaiting delivery: the sample bill is checked against this.
  const pendingOrder: Order = {
    id: 'o-1',
    shop_id: SHOP_ID,
    wholesaler_id: W1,
    lines: [
      { drug_id: 'd-telma40', medicine_name: 'Telma 40', qty: 10, est_cost_inr: 162.5, reason: '4 refill patients due' },
      { drug_id: 'd-glycomet500', medicine_name: 'Glycomet 500', qty: 30, est_cost_inr: 23.1, reason: 'sells 0.6/day + 2 patients' },
      { drug_id: 'd-amlong5', medicine_name: 'Amlong 5', qty: 10, est_cost_inr: 50.4, reason: '3 on hand, 2 patients due' },
      { drug_id: 'd-dolo650', medicine_name: 'Dolo 650', qty: 30, est_cost_inr: 23.8, reason: 'fast mover' },
    ],
    status: 'sent',
    total_est_inr: 0,
    sent_via: 'wa.me',
    created_at: at(addDays(today, -2), 9),
    sent_at: at(addDays(today, -2), 9, 5),
    bill_id: null,
  };
  pendingOrder.total_est_inr = round2(pendingOrder.lines.reduce((s, l) => s + l.qty * l.est_cost_inr, 0));

  const audit: AuditEvent[] = [
    { id: 'a-1', shop_id: SHOP_ID, at: at(addDays(today, -2), 9, 5), actor: 'Rakesh Sharma', action: 'order.sent', entity: 'orders', entity_id: 'o-1', details: { via: 'wa.me', to: wName(W1), lines: 4 } },
    { id: 'a-2', shop_id: SHOP_ID, at: at(addDays(today, -3), 18, 40), actor: 'Rakesh Sharma', action: 'credit.settled', entity: 'credit_notes', entity_id: 'cn-5', details: { amount_inr: 405 } },
    { id: 'a-3', shop_id: SHOP_ID, at: at(addDays(today, -1), 20, 2), actor: 'system', action: 'demo.seeded', entity: 'shops', entity_id: SHOP_ID, details: { note: 'synthetic data' } },
  ];

  return {
    shops: [shop],
    wholesalers,
    drug_master: DRUGS,
    inventory_batches: batches,
    chronic_patients: patients,
    consent_log: consents,
    schedule_h1_logs: h1,
    credit_notes: credits,
    purchase_bills: prevBills,
    orders: [pendingOrder],
    dispenses,
    agent_tasks: [],
    audit_events: audit,
    messages: [],
  };

  function line(name: string, batch: string, exp: string, qty: number, free: number, cost: number, mrp: number) {
    const d = DRUGS.find((x) => x.name === name);
    return { medicine_name: name, batch_no: batch, expiry_date: exp, qty, free_qty: free, cost_inr: cost, mrp_inr: mrp, is_schedule_h1: d?.schedule === 'H1', confidence: 1, drug_id: d?.id ?? null };
  }
  void now;
}
