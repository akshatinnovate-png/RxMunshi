'use client';
// Browser-only helpers: downloads, voice (Web Speech API), speech output, chime.

interface NativeBridge {
  saveFile(name: string, base64: string, mime: string): void;
}

export function download(filename: string, content: string | Blob, type = 'text/plain;charset=utf-8') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  // Android app: a WebView cannot save blob downloads, so hand the bytes to the native side
  const native = (window as unknown as { RxNative?: NativeBridge }).RxNative;
  if (native) {
    const r = new FileReader();
    r.onload = () => native.saveFile(filename, String(r.result).split(',')[1] ?? '', blob.type || type);
    r.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export function speechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** "Bolo, likho mat": listens once in Hindi (India) by default. Returns a stop function. */
export function listen(opts: { lang?: string; onText: (text: string, final: boolean) => void; onEnd: () => void; onError?: (e: string) => void }): () => void {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) {
    opts.onError?.('Voice needs Chrome or Edge.');
    opts.onEnd();
    return () => {};
  }
  const r = new Ctor();
  r.lang = opts.lang || 'hi-IN';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      final = final || e.results[i].isFinal;
    }
    opts.onText(text, final);
  };
  r.onerror = (e) => opts.onError?.(e.error === 'not-allowed' ? 'Microphone permission was refused.' : e.error);
  r.onend = () => opts.onEnd();
  r.start();
  return () => r.stop();
}

export function speak(text: string, lang: 'hi' | 'en' = 'hi') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text.replace(/₹/g, 'rupees ').slice(0, 300));
  u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  u.rate = 1.02;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/** Two-note chime for a live YES reply. */
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = [880, 1318.5];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.14 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.14);
      o.stop(ctx.currentTime + i * 0.14 + 0.25);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* audio blocked: the banner still shows */
  }
}

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export async function fileToDataURL(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}
