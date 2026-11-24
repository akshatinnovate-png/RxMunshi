import { supabase } from './liveStore';

/** fetch() with the signed-in member's token, for server routes that need it in live mode. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const sb = supabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  return fetch(url, { ...init, headers });
}
