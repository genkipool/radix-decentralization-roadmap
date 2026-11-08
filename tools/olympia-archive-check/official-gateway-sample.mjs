/**
 * Checks a random sample of the archive against the official Olympia Gateway
 * (olympia-gateway.radixdlt.com), while it is still online: for 50 accounts,
 * the transaction count, the liquid XRD and the set of tokens held; and the
 * XRD staked of 20 validators. The archive's side is read through the public
 * Radix Community API, which serves the same Parquet files.
 * Needs archive-balances.jsonl (npm run archive) to pick the accounts.
 */
import { readFileSync } from 'node:fs';

const OFFICIAL = 'https://olympia-gateway.radixdlt.com';
const ARCHIVE_API = process.env.ARCHIVE_API || 'https://radix-community.genkipool.com/api/olympia';
const HEADERS = { 'content-type': 'application/json', 'user-agent': 'olympia-archive-check/1.0' };
const NET = { network: 'mainnet' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const official = async (path, body) => (await fetch(`${OFFICIAL}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })).json();
const archive = async (path) => (await fetch(`${ARCHIVE_API}/${path}`, { headers: HEADERS })).json();

/** A seeded shuffle, so the sample can be repeated. */
function sample(items, n, seed) {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

const accounts = [...new Set(readFileSync('archive-balances.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l).e))].sort();
let txs = 0; let xrd = 0; let tokens = 0;
for (const babylon of sample(accounts, 50, 20261108)) {
  const a = await archive(`account?address=${babylon}`);
  const id = { address: a.address };
  const count = (await official('/account/transactions', { network_identifier: NET, account_identifier: id, limit: 1 })).total_count;
  const balances = (await official('/account/balances', { network_identifier: NET, account_identifier: id })).account_balances;
  const liquid = new Map(balances.liquid_balances.map((b) => [b.token_identifier.rri, BigInt(b.value)]));
  const held = new Set([...(a.xrd ? [a.xrd] : []), ...a.tokens].map((t) => t.rri));
  if (count === a.activity.txCount) txs += 1; else console.log('tx count differs', a.address, count, a.activity.txCount);
  if (Math.abs(Number(liquid.get('xrd_rr1qy5wfsfh') ?? 0n) / 1e18 - a.totals.liquidXrd) < 1e-6) xrd += 1; else console.log('liquid XRD differs', a.address);
  if (liquid.size === held.size && [...liquid.keys()].every((rri) => held.has(rri))) tokens += 1; else console.log('tokens differ', a.address);
  await pause(300);
}
console.log(`accounts: transaction count ${txs}/50, liquid XRD ${xrd}/50, tokens held ${tokens}/50`);

const validators = (await official('/validators', { network_identifier: NET })).validators;
let stake = 0;
for (const v of sample(validators, 20, 7)) {
  const address = v.validator_identifier.address;
  const ours = (await archive(`validator?address=${address}`)).totalStakedXrd;
  const theirs = Number(BigInt(v.stake.value)) / 1e18;
  if (Math.abs(theirs - ours) <= Math.max(1e-6, theirs * 1e-12)) stake += 1; else console.log('stake differs', address, theirs, ours);
  await pause(300);
}
console.log(`validators: ${validators.length} listed, stake ${stake}/20`);
