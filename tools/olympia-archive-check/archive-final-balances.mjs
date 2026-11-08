/**
 * The Olympia archive's final balances, with each account translated to its
 * Babylon address and each token to its Babylon resource using the archive's
 * own indexes. Reads the public Parquet files on Hugging Face.
 * Writes archive-balances.jsonl: one {e, r, b, rri} per balance
 * (Babylon account, Babylon resource, balance in 10^-18 units, Olympia rri).
 */
import { createWriteStream } from 'node:fs';
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const BASE = (process.env.OLYMPIA_DATA_BASE_URL || 'https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main').replace(/\/+$/, '');
const text = (v) => (v instanceof Uint8Array ? Buffer.from(v).toString('utf8') : v == null ? null : String(v));

/** Every row of a file, one row group at a time. */
async function readAll(path, columns) {
  const file = await asyncBufferFromUrl({ url: `${BASE}/${path}` });
  const metadata = await parquetMetadataAsync(file);
  const rows = [];
  let start = 0;
  for (const group of metadata.row_groups) {
    const end = start + Number(group.num_rows);
    rows.push(...await parquetReadObjects({ file, metadata, rowStart: start, rowEnd: end, columns, compressors, utf8: false }));
    start = end;
  }
  return rows;
}

const accounts = new Map((await readAll('index/accounts_by_address.parquet', ['account_id', 'babylon_address'])).map((r) => [String(r.account_id), text(r.babylon_address)]));
const resources = new Map((await readAll('index/resources_by_rri.parquet', ['rri', 'babylon_resource_address'])).map((r) => [text(r.rri), text(r.babylon_resource_address)]));
const out = createWriteStream('archive-balances.jsonl');
let written = 0;
let unmapped = 0;
for (const r of await readAll('index/account_final_balances.parquet', ['account_id', 'rri', 'balance'])) {
  const account = accounts.get(String(r.account_id));
  const resource = resources.get(text(r.rri));
  if (!account || !resource) { unmapped += 1; continue; }
  out.write(`${JSON.stringify({ e: account, r: resource, b: text(r.balance), rri: text(r.rri) })}\n`);
  written += 1;
}
out.end();
console.log(`${written} balances (${unmapped} without a Babylon account or resource), ${accounts.size} accounts, ${resources.size} tokens`);
