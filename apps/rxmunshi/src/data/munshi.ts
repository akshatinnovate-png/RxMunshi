// Munshi's loop in the browser. With Gemini: the model picks tools, the
// browser runs them on the shop's records, results go back, the model answers.
// Without Gemini (Demo mode, no key, no network): the offline planner maps the
// sentence to the same tools. Either way, write tools only create proposals.
import type { DB } from '@/core/types';
import { parseIntent } from '@/core/intents';
import { runTool, type ToolResult } from '@/core/agent';
import { apiFetch } from './api';

export interface MunshiReply {
  text: string;
  results: ToolResult[];
  via: 'gemini' | 'offline';
  ms: number;
  note?: string;
}

interface Part {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}
interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface HistoryTurn {
  role: 'user' | 'munshi';
  text: string;
}

function forModel(r: ToolResult) {
  return {
    title: r.title,
    text: r.text,
    rows: r.table ? r.table.rows.slice(0, 25).map((row) => Object.fromEntries(r.table!.columns.map((c, i) => [c, row[i]]))) : undefined,
    proposals: r.tasks?.map((t) => ({ title: t.title, amount_inr: t.amount_inr })) ?? undefined,
    evidence: r.evidence,
  };
}

export function askOffline(text: string, db: DB, today: string): MunshiReply {
  const t0 = performance.now();
  const intent = parseIntent(text);
  const result = runTool(intent.tool, intent.args as Record<string, unknown>, { db, today });
  return { text: result.text, results: [result], via: 'offline', ms: Math.round(performance.now() - t0) };
}

export async function ask(
  text: string,
  getDB: () => DB,
  today: string,
  history: HistoryTurn[],
  useGemini: boolean,
): Promise<MunshiReply> {
  if (!useGemini) return askOffline(text, getDB(), today);
  const t0 = performance.now();
  const contents: Content[] = [
    ...history.slice(-8).map((h): Content => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text }] },
  ];
  const results: ToolResult[] = [];
  try {
    for (let step = 0; step < 4; step++) {
      const res = await apiFetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, today, shop: getDB().shops[0]?.name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const { content } = (await res.json()) as { content: Content };
      const calls = content.parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const answer = content.parts.map((p) => p.text || '').join('').trim();
        return { text: answer || results.at(-1)?.text || '…', results, via: 'gemini', ms: Math.round(performance.now() - t0) };
      }
      contents.push({ role: 'model', parts: content.parts });
      const responses: Part[] = [];
      for (const c of calls) {
        const r = runTool(c.functionCall!.name, c.functionCall!.args || {}, { db: getDB(), today });
        results.push(r);
        responses.push({ functionResponse: { name: c.functionCall!.name, response: forModel(r) } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    return { text: results.at(-1)?.text ?? 'Done.', results, via: 'gemini', ms: Math.round(performance.now() - t0) };
  } catch (e) {
    const off = askOffline(text, getDB(), today);
    return { ...off, note: `Gemini unavailable (${e instanceof Error ? e.message.slice(0, 80) : 'error'}); answered offline.` };
  }
}
