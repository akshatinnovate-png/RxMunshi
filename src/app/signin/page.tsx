'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/data/liveStore';
import { lsSet } from '@/lib/browser';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [needsShop, setNeedsShop] = useState(false);
  const [shop, setShop] = useState('');
  const [city, setCity] = useState('');
  const [err, setErr] = useState('');
  const sb = supabase();

  useEffect(() => {
    if (!sb) return;
    const check = async () => {
      const { data } = await sb.auth.getUser();
      if (!data.user) return;
      const { data: m } = await sb.from('shop_members').select('shop_id').eq('user_id', data.user.id).limit(1).maybeSingle();
      if (m) {
        lsSet('rxmunshi.mode', 'live');
        window.location.href = '/today';
      } else setNeedsShop(true);
    };
    check();
    const { data: sub } = sb.auth.onAuthStateChange(() => check());
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  if (!sb)
    return (
      <div className="center">
        <div className="win rg" style={{ width: 420 }}>
          <div className="tb"><span className="t">sign in</span></div>
          <div className="body p">
            Live mode needs Supabase (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY). <a href="/today">Open the demo ▸</a>
          </div>
        </div>
      </div>
    );

  return (
    <div className="center">
      <div className="win rg focused" style={{ width: 420 }}>
        <div className="tb">
          <span className="t">{needsShop ? 'create your shop' : 'sign in · rxmunshi'}</span>
        </div>
        <div className="body stack">
          {needsShop ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const { error } = await sb.rpc('create_shop', { p_name: shop, p_city: city });
                if (error) setErr(error.message);
                else {
                  lsSet('rxmunshi.mode', 'live');
                  window.location.href = '/settings';
                }
              }}
            >
              <label className="field">
                Pharmacy name
                <input className="input" required value={shop} onChange={(e) => setShop(e.target.value)} />
              </label>
              <label className="field">
                City
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <button className="btn hot">Create shop ▸</button>
            </form>
          ) : sent ? (
            <p className="p">Check {email} for the sign-in link. Open it on this computer.</p>
          ) : (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/signin` } });
                if (error) setErr(error.message);
                else setSent(true);
              }}
            >
              <label className="field">
                Email
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </label>
              <button className="btn hot">Send sign-in link ▸</button>
              <a
                className="hint"
                href="/today"
                onClick={() => lsSet('rxmunshi.mode', 'demo')}
              >
                Or open the demo shop (no account) ▸
              </a>
            </form>
          )}
          {err && <div className="note warnnote">{err}</div>}
        </div>
      </div>
    </div>
  );
}
