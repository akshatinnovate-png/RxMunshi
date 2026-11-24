// Domain types. Column names match the Postgres schema (snake_case) so rows
// move between the demo store and Supabase without mapping.

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISOTime = string; // full ISO timestamp

export type Role = 'owner' | 'pharmacist' | 'staff';
export type DrugSchedule = 'OTC' | 'G' | 'H' | 'H1' | 'X';

export interface Shop {
  id: ID;
  name: string;
  owner_name: string;
  phone: string;
  drug_license_no: string; // retail licence (Form 20/21)
  license_valid_until: ISODate;
  pharmacist_name: string;
  pharmacist_reg_no: string;
  pharmacist_reg_valid_until: ISODate;
  gstin: string;
  address: string;
  city: string;
  created_at: ISOTime;
}

export interface Wholesaler {
  id: ID;
  shop_id: ID;
  name: string;
  phone: string; // WhatsApp number, digits with country code
  license_no: string; // Form 20B/21B
  city: string;
  return_window_days: number; // accepts expiry returns until N days after expiry
  credit_pct: number; // % of cost credited on expiry returns
  min_shelf_life_months: number; // refuse deliveries with less shelf life than this
}

export interface Drug {
  id: ID;
  name: string; // brand + strength as sold, e.g. "Telma 40"
  salt: string; // generic composition, e.g. "Telmisartan 40mg"
  form: 'tab' | 'cap' | 'syrup' | 'inj' | 'cream' | 'drops' | 'other';
  schedule: DrugSchedule;
  pack: string; // "15 tab strip"
  mrp_inr: number; // per pack
  chronic: boolean;
}

export type BatchStatus = 'active' | 'returned' | 'sold' | 'quarantined';

export interface Batch {
  id: ID;
  shop_id: ID;
  drug_id: ID | null;
  medicine_name: string;
  batch_no: string;
  expiry_date: ISODate;
  qty: number; // packs on hand
  cost_inr: number; // per pack
  mrp_inr: number; // per pack
  distributor_name: string;
  wholesaler_id: ID | null;
  is_schedule_h1: boolean;
  dead_stock_risk: boolean;
  status: BatchStatus;
  bill_id: ID | null;
  received_at: ISODate;
  created_at: ISOTime;
}

export type RefillStatus = 'none' | 'due' | 'nudged' | 'confirmed' | 'ready' | 'collected' | 'declined';
export type Lang = 'hi' | 'en';

export interface PatientMedicine {
  drug_id: ID | null;
  name: string;
  packs_per_cycle: number;
}

export interface Patient {
  id: ID;
  shop_id: ID;
  patient_name: string;
  whatsapp_phone: string;
  medicine_summary: string;
  medicines: PatientMedicine[];
  refill_cycle_days: number;
  next_refill_date: ISODate;
  monthly_bill_inr: number;
  dpdp_opt_in: boolean;
  preferred_lang: Lang;
  refill_status: RefillStatus;
  last_nudged_at: ISOTime | null;
  last_reply: string | null;
  created_at: ISOTime;
}

export interface Consent {
  id: ID;
  shop_id: ID;
  patient_id: ID;
  purpose: string;
  channel: 'counter' | 'whatsapp';
  given_at: ISOTime;
  withdrawn_at: ISOTime | null;
  evidence: string;
}

export interface H1Entry {
  id: ID;
  shop_id: ID;
  dispensed_date: ISODate;
  patient_name: string;
  patient_address: string;
  doctor_name: string;
  doctor_address: string;
  doctor_reg_no: string;
  drug_name: string;
  batch_no: string;
  qty: number;
  rx_image_url: string | null;
  retain_until: ISODate;
  created_by: string;
  created_at: ISOTime;
}

export type CreditStatus = 'pending' | 'settled' | 'rejected';

export interface CreditNote {
  id: ID;
  shop_id: ID;
  wholesaler_id: ID | null;
  distributor_name: string;
  batch_id: ID | null;
  medicine_name: string;
  batch_no: string;
  qty: number;
  claim_amount_inr: number;
  return_slip_no: string;
  return_slip_pdf_url: string | null;
  status: CreditStatus;
  raised_at: ISOTime;
  chase_count: number;
  last_chased_at: ISOTime | null;
  settled_at: ISOTime | null;
  settled_amount_inr: number | null;
}

