/**
 * Compares the archive's final balances (archive-balances.jsonl) with what the
 * Babylon genesis credited (genesis-changes.jsonl), account by account and
 * token by token, exactly (to 18 decimals, with integer arithmetic).
 * Prints a summary and writes differences.jsonl for the cases that differ.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const SCALE = 10n ** 18n;
/** A decimal string as an integer number of 10^-18 units. */
function units(decimal) {
  const negative = decimal.startsWith('-');
  const [whole, fraction = ''] = decimal.replace('-', '').split('.');
  const value = BigInt(whole || '0') * SCALE + BigInt((fraction + '0'.repeat(18)).slice(0, 18) || '0');
  return negative ? -value : value;
}
async function* lines(path) {
  for await (const line of createInterface({ input: createReadStream(path) })) if (line) yield JSON.parse(line);
}

const archive = new Map();
for await (const r of lines('archive-balances.jsonl')) archive.set(`${r.e}|${r.r}`, { b: BigInt(r.b), rri: r.rri });
const olympiaResources = new Set([...archive.keys()].map((k) => k.split('|')[1]));

const genesis = new Map();
for await (const c of lines('genesis-changes.jsonl')) {
  if (!c.e.startsWith('account_') || !olympiaResources.has(c.r)) continue;
  const key = `${c.e}|${c.r}`;
  genesis.set(key, (genesis.get(key) ?? 0n) + units(c.d));
}
for (const [k, v] of genesis) if (v === 0n) genesis.delete(k);

let equal = 0;
const differences = [];
for (const [key, a] of archive) {
  const g = genesis.get(key);
  if (g === a.b) equal += 1;
  else differences.push({ key, rri: a.rri, archive: a.b.toString(), genesis: g === undefined ? null : g.toString() });
}
for (const [key, g] of genesis) if (!archive.has(key)) differences.push({ key, rri: null, archive: null, genesis: g.toString() });

writeFileSync('differences.jsonl', differences.map((d) => JSON.stringify(d)).join('\n'));
console.log(JSON.stringify({
  archiveBalances: archive.size,
  genesisBalances: genesis.size,
  equalExactly: equal,
  differences: differences.length,
  tokensCompared: olympiaResources.size,
}, null, 2));
console.log('Differences written to differences.jsonl (amounts in 10^-18 units).');
