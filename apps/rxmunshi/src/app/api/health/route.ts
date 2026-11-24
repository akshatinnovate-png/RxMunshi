import { geminiConfigured, GEMINI_MODEL } from '@/server/gemini';
import { json, supabaseConfigured } from '@/server/guard';

export const dynamic = 'force-dynamic';

/** Which integrations are configured (never their values). */
export function GET() {
  return json({
    ok: true,
    gemini: geminiConfigured(),
    model: geminiConfigured() ? GEMINI_MODEL : null,
    supabase: supabaseConfigured(),
    whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    time: new Date().toISOString(),
  });
}
