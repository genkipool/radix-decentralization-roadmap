[← Índice](../../README.es.md) · [Capítulo 8: hoja de ruta](08-hoja-de-ruta.md) · [Sección 10.5: archivo verificable de Olympia](10-guia-de-implementacion.md#s10-5)

<a id="f0-1"></a>

# Progreso · F0.1 Archivo de Olympia y explorador

> [!IMPORTANT]
> - **Estado:** completada el 8-nov-2026.
> - **Desarrollador:** GENKIPOOL.
> - **Dificultad:** Baja, como estimaba la sección [10.5](10-guia-de-implementacion.md#s10-5).
> - **Coste:** 0 EUR. Sin financiación.

Este documento cuenta, paso a paso, cómo se ha completado la tarea 1 de la fase F0 de la [hoja de ruta](08-hoja-de-ruta.md#s8-1): rescatar el historial de Olympia, publicarlo y ponerlo en funcionamiento en un explorador, de modo que deje de depender del Gateway de Olympia, un único servicio que puede apagarse en cualquier momento.

## Índice

1. [Por qué era urgente](#por-que)
2. [Paso 1: obtener los datos](#paso-1)
3. [Paso 2: exportar a Parquet y crear los índices](#paso-2)
4. [Paso 3: publicar el archivo](#paso-3)
5. [Paso 4: leer el archivo desde la web sin servidor propio de datos](#paso-4)
6. [Paso 5: el explorador de Olympia](#paso-5)
7. [Paso 6: Olympia dentro del explorador de Babylon](#paso-6)
8. [Paso 7: índices derivados construidos una sola vez](#paso-7)
9. [Paso 8: conversión de direcciones en la consola](#paso-8)
10. [Paso 9: rendimiento, seguridad y coste](#paso-9)
11. [Paso 10: verificación del archivo](#paso-10)
12. [Cómo usar el archivo para crear tu propio explorador](#tu-explorador)
13. [Cómo reproducirlo](#reproducir)

<a id="por-que"></a>

## 1. Por qué era urgente

- Olympia fue la red principal de Radix desde julio de 2021 hasta el **28-sep-2023 a las 06:33:34 UTC**, cuando se migró a Babylon.
- El **estado** de Olympia (saldos, stakes, tokens y validadores) se cargó en la génesis de Babylon, así que los nodos lo tienen. El **historial** de transacciones no: solo existía en el Gateway de Olympia (`olympia-gateway.radixdlt.com`), un único servicio (sección [2.2](01-02-situacion-actual.md#s2-2)).
- Ese Gateway sigue en línea hoy, pero es un único servicio que depende de la Foundation. Si se apagara sin una copia, más de dos años de historial de la red se perderían.

<a id="paso-1"></a>

## 2. Paso 1: obtener los datos

1. **Base de datos de un nodo de Olympia.** Se partió del fichero `RADIXDB-api.tar.zst`, publicado en el elemento de archive.org [radix-olympia-ledger-archive](https://archive.org/details/radix-olympia-ledger-archive), con SHA-256 `d3a00f5a263bbb20274276ed23d77ec93744c3a08fd6c5ef04e4f949eb0bb60c`.
2. **Servir esa base de datos.** Se arrancó el software oficial del nodo, `radixdlt/radixdlt-core:1.5.0`, con la Core API activada (`api.transactions.enable=true`), en una red aislada y sin pares, para que solo sirviera lo que ya tenía.
3. **Reconstruir el Gateway.** El software oficial del Gateway de Olympia, `radixdlt/ng-data-aggregator:1.1.14` y `radixdlt/ng-gateway-api:1.1.14`, con PostgreSQL 12, ingirió el ledger completo desde ese nodo (noviembre de 2026).
4. **Comprobar que llegó al final.** La Gateway API informó `ledger_state.version = 337759839`, igual a su `target_ledger_state`: la última versión de Olympia.

<a id="paso-2"></a>

## 3. Paso 2: exportar a Parquet y crear los índices

**Tablas.** Cada tabla de PostgreSQL se exportó a Parquet con DuckDB, con compresión zstd y ordenada por su clave primaria. Las dos tablas más grandes (`ledger_transactions` y `raw_transactions`) se trocearon por rangos de 20.000.000 versiones de estado.

**Comprobaciones del export.**

- `SHA256SUMS.txt`: el SHA-256 de cada fichero.
- `ROWCOUNTS.txt`: el número de filas de cada fichero, comparado con el de la tabla de PostgreSQL de la que salió.

**Índices de consulta (`index/`).** Las tablas están ordenadas como en la base de datos, lo que no sirve para buscar por dirección. Se crearon ficheros auxiliares, cada uno ordenado por la clave por la que se consulta y dividido en grupos de filas pequeños, con el mínimo y el máximo de esa clave en el pie del fichero:

| Índice | Ordenado por | Para qué sirve |
|---|---|---|
| `accounts_by_address` | dirección `rdx1…` | Cuenta de Olympia → id interno, clave pública y cuenta de Babylon |
| `accounts_by_babylon_address` | dirección `account_rdx1…` | El camino inverso: de una cuenta de Babylon a su pasado en Olympia (el "fichero que relaciona cada dirección de Olympia con su cuenta de Babylon" que pedía la sección [10.5](10-guia-de-implementacion.md#s10-5)) |
| `account_tx_detail` | cuenta y versión | Historial de cada cuenta, del más nuevo al más antiguo |
| `operations_by_account`, `account_balance_changes` | cuenta y versión | Acciones y cambios de saldo de cada cuenta |
| `account_final_balances`, `account_final_stakes` | cuenta | Lo que tenía cada cuenta al terminar Olympia |
| `account_stake_history`, `validator_stake_history` | cuenta o validador, y versión | El stake de cada cuenta y los totales de cada validador a lo largo del tiempo, con el rango de versiones en que estuvo vigente cada fila: el stake de una cuenta en cualquier momento de Olympia (añadidos el 8-nov-2026) |
| `account_staking_rewards_daily` | cuenta y día | Recompensas de staking por día y validador |
| `tx_by_id`, `user_tx_by_version`, `operations_by_version`, `balance_changes_by_version`, `raw_user_tx_by_version` | id o versión | Una transacción completa |
| `resources_by_rri`, `resources_by_babylon_address`, `final_balances_by_resource` | token | Datos de cada token y sus poseedores |
| `validators_by_address`, `final_stakes_by_validator`, `validator_staking_rewards_daily` | validador | Datos de cada validador, sus delegadores y sus recompensas diarias |

Los índices tienen su propio `index/SHA256SUMS.txt`.

**Tamaño del archivo.** 175.567 cuentas, 2.711.747 transacciones de usuario, 7.733.223 operaciones, 920 tokens, 254 validadores y 3.271.724 registros de propuestas de validadores.

<a id="paso-3"></a>

## 4. Paso 3: publicar el archivo

El archivo está publicado en dos sitios independientes:

- **Hugging Face:** [Genkipool/radix-olympia-gateway-export](https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export), con las tablas y los índices.
- **archive.org:** [radix-olympia-gateway-export](https://archive.org/details/radix-olympia-gateway-export), con las tablas.

Los dos permiten descargar por rangos de bytes (HTTP range requests), que es lo que hace posible el paso siguiente.

<a id="paso-4"></a>

## 5. Paso 4: leer el archivo desde la web sin servidor propio de datos

El explorador no tiene una base de datos de Olympia. Lee los ficheros Parquet publicados directamente, con [hyparquet](https://github.com/hyparam/hyparquet):

1. Lee una vez el **pie** de cada fichero (unos pocos KB) y lo guarda en memoria.
2. Con el mínimo y el máximo de cada grupo de filas, decide qué grupos pueden contener la clave buscada.
3. Pide **solo los bytes de esos grupos** con peticiones de rango. Una consulta típica descarga unos cientos de KB; nunca se descarga un fichero entero.
4. Recuerda los rangos ya descargados para no pedirlos dos veces.

Así, consultar el historial de una cuenta, una transacción o un token cuesta lo mismo que leer una página web, sin servidores de datos que mantener. Como Olympia no cambia, todas las respuestas se marcan como cacheables para siempre en la CDN.

<a id="paso-5"></a>

## 6. Paso 5: el explorador de Olympia

Cualquier identificador de Olympia escrito en el buscador del explorador abre su tarjeta: una cuenta (`rdx1…`), un validador (`rv1…`), un token (`<símbolo>_rr1…`) o una transacción (64 caracteres hexadecimales). Cada tarjeta tiene su página propia en `/dashboard/olympia/<identificador>`.

| Tarjeta | Pestañas |
|---|---|
| **Cuenta** | Resumen (saldos al terminar Olympia, actividad, clave pública y cuenta de Babylon), Staking, Tokens, Transacciones, Flujo de fondos, Recompensas (tabla por año con CSV en formato CoinTracking), Seguridad y Raw. Debajo de la tarjeta, sus transacciones en tarjetas, de 15 en 15 |
| **Validador** | Resumen (perfil, stake y su porcentaje de la red, stake del propietario, factor de unidad de stake a XRD, uptime durante todo Olympia, evolución del stake y actividad de staking por días y por meses), Delegadores (todos, paginados), Recompensas, Metadatos, Configuración y Raw |
| **Token** | Resumen, Metadatos, Configuración (quién podía acuñar y quemar), Holders (los mayores poseedores) y Raw |
| **Transacción** | Resumen (transferencias de origen a destino, comisión quemada, entidades afectadas y creadas, desplegables), Detalles (estado, mensaje, acciones y todos los cambios de saldo) y Recibo sin procesar (los datos del archivo y la transacción firmada en hexadecimal) |

Decisiones de diseño:

- **Mismo diseño que Babylon donde hay los mismos datos**, y el mejor diseño propio donde Olympia no tiene ese dato. No se inventan columnas ni valores para forzar la igualdad: por ejemplo, el archivo no guarda saldos tras cada transacción, así que la tabla de Olympia no tiene columna de saldo.
- Los conceptos de Babylon que no existían en Olympia se traducen con honestidad. Olympia no tenía roles: la pestaña Configuración de un token muestra que acuñar y quemar era cosa del propietario (si el suministro era variable) o de nadie (si era fijo); la de un validador muestra que todos sus cambios los firmaba la clave del nodo.
- Cada página tiene su imagen al compartir con datos del archivo (saldos, stake y uptime, suministro y holders, o comisión y fecha) y su título con nombre.

<a id="paso-6"></a>

## 7. Paso 6: Olympia dentro del explorador de Babylon

El historial de Olympia también aparece donde se mira Babylon, porque muchas cuentas, tokens y validadores son los mismos:

- **Cuentas de Babylon que vienen de Olympia** (misma clave): pestaña **Olympia** con el resumen completo, y en las pestañas Transacciones y Flujo de fondos las píldoras Todo, Babylon y Olympia. En "Todo", al acabar el historial de Babylon, "Cargar más" sigue con el de Olympia en la misma tabla.
- **Tokens de Babylon migrados desde Olympia:** pestaña **Olympia** con el token original y sus poseedores al terminar Olympia.
- **Validadores de Babylon:** muchos operadores siguieron usando la clave de su nodo de Olympia. Comparando claves públicas, **193 de los 290** validadores de Babylon se emparejan con su validador de Olympia, cuya dirección aparece en el resumen y cuyo icono reutiliza la tarjeta de Olympia.
- **Calendario del explorador:** al elegir días anteriores a Babylon aparecen las transacciones de Olympia de esas fechas. El calendario solo permite fechas entre el primer día de Olympia (26-jul-2021) y hoy.

<a id="paso-7"></a>

## 8. Paso 7: índices derivados construidos una sola vez

Dos datos no se podían consultar por validador porque el archivo los guarda ordenados por transacción. Como Olympia no cambia, se calcularon una sola vez con un script y se guardaron como ficheros pequeños junto al código del explorador:

| Dato | De dónde sale | Resultado |
|---|---|---|
| **Uptime de cada validador** | `validator_proposal_records`: propuestas completadas y fallidas por validador y época (3,3 millones de filas) | 161 validadores con propuestas (los demás nunca entraron en el conjunto activo). Fichero de 16 KB |
| **Actividad de staking** (XRD puesto en stake y retirado, por validador y día) | `operations_by_version` (7,7 millones de operaciones), fechadas con `user_tx_by_version` | 228.281 movimientos de 235 validadores, todos fechados. Fichero de 1,1 MB |

<a id="paso-8"></a>

## 9. Paso 8: conversión de direcciones en la consola

**Consola.** La consola de la web ya permite convertir direcciones de Olympia a Babylon y al revés, y preparar el código QR para importar una cuenta de Olympia en la Radix Wallet.

<a id="paso-9"></a>

## 10. Paso 9: rendimiento, seguridad y coste

- **Coste de infraestructura nulo.** El archivo lo sirven Hugging Face y archive.org; la web no tiene base de datos de Olympia.
- **Caché.** Respuestas inmutables en la CDN; en el servidor, el pie de cada fichero y los catálogos (tokens y validadores) se leen una vez por instancia.
- **Límite de peticiones.** Las rutas `/api/olympia/*` admiten 300 peticiones por minuto e IP. El límite cuenta primero en memoria, así que una avalancha de peticiones no gasta Redis.
- **Validación de entradas.** Cada ruta valida el formato de lo que recibe (direcciones, ids, años y fechas) antes de leer nada.

<a id="paso-10"></a>

## 11. Paso 10: verificación del archivo

El archivo se ha contrastado con dos fuentes oficiales e independientes de quien lo hizo: el **Gateway oficial de Olympia**, que sigue en línea, y la **génesis de Babylon**, que cargó en el ledger el estado final de Olympia.

### Contra el Gateway oficial de Olympia (muestra)

`olympia-gateway.radixdlt.com` sigue respondiendo (Gateway API 1.1.14, congelado en la versión 337.759.839). Sobre una muestra al azar:

| Comprobación | Resultado |
|---|---|
| 50 cuentas al azar: número de transacciones (`/account/transactions`) | **50 de 50 iguales** |
| Las mismas 50 cuentas: XRD libre al terminar Olympia (`/account/balances`) | **50 de 50 iguales** |
| Las mismas 50 cuentas: qué tokens tenían | **50 de 50 iguales** |
| Lista de validadores (`/validators`) | **254**, los mismos que el archivo |
| 20 validadores al azar: XRD en stake | **20 de 20 iguales** |
| 45 casos de cuenta en un momento pasado (35 en una versión al azar, 10 al terminar un día), con `at_state_identifier`: saldos, stake, stake pendiente y unstake por validador | **45 de 45 iguales**: saldos hasta la última unidad, stakes hasta 10⁻¹⁸ y cada día en la misma versión. Incluye las 3 cuentas con más historial y las 2 con más movimientos de stake |

### Contra la génesis de Babylon (completa)

**Cómo se hizo.**

1. Del Gateway de Babylon se leyeron todos los cambios de saldo de las transacciones de génesis (versiones 1 a 647; la primera transacción de usuario es la 670), con `/stream/transactions` y la opción `balance_changes`: 629.555 cambios en 175.560 cuentas.
2. Del archivo se tomaron los saldos finales (`account_final_balances`), traduciendo cada cuenta a su dirección de Babylon y cada token a su recurso de Babylon con los propios índices del archivo: 583.884 saldos de 901 tokens.
3. Se compararon cuenta por cuenta y token por token, con 18 decimales.
4. Las diferencias se analizaron una por una.

**Resultados de los saldos.**

| Resultado | Saldos | Explicación |
|---|---|---|
| Coinciden exactamente, al decimal 18 | **583.432 de 583.884 (99,92 %)** | |
| Diferencias de XRD explicadas por el XRD en unstake o pendiente de stake | 438 (todas) | La génesis devolvió ese XRD como saldo libre; el archivo lo guarda aparte, en los stakes de la cuenta. En las 438, la diferencia es exactamente ese importe |
| Diferencias en dos tokens con suministro desmesurado (`e` y `test6`) | 14 | Su suministro superaba el máximo que admite Babylon y la migración los reescaló por un factor fijo por token (0,005709 para `e`; unos 5,7 × 10⁻¹⁶ para `test6`). Un saldo de 0,0004 `test6` quedó por debajo del decimal 18 y no pasó a Babylon |

**Resultados de los stakes.** La génesis convirtió los stakes en unidades de stake (LSU) de cada validador de Babylon. Emparejando validadores por la clave del nodo (193 validadores), **20.958 de 20.964** posiciones de stake coinciden con una diferencia relativa menor que 10⁻⁹. Quedan 123 posiciones que solo están en el archivo y 29 que solo están en la génesis, pendientes de analizar. Los validadores que cambiaron de clave en Babylon no se pueden comparar por este método.

**Conclusión.** El archivo coincide con lo que responde el Gateway oficial de Olympia y reproduce el estado final que la propia red cargó en Babylon. Todas las diferencias de saldos tienen una explicación que no es un error del archivo.

<a id="tu-explorador"></a>

## 12. Cómo usar el archivo para crear tu propio explorador

El archivo es **público** y tiene licencia [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (dominio público) en Hugging Face y en archive.org: no hace falta cuenta, clave ni permiso para leerlo, y cualquiera puede usarlo para lo que quiera, también con fines comerciales, sin pedir permiso ni citar la fuente. Se entrega tal cual, sin garantías. Encima se puede construir un explorador propio, un análisis o una herramienta.

**Dónde está.**

| Sitio | Contenido | Enlace |
|---|---|---|
| Hugging Face | Las tablas y los índices de consulta (`index/`), con su `SHA256SUMS.txt` | [Genkipool/radix-olympia-gateway-export](https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export) |
| archive.org | Las tablas | [radix-olympia-gateway-export](https://archive.org/details/radix-olympia-gateway-export) |
| archive.org | La base de datos original del nodo de Olympia, de la que sale todo | [radix-olympia-ledger-archive](https://archive.org/details/radix-olympia-ledger-archive) |

Cada fichero se descarga en `https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main/<ruta>`. Por ejemplo, `index/accounts_by_address.parquet`.

**Qué fichero usar para cada consulta.** Usa siempre los índices de `index/` (tabla del [paso 2](#paso-2)): están ordenados por la clave de búsqueda y en grupos de filas pequeños, así que las herramientas que leen Parquet por HTTP descargan solo los grupos que pueden contener lo que buscas, y no el fichero entero. Las tablas sin índice sirven para análisis completos.

**Cuidado con los tipos.**

- Los importes están en unidades de 10⁻¹⁸ y guardados como texto: divide entre 10¹⁸ para tener XRD o tokens.
- El id de transacción es **texto hexadecimal** en `tx_by_id`, pero **binario** en `account_tx_detail`.
- Las cuentas se buscan por su dirección (`rdx1…`) en `accounts_by_address`, que da el `account_id` que usan los demás índices.
- **Una cuenta en una fecha** (lo que el Gateway oficial da con `at_state_identifier`): el saldo de cada token en la versión V es el `balance_after` de su último cambio con `state_version <= V` en `account_balance_changes`. El stake son las filas de `account_stake_history` cuyo rango `[from_state_version, to_state_version]` contiene V, valoradas con la fila de `validator_stake_history` de su validador que también contiene V: XRD = unidades × `total_xrd_staked` / (`total_stake_units` + `total_prepared_unstake_units`). Para un día, usa la última versión de ese día (columnas `state_version` y `round_timestamp` de `ledger_transactions`).

**Opción 1: SQL con DuckDB** (desde la línea de comandos o desde Python; en Python hace falta además el paquete `pytz` para las fechas):

```sql
INSTALL httpfs; LOAD httpfs;

-- Una cuenta: su id interno, su clave pública y la cuenta de Babylon a la que pasó
SELECT account_id, public_key, babylon_address
FROM read_parquet('https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main/index/accounts_by_address.parquet')
WHERE address = 'rdx1…';

-- Sus últimas transacciones (con el account_id de la consulta anterior)
SELECT state_version, round_timestamp, lower(hex(transaction_id)) AS transaction_id
FROM read_parquet('https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main/index/account_tx_detail.parquet')
WHERE account_id = 123456
ORDER BY state_version DESC LIMIT 20;

-- Los mayores poseedores de XRD al terminar Olympia
SELECT address, CAST(balance AS HUGEINT) / 1e18 AS xrd
FROM read_parquet('https://huggingface.co/datasets/Genkipool/radix-olympia-gateway-export/resolve/main/index/final_balances_by_resource.parquet')
WHERE rri = 'xrd_rr1qy5wfsfh'
ORDER BY CAST(balance AS HUGEINT) DESC LIMIT 20;
```

**Opción 2: Python con Polars.**

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

**Opción 3: JavaScript en el navegador o en Node.js con [hyparquet](https://github.com/hyparam/hyparquet)**, la misma librería que usa el explorador de la web. Funciona sin servidor, incluso en una página estática:

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

Los tres ejemplos se han ejecutado contra el archivo publicado, y cada consulta tarda entre 1 y 3 segundos.

**Opción 4: partir del explorador de la web.** Su código es abierto, en [genkipool/Radix_Community](https://github.com/genkipool/Radix_Community):

- `services/olympia/parquet.ts` lee los ficheros por rangos, poda los grupos de filas con las estadísticas del pie y guarda en caché lo descargado.
- `services/olympia/` tiene una consulta por cada necesidad del explorador (cuentas, transacciones, validadores, tokens, recompensas y flujo de fondos).
- `scripts/olympia/` construye los índices derivados del [paso 7](#paso-7), y `services/olympia/data/` contiene el resultado ya calculado.

<a id="reproducir"></a>

## 13. Cómo reproducirlo

- **Explorador:** código abierto en el repositorio [genkipool/Radix_Community](https://github.com/genkipool/Radix_Community). Lectura del archivo en `services/olympia/`, rutas en `app/api/olympia/`, interfaz en `features/dashboard/explorador/olympia/` e índices derivados en `scripts/olympia/` y `services/olympia/data/`.
- **Verificación contra la génesis:** los scripts están en [`tools/olympia-archive-check/`](../../tools/olympia-archive-check/README.md) de este repositorio. Solo usan datos públicos: el Gateway de Babylon y el archivo en Hugging Face.

---

[← Índice](../../README.es.md) · [Capítulo 8: hoja de ruta](08-hoja-de-ruta.md) · [Sección 10.5: archivo verificable de Olympia](10-guia-de-implementacion.md#s10-5)
