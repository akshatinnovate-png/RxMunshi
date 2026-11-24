'use client';
import { useMemo } from 'react';
import { useApp } from './app';
import { expirySummary } from '@/core/expiry';
import { adviseAll, chaseDue, creditSummary } from '@/core/returns';
import { refillsDue } from '@/core/refills';
import { reorderSuggestions } from '@/core/reorder';
import { complianceChecks, complianceScore } from '@/core/compliance';
import { h1Missing } from '@/core/h1';
import { sum } from '@/core/util';

/** Every headline number, computed once per change from the records (never by the model). */
export function useMetrics() {
  const { db, today } = useApp();
  return useMemo(() => {
    const exp = expirySummary(db.inventory_batches, today);
    const advice = adviseAll(db.inventory_batches, db.wholesalers, db.dispenses, db.chronic_patients, today);
    const returnNow = advice.filter((a) => a.action === 'return_now');
    const credits = creditSummary(db.credit_notes, today);
    const due = refillsDue(db.chronic_patients, today);
    const confirmed = db.chronic_patients.filter((p) => p.refill_status === 'confirmed');
    const reorder = reorderSuggestions(db, today);
    const checks = complianceChecks(db, today);
    const score = complianceScore(checks);
    return {
      exp,
      advice,
      returnNow,
      recoverableNow: sum(returnNow, (a) => a.rupees),
      credits,
      chase: chaseDue(db.credit_notes, today),
      due,
      confirmed,
      reorder,
      checks,
      score,
      openTasks: db.agent_tasks.filter((t) => t.status === 'proposed'),
      h1Incomplete: db.schedule_h1_logs.filter((e) => h1Missing(e).length).length,
    };
  }, [db, today]);
}
