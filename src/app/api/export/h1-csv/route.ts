import { currentUser, json, userClient } from '@/server/guard';
import { h1CSV } from '@/core/h1';
import type { H1Entry } from '@/core/types';

export const runtime = 'nodejs';

/** GET with the member's bearer token: the Drug-Inspector-ready Schedule H1 CSV (RLS applies). */
export async function GET(req: Request) {
  const user = await currentUser(req);
  if (user === 'demo') return json({ error: 'In Demo mode the CSV is built in the browser.' }, 400);
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const sb = userClient(user.token);
  const { data: shop } = await sb.from('shops').select('id, name, drug_license_no').limit(1).maybeSingle();
  if (!shop) return json({ error: 'No shop.' }, 404);
  const { data, error } = await sb.from('schedule_h1_logs').select('*').eq('shop_id', shop.id).order('dispensed_date');
  if (error) return json({ error: error.message }, 500);
  return new Response(h1CSV((data ?? []) as H1Entry[], shop), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="schedule-h1-register-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
