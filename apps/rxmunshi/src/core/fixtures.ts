// Stage-demo fixtures: what Gemini returns for the sample bills and prescriptions.
// Used in Demo mode and whenever live OCR is unavailable. Labelled synthetic in the UI.
import type { BillLine, ISODate } from './types';
import type { RxRead } from './rx';
import { addDays } from './util';

export interface BillRead {
  distributor_name: string;
  bill_no: string;
  bill_date: ISODate;
  lines: BillLine[];
}

export interface SampleBill {
  id: string;
  label: string;
  read: (today: ISODate) => BillRead;
}

const L = (
  medicine_name: string,
  batch_no: string,
  expiry_date: string,
  qty: number,
  free_qty: number,
  cost_inr: number,
  mrp_inr: number,
  is_schedule_h1 = false,
  confidence = 0.97,
): BillLine => ({ medicine_name, batch_no, expiry_date, qty, free_qty, cost_inr, mrp_inr, is_schedule_h1, confidence });

export const SAMPLE_BILLS: SampleBill[] = [
  {
    id: 'tatanagar-4519',
    label: 'Tatanagar Pharma · delivery against order',
    read: (today) => ({
      distributor_name: 'Tatanagar Pharma Distributors',
      bill_no: 'TPD/25-26/4519',
      bill_date: today,
      lines: [
        L('Telma 40', 'TEL8120', addDays(today, 540), 10, 0, 171.0, 238),
        L('Glycomet 500', 'GLY4890', addDays(today, 610), 24, 2, 23.1, 34),
        L('Amlong 5', 'AML6034', addDays(today, 118), 10, 1, 50.4, 72),
        L('Dolo 650', 'DOL2291', addDays(today, 700), 30, 3, 23.8, 34, false, 0.99),
        L('Benadryl Cough Syrup', 'BEN3310', addDays(today, 420), 6, 0, 96.0, 128),
        L('Taxim-O 200', 'TAX5547', addDays(today, 480), 5, 0, 78.5, 109, true, 0.72),
      ],
    }),
  },
  {
    id: 'bistupur-1183',
    label: 'Bistupur Medico · routine bill',
    read: (today) => ({
      distributor_name: 'Bistupur Medico Agencies',
      bill_no: 'BMA/1183',
      bill_date: today,
      lines: [
        L('Telmikind 40', 'TLK2210', addDays(today, 640), 20, 2, 63.0, 92),
        L('Pan 40', 'PAN7781', addDays(today, 560), 15, 0, 139.0, 199),
        L('Concor 5', 'CON1190', addDays(today, 500), 10, 1, 98.0, 140),
        L('Montair LC', 'MON4402', addDays(today, 590), 10, 0, 201.0, 287),
      ],
    }),
  },
];

export interface SampleRx {
  id: string;
  label: string;
  read: (today: ISODate) => RxRead;
}

export const SAMPLE_RX: SampleRx[] = [
  {
    id: 'rx-h1',
    label: 'Antibiotic course (Schedule H1)',
    read: (today) => ({
      doctor_name: 'Dr. A. K. Sinha',
      doctor_address: 'Sinha Clinic, Bistupur, Jamshedpur',
      doctor_reg_no: 'JMC-23114',
      patient_name: 'Manoj Yadav',
      patient_address: 'Road 4, Kadma, Jamshedpur',
      date: today,
      lines: [
        { name: 'Taxim-O 200', dose: '1-0-1 × 5 days', qty: 1, confidence: 0.93 },
        { name: 'Pan 40', dose: '1-0-0 before food', qty: 1, confidence: 0.96 },
        { name: 'Dolo 650', dose: 'SOS', qty: 1, confidence: 0.98 },
      ],
    }),
  },
  {
    id: 'rx-chronic',
    label: 'Monthly BP + sugar (refill patient)',
    read: (today) => ({
      doctor_name: 'Dr. Neha Prasad',
      doctor_address: 'Tata Main Hospital OPD, Bistupur',
      doctor_reg_no: 'JMC-30871',
      patient_name: 'Sunita Devi',
      patient_address: 'Line 7, Sakchi, Jamshedpur',
      date: today,
      lines: [
        { name: 'Telma 40', dose: '1-0-0', qty: 2, confidence: 0.95 },
        { name: 'Glycomet 500', dose: '1-0-1', qty: 3, confidence: 0.91 },
        { name: 'Ecosprin 75', dose: '0-1-0 after food', qty: 2, confidence: 0.97 },
      ],
    }),
  },
];
