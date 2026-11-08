[← Index](../../README.md) · [Chapter 8: roadmap](08-roadmap.md) · [Section 10.5: verifiable Olympia archive](10-implementation-guide.md#s10-5)

<a id="f0-1"></a>

# Progress · F0.1 Olympia archive and explorer

> [!IMPORTANT]
> - **Status:** completed on 8 Nov 2026.
> - **Developer:** GENKIPOOL.
> - **Difficulty:** Low, as section [10.5](10-implementation-guide.md#s10-5) estimated.
> - **Cost:** 0 USD / 0 EUR. No funding.

This document explains, step by step, how task 1 of phase F0 of the [roadmap](08-roadmap.md#s8-1) was completed: rescuing Olympia's history, publishing it and putting it to work in an explorer, so that it no longer depends on the Olympia Gateway, which is already switched off.

## Contents

1. [Why it was urgent](#why)
2. [Step 1: get the data](#step-1)
3. [Step 2: export to Parquet and build the indexes](#step-2)
4. [Step 3: publish the archive](#step-3)
5. [Step 4: read the archive from the web with no data server of its own](#step-4)
6. [Step 5: the Olympia explorer](#step-5)
7. [Step 6: Olympia inside the Babylon explorer](#step-6)
8. [Step 7: derived indexes built once](#step-7)
9. [Step 8: access for agents (MCP) and in the console](#step-8)
10. [Step 9: performance, security and cost](#step-9)
11. [Step 10: verification against the Babylon genesis](#step-10)
12. [How to use the archive to build your own explorer](#your-explorer)
13. [How to reproduce it](#reproduce)

<a id="why"></a>

## 1. Why it was urgent

- Olympia was the Radix mainnet from July 2021 until **28 Sep 2023 at 06:33:34 UTC**, when it was migrated to Babylon.
- Olympia's **state** (balances, stakes, tokens and validators) was loaded into the Babylon genesis, so nodes have it. Its transaction **history** was not: it only existed in the Olympia Gateway (`olympia-gateway.radixdlt.com`), a single service (section [2.2](01-02-current-situation.md#s2-2)).
- That Gateway is no longer online. Without a copy, more than two years of the network's history would have been lost.

<a id="step-1"></a>

## 2. Step 1: get the data

1. **An Olympia node database.** The starting point was `RADIXDB-api.tar.zst`, published in the archive.org item [radix-olympia-ledger-archive](https://archive.org/details/radix-olympia-ledger-archive), with SHA-256 `d3a00f5a263bbb20274276ed23d77ec93744c3a08fd6c5ef04e4f949eb0bb60c`.
2. **Serve that database.** The official node software, `radixdlt/radixdlt-core:1.5.0`, was started with the Core API enabled (`api.transactions.enable=true`), on an isolated network with no peers, so that it only served what it already had.
3. **Rebuild the Gateway.** The official Olympia Gateway software, `radixdlt/ng-data-aggregator:1.1.14` and `radixdlt/ng-gateway-api:1.1.14`, with PostgreSQL 12, ingested the full ledger from that node (November 2026).
4. **Check that it reached the end.** The Gateway API reported `ledger_state.version = 337759839`, equal to its `target_ledger_state`: Olympia's last version.

<a id="step-2"></a>

## 3. Step 2: export to Parquet and build the indexes

**Tables.** Every PostgreSQL table was exported to Parquet with DuckDB, zstd-compressed and ordered by its primary key. The two largest tables (`ledger_transactions` and `raw_transactions`) were split into ranges of 20,000,000 state versions.

**Export checks.**

- `SHA256SUMS.txt`: the SHA-256 of every file.
- `ROWCOUNTS.txt`: the row count of every file, checked against the PostgreSQL table it came from.

**Lookup indexes (`index/`).** The tables are ordered as in the database, which does not help to search by address. Auxiliary files were built, each sorted by the key it is looked up by and split into small row groups, with the minimum and maximum of that key in the file footer:

| Index | Sorted by | Used for |
|---|---|---|
| `accounts_by_address` | `rdx1…` address | Olympia account → internal id, public key and Babylon account |
| `accounts_by_babylon_address` | `account_rdx1…` address | The reverse: from a Babylon account to its Olympia past (the "file mapping each Olympia address to its Babylon account" that section [10.5](10-implementation-guide.md#s10-5) asked for) |
| `account_tx_detail` | account and version | Each account's history, newest first |
| `operations_by_account`, `account_balance_changes` | account and version | Each account's actions and balance changes |
| `account_final_balances`, `account_final_stakes` | account | What each account held when Olympia ended |
| `account_staking_rewards_daily` | account and day | Staking rewards per day and validator |
| `tx_by_id`, `user_tx_by_version`, `operations_by_version`, `balance_changes_by_version`, `raw_user_tx_by_version` | id or version | A full transaction |
| `resources_by_rri`, `resources_by_babylon_address`, `final_balances_by_resource` | token | Each token's data and its holders |
| `validators_by_address`, `final_stakes_by_validator`, `validator_staking_rewards_daily` | validator | Each validator's data, its delegators and its daily rewards |

The indexes have their own `index/SHA256SUMS.txt`.

**Archive size.** 175,567 accounts, 2,711,747 user transactions, 7,733,223 operations, 920 tokens, 254 validators and 3,271,724 validator proposal records.

<a id="step-3"></a>

## 4. Step 3: publish the archive

The archive is published in two independent places:

- **Hugging Face:** [Genkipool/radix-olympia-gateway-export](https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export), with the tables and the indexes.
- **archive.org:** [radix-olympia-gateway-export](https://archive.org/details/radix-olympia-gateway-export), with the tables.

Both allow downloading byte ranges (HTTP range requests), which is what makes the next step possible.

<a id="step-4"></a>

## 5. Step 4: read the archive from the web with no data server of its own

The explorer has no Olympia database. It reads the published Parquet files directly, with [hyparquet](https://github.com/hyparam/hyparquet):

1. It reads each file's **footer** once (a few KB) and keeps it in memory.
2. From each row group's minimum and maximum, it works out which groups can hold the key being looked for.
3. It requests **only those groups' bytes** with range requests. A typical lookup downloads a few hundred KB; a whole file is never downloaded.
4. It remembers the ranges already downloaded, so it never asks for them twice.

So looking up an account's history, a transaction or a token costs about as much as loading a web page, with no data servers to run. Since Olympia never changes, every response is marked as cacheable forever on the CDN.

<a id="step-5"></a>

## 6. Step 5: the Olympia explorer

Any Olympia identifier typed into the explorer's search box opens its card: an account (`rdx1…`), a validator (`rv1…`), a token (`<symbol>_rr1…`) or a transaction (64 hex characters). Every card has its own page at `/dashboard/olympia/<identifier>`.

| Card | Tabs |
|---|---|
| **Account** | Summary (balances when Olympia ended, activity, public key and Babylon account), Staking, Tokens, Transactions, Funds flow, Rewards (a table per year with a CoinTracking CSV), Security and Raw. Below the card, its transactions as cards, 15 at a time |
| **Validator** | Summary (profile, stake and its share of the network, owner stake, stake-unit to XRD factor, uptime over the whole of Olympia, stake over time and staking activity by day and by month), Delegators (all of them, paginated), Rewards, Metadata, Configuration and Raw |
| **Token** | Summary, Metadata, Configuration (who could mint and burn), Holders (the largest holders) and Raw |
| **Transaction** | Summary (transfers from origin to destination, burnt fee, affected and created entities, expandable), Details (status, message, actions and every balance change) and Raw receipt (the archive's data and the signed transaction in hex) |

Design decisions:

- **The Babylon design wherever the data is the same**, and the best design of its own where Olympia lacks that data. No columns or values are invented to force sameness: for example, the archive does not keep balances after each transaction, so the Olympia table has no balance column.
- Babylon concepts that did not exist on Olympia are translated honestly. Olympia had no roles: a token's Configuration tab shows that minting and burning belonged to its owner (if the supply was mutable) or to nobody (if it was fixed); a validator's shows that every change to it was signed by its node key.
- Every page has a share image with figures from the archive (balances, stake and uptime, supply and holders, or fee and date) and a title with its name.

<a id="step-6"></a>

## 7. Step 6: Olympia inside the Babylon explorer

Olympia's history also shows where Babylon is browsed, because many accounts, tokens and validators are the same:

- **Babylon accounts that come from Olympia** (same key): an **Olympia** tab with the full summary, and All, Babylon and Olympia pills in the Transactions and Funds flow tabs. In "All", once Babylon's history ends, "Load more" goes on with Olympia's in the same table.
- **Babylon tokens migrated from Olympia:** an **Olympia** tab with the original token and its holders when Olympia ended.
- **Babylon validators:** many operators kept using their Olympia node key. Comparing public keys, **193 of the 290** Babylon validators are matched to their Olympia validator, whose address appears in the summary and whose icon the Olympia card reuses.
- **The explorer's calendar:** picking days before Babylon lists the Olympia transactions of those dates. The calendar only allows dates between Olympia's first day (26 Jul 2021) and today.

<a id="step-7"></a>

## 8. Step 7: derived indexes built once

Two figures could not be looked up per validator, because the archive keeps them ordered by transaction. Since Olympia never changes, they were computed once with a script and saved as small files next to the explorer's code:

| Figure | Source | Result |
|---|---|---|
| **Each validator's uptime** | `validator_proposal_records`: proposals completed and missed per validator and epoch (3.3 million rows) | 161 validators with proposals (the rest never entered the active set). A 16 KB file |
| **Staking activity** (XRD staked and unstaked, per validator and day) | `operations_by_version` (7.7 million operations), dated with `user_tx_by_version` | 228,281 movements of 235 validators, all dated. A 1.1 MB file |

<a id="step-8"></a>

## 9. Step 8: access for agents (MCP) and in the console

**MCP.** The site's MCP server has 13 read-only tools over the archive:

| Tool | Returns |
|---|---|
| `olympia_lookup` | Recognises any Olympia identifier, or a Babylon address, and answers with the essentials |
| `olympia_get_account` | An account's summary when Olympia ended |
| `olympia_get_account_transactions` | An account's paginated history |
| `olympia_get_account_funds_flow` | Who an account exchanged XRD with |
| `olympia_get_account_rewards` | Daily staking rewards for a year |
| `olympia_get_transaction` | A full transaction |
| `olympia_list_transactions_by_date` | Every transaction in a range of days |
| `olympia_list_validators` | The 254 validators by stake, with their share of the network and their uptime |
| `olympia_get_validator` | A full validator, with its monthly staking activity |
| `olympia_get_validator_delegators` | All of a validator's delegators, paginated |
| `olympia_get_validator_rewards` | A validator's daily rewards in a year |
| `olympia_get_token` | A token and its largest holders |
| `olympia_from_babylon` | What a Babylon address was on Olympia: account, token or validator |

`olympia_from_babylon` works for **any** migrated account, whether or not it has signed a Babylon transaction, because it uses the archive's index instead of signatures.

**Console.** The site's console already converts addresses from Olympia to Babylon and back, and prepares the QR code to import an Olympia account into the Radix Wallet.

<a id="step-9"></a>

## 10. Step 9: performance, security and cost

- **Zero infrastructure cost.** Hugging Face and archive.org serve the archive; the site has no Olympia database and spends no Redis commands on Olympia.
- **Caching.** Immutable responses on the CDN; on the server, each file's footer and the token and validator catalogs are read once per instance.
- **Rate limit.** The `/api/olympia/*` routes accept 300 requests per minute per IP. The limiter counts in memory first, so a flood of requests does not spend Redis.
- **Input validation.** Every route checks the format of what it receives (addresses, ids, years and dates) before reading anything.
- **Testing.** 62 automated tests cover the Olympia explorer and tools, and every MCP tool was tried against the running server.

<a id="step-10"></a>

## 11. Step 10: verification against the Babylon genesis

**Why it was needed.** The official Olympia Gateway is no longer online, so the archive could not be checked against it. But there is another official, independent source: the **Babylon genesis** loaded Olympia's final state into the ledger. If the archive is right, each account's final balance in the archive must be what the genesis credited to its Babylon account.

**How it was done.**

1. Every balance change of the genesis transactions (versions 1 to 694) was read from the Babylon Gateway, with `/stream/transactions` and the `balance_changes` opt-in: 629,561 changes in 175,562 accounts.
2. The final balances were taken from the archive (`account_final_balances`), translating each account to its Babylon address and each token to its Babylon resource with the archive's own indexes: 583,884 balances of 901 tokens.
3. They were compared account by account and token by token, to 18 decimals.
4. The differences were analysed one by one.

**Balance results.**

| Result | Balances | Explanation |
|---|---|---|
| Match exactly, to the 18th decimal | **583,430 of 583,884 (99.92 %)** | |
| XRD differences explained by XRD being unstaked or pending stake | 438 | The genesis returned that XRD as a liquid balance; the archive keeps it apart, in the account's stakes. Added up, it matches exactly |
| Differences in two tokens with an absurd supply (`e` and `test6`) | 14 | Their supply exceeded Babylon's maximum and the migration rescaled them by a fixed factor per token (0.005709 for `e`) |
| XRD differences that cancel out | 4 | Two accounts hold 100 and 600 XRD more in the archive than in the genesis, and the genesis credited exactly 100 and 600 XRD to two accounts that are not in the archive. The total matches |

**Stake results.** The genesis turned stakes into stake units (LSU) of each Babylon validator. Matching validators by node key (193 validators), **20,958 of 20,964** stake positions match with a relative difference below 10⁻⁹. 123 positions only in the archive and 29 only in the genesis remain to be analysed. Validators that changed their key on Babylon cannot be compared this way.

**Conclusion.** The archive reproduces the final Olympia state that the network itself loaded into Babylon. Every difference analysed has an explanation that is not an error in the archive.

<a id="your-explorer"></a>

## 12. How to use the archive to build your own explorer

The archive is **public**: no account, key or permission is needed to read it. Anyone can build their own explorer, an analysis or a tool on top of it.

**Where it is.**

| Place | Content | Link |
|---|---|---|
| Hugging Face | The tables and the lookup indexes (`index/`), with their `SHA256SUMS.txt` | [Genkipool/radix-olympia-gateway-export](https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export) |
| archive.org | The tables | [radix-olympia-gateway-export](https://archive.org/details/radix-olympia-gateway-export) |
| archive.org | The original Olympia node database everything comes from | [radix-olympia-ledger-archive](https://archive.org/details/radix-olympia-ledger-archive) |

Each file downloads from `https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main/<path>`. For example, `index/accounts_by_address.parquet`.

**Which file to use for each lookup.** Always use the `index/` files (table in [step 2](#step-2)): they are sorted by the lookup key and split into small row groups, so tools that read Parquet over HTTP download only the groups that can hold what you are looking for, not the whole file. The unindexed tables are for full analyses.

**Watch the types.**

- Amounts are in units of 10⁻¹⁸ and stored as text: divide by 10¹⁸ to get XRD or tokens.
- The transaction id is **hex text** in `tx_by_id`, but **binary** in `account_tx_detail`.
- Accounts are looked up by their address (`rdx1…`) in `accounts_by_address`, which gives the `account_id` the other indexes use.

**Option 1: SQL with DuckDB** (from the command line or from Python; Python also needs the `pytz` package for timestamps):

```sql
INSTALL httpfs; LOAD httpfs;

-- An account: its internal id, its public key and the Babylon account it became
SELECT account_id, public_key, babylon_address
FROM read_parquet('https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main/index/accounts_by_address.parquet')
WHERE address = 'rdx1…';

-- Its latest transactions (with the account_id from the previous query)
SELECT state_version, round_timestamp, lower(hex(transaction_id)) AS transaction_id
FROM read_parquet('https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main/index/account_tx_detail.parquet')
WHERE account_id = 123456
ORDER BY state_version DESC LIMIT 20;

-- The largest XRD holders when Olympia ended
SELECT address, CAST(balance AS HUGEINT) / 1e18 AS xrd
FROM read_parquet('https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main/index/final_balances_by_resource.parquet')
WHERE rri = 'xrd_rr1qy5wfsfh'
ORDER BY CAST(balance AS HUGEINT) DESC LIMIT 20;
```

**Option 2: Python with Polars.**

```python
import polars as pl

BASE = 'https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main'
validators = (pl.scan_parquet(f'{BASE}/index/validators_by_address.parquet')
                .select(['address', 'name', 'total_xrd_staked'])
                .collect())
tx = (pl.scan_parquet(f'{BASE}/index/tx_by_id.parquet')
        .filter(pl.col('transaction_id') == '832bc7338760d7d7ebe9f3980289c6a535edef2fe7f9c415b011c0adbdd609a1')
        .collect())
```

**Option 3: JavaScript in the browser or in Node.js with [hyparquet](https://github.com/hyparam/hyparquet)**, the same library the site's explorer uses. It works with no server, even on a static page:

```js
import { asyncBufferFromUrl, parquetQuery } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const BASE = 'https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main';
const file = await asyncBufferFromUrl({ url: `${BASE}/index/accounts_by_address.parquet` });
const [account] = await parquetQuery({
  file,
  compressors,
  columns: ['address', 'account_id', 'babylon_address'],
  filter: { address: 'rdx1…' },
});
```

All three examples were run against the published archive, and each query takes 1 to 3 seconds.

**Option 4: start from the site's explorer.** Its code is open source, in [genkipool/Radix_Community](https://github.com/genkipool/Radix_Community):

- `services/olympia/parquet.ts` reads the files by ranges, prunes row groups with the footer statistics and caches what it downloaded.
- `services/olympia/` has one query per need of the explorer (accounts, transactions, validators, tokens, rewards and funds flow).
- `scripts/olympia/` builds the derived indexes of [step 7](#step-7), and `services/olympia/data/` holds the computed result.

**Option 5: no code at all, through the site's MCP.** Any MCP-compatible agent can use the 13 tools of [step 8](#step-8) at `https://radix-community.genkipool.com/api/mcp`, with a per-IP rate limit.

<a id="reproduce"></a>

## 13. How to reproduce it

- **Explorer and MCP tools:** open source in the [genkipool/Radix_Community](https://github.com/genkipool/Radix_Community) repository. Archive reading in `services/olympia/`, routes in `app/api/olympia/`, interface in `features/dashboard/explorador/olympia/`, MCP tools in `services/mcp/tools/olympia.ts`, and derived indexes in `scripts/olympia/` and `services/olympia/data/`.
- **Verification against the genesis:** the scripts are in [`tools/olympia-archive-check/`](../../tools/olympia-archive-check/README.md) in this repository. They only use public data: the Babylon Gateway and the archive on Hugging Face.

---

[← Index](../../README.md) · [Chapter 8: roadmap](08-roadmap.md) · [Section 10.5: verifiable Olympia archive](10-implementation-guide.md#s10-5)
