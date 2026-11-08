/**
 * Every fungible balance change made by the Babylon genesis transactions
 * (state versions 1 to 647; the first user transaction is 670), read from the
 * public Babylon Gateway.
 * Writes genesis-changes.jsonl: one {sv, e, r, d} per change
 * (state version, entity, resource, decimal change).
 */
import { createWriteStream } from 'node:fs';

const GATEWAY = process.env.BABYLON_GATEWAY || 'https://mainnet.radixdlt.com';
const LAST_GENESIS_VERSION = 647; // the genesis transactions are state versions 1 to 647
const out = createWriteStream('genesis-changes.jsonl');

let cursor;
let txs = 0;
let changes = 0;
for (;;) {
  const body = cursor
    ? { cursor, order: 'Asc', limit_per_page: 100, kind_filter: 'All', opt_ins: { balance_changes: true } }
    : { from_ledger_state: { state_version: 1 }, order: 'Asc', limit_per_page: 100, kind_filter: 'All', opt_ins: { balance_changes: true } };
  const res = await fetch(`${GATEWAY}/stream/transactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'olympia-archive-check/1.0' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gateway ${res.status}`);
  const page = await res.json();
  let done = false;
  for (const tx of page.items) {
    if (tx.state_version > LAST_GENESIS_VERSION) { done = true; break; }
    for (const c of tx.balance_changes?.fungible_balance_changes ?? []) {
      out.write(`${JSON.stringify({ sv: tx.state_version, e: c.entity_address, r: c.resource_address, d: c.balance_change })}\n`);
      changes += 1;
    }
    txs += 1;
  }
  cursor = page.next_cursor;
  if (done || !cursor) break;
}
out.end();
console.log(`${txs} genesis transactions, ${changes} balance changes`);
