# Olympia archive check / Verificación del archivo de Olympia

English · [Español](#español)

Checks that the [Radix Olympia archive](https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export) reproduces Olympia's final state, by comparing each account's final balance in the archive with what the **Babylon genesis** credited to its Babylon account. It only uses public data: the Babylon Gateway and the archive's Parquet files. Results and their analysis: [progress report F0.1](../../docs/en/progress-f0-1-olympia-archive-and-explorer.md#step-10).

```bash
npm install          # or pnpm install
npm run genesis      # ~1 min: genesis-changes.jsonl (629,561 changes)
npm run archive      # ~1 min: archive-balances.jsonl (583,884 balances)
npm run compare      # summary + differences.jsonl
```

Expected summary (8 Nov 2026): 583,430 of 583,884 balances equal to the 18th decimal. The remaining differences are explained in the report: XRD being unstaked or pending stake (kept apart in the archive, returned as liquid XRD by the genesis), two tokens rescaled because their supply exceeded Babylon's maximum, and 700 XRD the genesis credited to two other accounts.

Environment variables: `BABYLON_GATEWAY` (default `https://mainnet.radixdlt.com`) and `OLYMPIA_DATA_BASE_URL` (default: the Hugging Face dataset).

---

## Español

Comprueba que el [archivo de Radix Olympia](https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export) reproduce el estado final de Olympia, comparando el saldo final de cada cuenta en el archivo con lo que la **génesis de Babylon** ingresó en su cuenta de Babylon. Solo usa datos públicos: el Gateway de Babylon y los ficheros Parquet del archivo. Resultados y su análisis: [informe de progreso F0.1](../../docs/es/progreso-f0-1-archivo-y-explorador-olympia.md#paso-10).

```bash
npm install          # o pnpm install
npm run genesis      # ~1 min: genesis-changes.jsonl (629.561 cambios)
npm run archive      # ~1 min: archive-balances.jsonl (583.884 saldos)
npm run compare      # resumen + differences.jsonl
```

Resumen esperado (8-nov-2026): 583.430 de 583.884 saldos iguales al decimal 18. Las diferencias restantes se explican en el informe: XRD en unstake o pendiente de stake (que el archivo guarda aparte y la génesis devolvió como XRD libre), dos tokens reescalados porque su suministro superaba el máximo de Babylon, y 700 XRD que la génesis ingresó en otras dos cuentas.

Variables de entorno: `BABYLON_GATEWAY` (por defecto `https://mainnet.radixdlt.com`) y `OLYMPIA_DATA_BASE_URL` (por defecto, el dataset de Hugging Face).
