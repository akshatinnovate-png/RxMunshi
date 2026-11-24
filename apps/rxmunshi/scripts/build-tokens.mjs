// Generates src/styles/tokens.css from the PoshanSetu + ReachGrid design system tokens.
import { readFileSync, writeFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(new URL('../design-system/tokens.json', import.meta.url)));
const themes = t.color.themes.map((x) => x.id);
const first = themes[0];
const vars = Object.fromEntries(themes.map((id) => [id, []]));
const resolve = (v) => (typeof v === 'string' ? v.replace(/^\{(.+)\}$/, 'var(--$1)') : String(v));
for (const tok of t.color.tokens) {
  const v = typeof tok.value === 'object' ? tok.value : { [first]: tok.value };
  for (const id of themes) {
    const val = v[id] ?? v[first];
    if (id === first || (v[id] !== undefined && v[id] !== v[first])) vars[id].push(`--${tok.name}: ${resolve(val)};`);
  }
}
const plain = [];
for (const [fam, body] of Object.entries(t)) {
  if (fam === 'color' || fam === 'type' || !body || !Array.isArray(body.tokens)) continue;
  for (const tok of body.tokens) {
    if (typeof tok.value === 'object') {
      for (const id of themes) {
        const val = tok.value[id] ?? tok.value[first];
        if (id === first || (tok.value[id] !== undefined && tok.value[id] !== tok.value[first])) vars[id].push(`--${tok.name}: ${val};`);
      }
    } else plain.push(`--${tok.name}: ${tok.value};`);
  }
}
for (const [k, v] of Object.entries(t.type.families)) plain.push(`--font-${k}: ${v};`);
const faces = t.type.fonts
  .filter((f) => f.file && !/ol-chiki|warang/.test(f.file))
  .map((f) => `@font-face { font-family: "${f.family}"; src: url("/fonts/${f.file.split('/').pop()}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style || 'normal'}; font-display: swap; }`);
let css = `/* PoshanSetu + ReachGrid — generated from tokens.json */\n${faces.join('\n')}\n`;
css += `:root, [data-theme="${first}"] { ${plain.join(' ')} ${vars[first].join(' ')} }\n`;
for (const id of themes.slice(1)) css += `[data-theme="${id}"] { ${vars[first].join(' ')} ${vars[id].join(' ')} }\n`;
writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), css);
console.log('tokens.css written:', themes.join(', '));
