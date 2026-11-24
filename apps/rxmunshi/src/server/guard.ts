import 'server-only';
import { createClient } from '@supabase/supabase-js';

const hits = new Map<string, number[]>();

/** Small per-instance sliding-window limiter: enough to stop a public demo URL being drained. */
export function rateLimited(req: Request, bucket: string, perMinute: number): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const xs = (hits.get(key) || []).filter((t) => now - t < 60_000);
  xs.push(now);
  hits.set(key, xs);
  return xs.length > perMinute;
}

export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * When Supabase is configured, server routes that spend money (Gemini, WhatsApp)
 * need a signed-in member. Returns the user id, null if not signed in, or
 * 'demo' when Supabase is not configured (public demo deployments).
 */
export async function currentUser(req: Request): Promise<{ id: string; token: string } | 'demo' | null> {
  if (!supabaseConfigured()) return 'demo';
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return null;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.auth.getUser(token);
  return data.user ? { id: data.user.id, token } : null;
}

export function userClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);
export const MAX_UPLOAD = 8 * 1024 * 1024;

export async function readUpload(req: Request): Promise<{ data: string; mimeType: string } | { error: string; status: number }> {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return { error: 'Attach a file named "file".', status: 400 };
  if (!IMAGE_TYPES.has(file.type)) return { error: `Unsupported type ${file.type || 'unknown'}: use JPG, PNG, WEBP or PDF.`, status: 415 };
  if (file.size > MAX_UPLOAD) return { error: 'File is over 8 MB.', status: 413 };
  const buf = Buffer.from(await file.arrayBuffer());
  return { data: buf.toString('base64'), mimeType: file.type };
}