export interface BillLine {
  medicine_name: string;
  batch_no: string;
  expiry_date: ISODate;
  qty: number;
  free_qty: number;
  cost_inr: number; // per pack
  mrp_inr: number; // per pack
  is_schedule_h1: boolean;
  confidence: number; // 0..1, from OCR; 1 for typed values
  drug_id?: ID | null;
}

export type IssueKind =
  | 'price_up'
  | 'above_mrp'
  | 'short_qty'
  | 'missing_free'
  | 'short_dated'
  | 'duplicate_bill'
  | 'not_ordered'
  | 'dead_stock'
  | 'low_confidence';

export interface VerifyIssue {
  kind: IssueKind;
  severity: 'bad' | 'warn';
  line: number | null; // index into lines, null for bill-level
  message: string;
  amount_inr: number; // rupees at stake (0 when not money)
}

export interface PurchaseBill {
  id: ID;
  shop_id: ID;
  wholesaler_id: ID | null;
  distributor_name: string;
  bill_no: string;
  bill_date: ISODate;
  total_inr: number;
  image_url: string | null;
  source: 'ocr' | 'sample' | 'manual';
  lines: BillLine[];
  issues: VerifyIssue[];
  order_id: ID | null;
  created_at: ISOTime;
}

export type OrderStatus = 'draft' | 'approved' | 'sent' | 'delivered' | 'verified' | 'cancelled';

export interface OrderLine {
  drug_id: ID | null;
  medicine_name: string;
  qty: number;
  est_cost_inr: number; // per pack
  reason: string;
}

export interface Order {
  id: ID;
  shop_id: ID;
  wholesaler_id: ID;
  lines: OrderLine[];
  status: OrderStatus;
  total_est_inr: number;
  sent_via: 'cloud' | 'wa.me' | 'sim' | null;
  created_at: ISOTime;
  sent_at: ISOTime | null;
  bill_id: ID | null;
}

export interface Dispense {
  id: ID;
  shop_id: ID;
  batch_id: ID | null;
  drug_id: ID | null;
  medicine_name: string;
  qty: number;
  patient_id: ID | null;
  sold_at: ISOTime;
}

export type TaskStatus = 'proposed' | 'approved' | 'executed' | 'verified' | 'failed' | 'rejected';
export type TaskKind =
  | 'return_batches'
  | 'send_refill_nudges'
  | 'send_order'
  | 'chase_credit'
  | 'mark_settled'
  | 'quarantine_batches'
  | 'create_h1_entry'
  | 'message_wholesaler';

export interface AgentTask {
  id: ID;
  shop_id: ID;
  kind: TaskKind;
  title: string;
  reason: string;
  payload: Record<string, unknown>;
  amount_inr: number;
  status: TaskStatus;
  proposed_by: string; // 'munshi' | 'rule:<name>' | user
  decided_by: string | null;
  created_at: ISOTime;
  decided_at: ISOTime | null;
  executed_at: ISOTime | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface AuditEvent {
  id: ID;
  shop_id: ID;
  at: ISOTime;
  actor: string;
  action: string;
  entity: string;
  entity_id: ID | null;
  details: Record<string, unknown>;
}

export interface Message {
  id: ID;
  shop_id: ID;
  to_kind: 'patient' | 'wholesaler' | 'owner';
  to_id: ID | null;
  to_phone: string;
  direction: 'out' | 'in';
  body: string;
  lane: 'cloud' | 'wa.me' | 'sim';
  at: ISOTime;
}

export interface DB {
  shops: Shop[];
  wholesalers: Wholesaler[];
  drug_master: Drug[];
  inventory_batches: Batch[];
  chronic_patients: Patient[];
  consent_log: Consent[];
  schedule_h1_logs: H1Entry[];
  credit_notes: CreditNote[];
  purchase_bills: PurchaseBill[];
  orders: Order[];
  dispenses: Dispense[];
  agent_tasks: AgentTask[];
  audit_events: AuditEvent[];
  messages: Message[];
}

export type TableName = keyof DB;
export type Row<T extends TableName> = DB[T][number];

export const TABLES: TableName[] = [
  'shops',
  'wholesalers',
  'drug_master',
  'inventory_batches',
  'chronic_patients',
  'consent_log',
  'schedule_h1_logs',
  'credit_notes',
  'purchase_bills',
  'orders',
  'dispenses',
  'agent_tasks',
  'audit_events',
  'messages',
];

export function emptyDB(): DB {
  return Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as DB;
}
