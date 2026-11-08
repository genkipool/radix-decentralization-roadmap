# Olympia archive check / Verificación del archivo de Olympia

English · [Español](#español)

Checks the [Radix Olympia archive](https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export) against two official sources: the **Babylon genesis** (every account's final balance compared with what the genesis credited to its Babylon account) and the **official Olympia Gateway** (a random sample of accounts and validators, while it is still online). It only uses public data. Results and their analysis: [progress report F0.1](../../docs/en/progress-f0-1-olympia-archive-and-explorer.md#step-10).

```bash
npm install          # or pnpm install
npm run genesis      # ~15 s: genesis-changes.jsonl (629,555 changes, versions 1 to 647)
npm run archive      # ~40 s: archive-balances.jsonl (583,884 balances)
npm run compare      # summary + differences.jsonl
npm run official     # ~1 min: sample checked against the official Olympia Gateway
```

Expected results (8 Nov 2026): 583,432 of 583,884 balances equal to the 18th decimal; the 452 differences are XRD being unstaked or pending stake (kept apart in the archive, returned as liquid XRD by the genesis) and two tokens rescaled because their supply exceeded Babylon's maximum. Against the official Olympia Gateway: 50 of 50 accounts and 20 of 20 validators equal.

Environment variables: `BABYLON_GATEWAY` (default `https://mainnet.radixdlt.com`), `OLYMPIA_DATA_BASE_URL` (default: the Hugging Face dataset) and `ARCHIVE_API` (default: the Radix Community API, used by `official`).

---

## Español

Contrasta el [archivo de Radix Olympia](https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export) con dos fuentes oficiales: la **génesis de Babylon** (el saldo final de cada cuenta comparado con lo que la génesis ingresó en su cuenta de Babylon) y el **Gateway oficial de Olympia** (una muestra al azar de cuentas y validadores, mientras siga en línea). Solo usa datos públicos. Resultados y su análisis: [informe de progreso F0.1](../../docs/es/progreso-f0-1-archivo-y-explorador-olympia.md#paso-10).

```bash
npm install          # o pnpm install
npm run genesis      # ~15 s: genesis-changes.jsonl (629.555 cambios, versiones 1 a 647)
npm run archive      # ~40 s: archive-balances.jsonl (583.884 saldos)
npm run compare      # resumen + differences.jsonl
npm run official     # ~1 min: muestra contrastada con el Gateway oficial de Olympia
```

Resultados esperados (8-nov-2026): 583.432 de 583.884 saldos iguales al decimal 18; las 452 diferencias son XRD en unstake o pendiente de stake (que el archivo guarda aparte y la génesis devolvió como XRD libre) y dos tokens reescalados porque su suministro superaba el máximo de Babylon. Contra el Gateway oficial de Olympia: 50 de 50 cuentas y 20 de 20 validadores iguales.

Variables de entorno: `BABYLON_GATEWAY` (por defecto `https://mainnet.radixdlt.com`), `OLYMPIA_DATA_BASE_URL` (por defecto, el dataset de Hugging Face) y `ARCHIVE_API` (por defecto, la API de Radix Community, que usa `official`).
