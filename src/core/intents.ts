// Offline understanding of Hindi, Hinglish and English requests ("Bolo, likho mat").
// Maps a sentence to a tool call. Used when Gemini is unavailable and to make
// voice filters instant.

export type Intent =
  | { tool: 'expiring_batches'; args: { days: number; name?: string } }
  | { tool: 'propose_returns'; args: { days: number } }
  | { tool: 'refills_due'; args: Record<string, never> }
  | { tool: 'propose_refill_nudges'; args: Record<string, never> }
  | { tool: 'credit_status'; args: Record<string, never> }
  | { tool: 'propose_credit_chases'; args: Record<string, never> }
  | { tool: 'reorder_suggestions'; args: Record<string, never> }
  | { tool: 'propose_reorders'; args: Record<string, never> }
  | { tool: 'stock_lookup'; args: { name: string } }
  | { tool: 'h1_register'; args: Record<string, never> }
  | { tool: 'compliance_check'; args: Record<string, never> }
  | { tool: 'morning_plan'; args: Record<string, never> }
  | { tool: 'price_history'; args: { name: string } }
  | { tool: 'dead_stock'; args: Record<string, never> }
  | { tool: 'sales_summary'; args: { days: number } }
  | { tool: 'quarantine_expired'; args: Record<string, never> }
  | { tool: 'help'; args: Record<string, never> };

const DEVANAGARI_HINTS: [RegExp, string][] = [
  [/एक्सपायर|खराब|ख़राब/g, ' expire '],
  [/अगले महीने|अगले मंथ/g, ' next month '],
  [/इस महीने/g, ' this month '],
  [/वापस|रिटर्न/g, ' return '],
  [/कर दो|करो|भेज दो|भेजो/g, ' do '],
  [/दवाई|दवा|दवाइयाँ|दवाइयां/g, ' dawai '],
  [/कितना|कितनी|कितने/g, ' kitna '],
  [/स्टॉक|माल/g, ' stock '],
  [/पैसा|पैसे|क्रेडिट/g, ' credit '],
  [/मरीज़|मरीज|रिफिल/g, ' refill '],
  [/ऑर्डर|मंगवा|मँगवा|मंगाना/g, ' order '],
  [/इंस्पेक्टर|जांच|जाँच/g, ' inspector '],
  [/आज का प्लान|प्लान|सुबह/g, ' plan '],
  [/दिन/g, ' din '],
  [/हफ्ते|हफ़्ते|सप्ताह/g, ' week '],
  [/रजिस्टर/g, ' register '],
  [/बिक्री|बिका|बेचा/g, ' sales '],
  [/हटा दो|अलग करो|अलग/g, ' quarantine '],
  [/दाम|भाव|रेट/g, ' price '],
];

const NUM_WORDS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, das: 10, bees: 20, tees: 30, saath: 60, nabbe: 90,
  one: 1, two: 2, three: 3, ten: 10, thirty: 30, sixty: 60, ninety: 90,
};

function norm(text: string): string {
  let s = ` ${text.toLowerCase()} `;
  for (const [re, rep] of DEVANAGARI_HINTS) s = s.replace(re, rep);
  return s.replace(/[?.,!।]/g, ' ').replace(/\s+/g, ' ');
}

function daysFrom(s: string, fallback: number): number {
  const m = s.match(/(\d{1,3})\s*(din|day|days|d\b)/);
  if (m) return Number(m[1]);
  const w = s.match(/(\d{1,2})\s*(week|hafte|hafta|weeks)/);
  if (w) return Number(w[1]) * 7;
  const mm = s.match(/(\d{1,2})\s*(month|mahine|mahina|months)/);
  if (mm) return Number(mm[1]) * 30;
  for (const [word, n] of Object.entries(NUM_WORDS)) {
    if (new RegExp(`\\b${word}\\s+(din|day|days)\\b`).test(s)) return n;
    if (new RegExp(`\\b${word}\\s+(mahine|month|months)\\b`).test(s)) return n * 30;
  }
  if (/next month|agle mahine|agle month|this month|is mahine/.test(s)) return 30;
  if (/week|hafte|hafta/.test(s)) return 7;
  if (/aaj|today/.test(s) && !/plan/.test(s)) return 0;
  return fallback;
}

const STOP = new Set(
  'kitna kitni kitne hai hain ka ki ke stock how much many of do we have left bacha bache bachi dawai medicine is the a me mein price rate history daam bhav'.split(' '),
);

function nameFrom(s: string): string {
  return s
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .join(' ')
    .trim();
}

export function parseIntent(text: string): Intent {
  const s = norm(text);
  const act = /\b(do|kar|karo|kar do|bhej|bhejo|send|raise|bana|banao|nikalo|start|chalu|please)\b/.test(s);

  if (/\b(help|madad|kya kar sakte)\b/.test(s)) return { tool: 'help', args: {} };
  if (/\b(plan|briefing|digest|aaj kya|today)\b/.test(s) && !/expire/.test(s)) return { tool: 'morning_plan', args: {} };
  if (/inspector|inspection|compliance|audit ready|ready for audit/.test(s)) return { tool: 'compliance_check', args: {} };
  if (/quarantine|segregate/.test(s)) return { tool: 'quarantine_expired', args: {} };
  if (/\breturn\b|wapas|vapas/.test(s)) return { tool: 'propose_returns', args: { days: daysFrom(s, 30) } };
  if (/\b(h1|h-1|register)\b/.test(s)) return { tool: 'h1_register', args: {} };
  if (/credit|paisa|paise|refund|money back|recover/.test(s))
    return act || /chase|yaad|remind/.test(s) ? { tool: 'propose_credit_chases', args: {} } : { tool: 'credit_status', args: {} };
  if (/refill|patient|nudge|reminder|yes/.test(s))
    return act ? { tool: 'propose_refill_nudges', args: {} } : { tool: 'refills_due', args: {} };
  if (/\b(order|reorder|mangwa|mangana|kharid|purchase|shortage|kam)\b/.test(s))
    return act ? { tool: 'propose_reorders', args: {} } : { tool: 'reorder_suggestions', args: {} };
  if (/dead stock|dead|nahi bik|not selling|slow/.test(s)) return { tool: 'dead_stock', args: {} };
  if (/\b(sales|bikri|sold|becha)\b/.test(s)) return { tool: 'sales_summary', args: { days: daysFrom(s, 7) } };
  if (/\b(price|rate|daam|bhav)\b/.test(s)) {
    const name = nameFrom(s.replace(/\b(price|rate|daam|bhav)\b/g, ' '));
    if (name) return { tool: 'price_history', args: { name } };
  }
  if (/expir|expiry|kharab/.test(s)) {
    const name = nameFrom(
      s.replace(/expire|expiry|expiring|kharab|kaun si|kaunsi|which|will|hogi|hoga|honge|next month|agle mahine|this month|in|within|ke andar|me|\d+\s*(din|days?|weeks?|months?)/g, ' '),
    );
    return { tool: 'expiring_batches', args: { days: daysFrom(s, 30), ...(name && name.length > 2 ? { name } : {}) } };
  }
  if (/stock|kitna|kitni|bacha|bache|left|have/.test(s)) {
    const name = nameFrom(s);
    if (name) return { tool: 'stock_lookup', args: { name } };
  }
  const bare = nameFrom(s);
  if (bare && bare.split(' ').length <= 3) return { tool: 'stock_lookup', args: { name: bare } };
  return { tool: 'help', args: {} };
}
