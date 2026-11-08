# October 30, 2022 authoritative catalog

`catalog.json` is the versioned source. `wave/server/catalog/generated.hpp` is its
checked, deterministic C++ projection. Neither the later `schema/catalogs` tables
nor modern wiki statistics are imported. The complete original petal identity
registry has **46 rows, IDs 0–45**, including None, and six rarities, IDs 0–5.
The implementation tranche has 72 petal definitions and 72 mob definitions.
Registered but unsupported petals have an ID mapping and no simulation rule;
`Match` rejects equipping them instead of substituting another petal. None is an
empty slot. Only main slots are simulated; inventory/reserve slots belong to app/store.

```
python3 wave/tools/catalog/generate.py
python3 wave/tools/catalog/generate.py --check --self-test
```

The generator's default input is the portable `evidence-inputs.json`, whose
SHA-256 is pinned in the script. It contains the W0 registry, selected constructor
columns/descriptions, reference identity, rule selections, short dated wiki and
primary excerpts, the exact 20 craft-display bytes and slot-unlock WAT evidence.
It keeps all original source hashes and revision metadata. It checks SHA-256s,
cutoff dates, duplicate registry IDs and kind/rarity pairs, full supported mapping,
unknown references, finite/positive values, probability bounds/totals, particle
counts, registered evidence keys, and raw client constructor columns. A change
requires regeneration and changes `Catalog::sha256`. `MatchView` retains that
hash and version independently of the W0 wave-schedule version.

The source directory may have any name. From its root, use
`python3 tools/catalog/generate.py --check --self-test`; ordinary builds need no
external reports, reference Wasm or wiki tree. `--self-test` checks a minimal
renamed copy and rejects changed bundled evidence and stale generated output.

To verify the complete original archives explicitly, use:

```sh
python3 wave/tools/catalog/generate.py --check --verify-evidence \
  --evidence-root /path/to/original/repository \
  --snapshot /path/to/original/snapshot
```

The snapshot directory must contain both original `client.js` and `client.wasm`;
a Wasm file with `client.js` beside it also works. The evidence root is required
and resolves `sources[].path` and the W0 reference path. If `--snapshot` is omitted,
the original Wasm source path under that explicit root supplies its directory.
Every original source and snapshot hash is mandatory in this mode. Missing inputs
or hash differences fail. Snapshot/evidence-root arguments without the verify
flag fail instead of being ignored. Default output distinguishes bundled checks
from full external verification.

## Evidence and adoption

- Original client build: `b632797f0ee487dd99df460b13bde6d7ce5c9773`.
  Wasm SHA-256: `68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0`.
- W0 `reports/wave/W0/catalog.json` establishes IDs/names, all six rarities,
  constructor raw columns, and four-particle Peas/Grapes. Faster is ID 12; Fast
  is not a separate registered type. Basic/Rose internal enum values remain
  unchanged for fixture compatibility; never cast an enum to obtain a client ID.
- `wave/data/evidence/20221030/{rules,sources}.json` and the older cached
  English Fandom revisions are reused by hash. Basic 2192, Faster 2413,
  Rose 2305, Leaf 2030, Web 2310, Peas 2332, Grapes 2053 and Honey 940 all
  predate the cutoff. Later revisions are not imported.
- `primary-changelog.txt` was fetched from the linked upstream English in-game
  changelog transcription during this implementation. The relevant original
  entries agree with the retained client: August 30, 2022 friendly-mob Leaf
  healing; August 31 Peas/Grapes separation; September 1 Mythic craft chance 3%;
  October 20 independent craft rolls and existing-failure migration. The W0
  Chinese changelog transcription belongs to the same log independence group,
  not independent confirmation. W0 records wiki.gg History requests returning
  403; no modern wiki.gg numerical values are adopted. The October snapshot
  Honey slow-on-contact behavior is retained; subsequent attraction behavior is excluded.
- Craft displays are **60/40/20/10/3 percent**, five little-endian u32 values at
  Wasm file offset 2400435 (memory 53136, reader `$902`). Generator validation
  checks the locked byte selection; full external verification compares it with
  the original Wasm. Server success probabilities are a **separate reconstruction
  adoption** of those values. Only Mythic 3% has an additional dated primary log.
- Failed craft loss is explicitly `failureLossRange: [1,4]` with four equal
  `failureLossWeights: [1,1,1,1]`. The range is corroborated by the original UI;
  equal weights are reconstruction. Successful attempts consume five inputs;
  failed attempts return `5 - loss`.
- Client constructor `offset12` and `offset16` are raw observations, **not server
  damage/HP**. E.g. Common Basic is 7/5 there; adopted server damage/HP is 10/10
  from the dated wiki. The two representations intentionally remain separate.

All server values are explicitly classified as reconstruction. Wiki fields are
candidates, not observations of a historical server. In particular:

| Dimension   | Adopted value                                                                          | Candidate bounds / limitation                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Basic       | Damage 10/13/18/24/32/40; HP 10/12/14/17/21/25; reload 2.5 s                           | Conflicts with raw client constructor fields; field meanings remain unresolved                                                          |
| Faster      | Orbit +0.2/0.2/0.3/0.4/0.5/1.2 rad/s; reload 0.8 s; one particle                       | Wiki also says 0.5 s; later Mythic rework statements are ambiguous; original constructor count wins                                     |
| Rose        | Heal 10/13/18/24/32/40; delay 1 s; reload 3.5 s; teammate range 24 sim units           | Range and instantaneous absorption reconstructed; target owner first, then nearest teammate                                             |
| Leaf        | Passive 1.6/2.1/2.9/3.8/5.1/8 HP/s; mob heal 10/13/18/24/32/40                         | Common availability and Mythic mob heal unresolved; equipped **live** Leaf required                                                     |
| Stinger     | Damage 35/46/63/84/112/140; fragile; reload 4 s                                        | No retained dated stat table; per-field sensitivity intervals in JSON, one particle adopted                                             |
| Peas        | Four particles; per-particle damage 3/4/5/7/10/12; reload 1 s (Mythic 0.3 s)           | Dated wiki infobox/table disagree; selected Function table; whole-group health divided by four                                          |
| Grapes      | Four particles plus total poison 11/14/20/26/35/44 over 1 s                            | Duration and Mythic poison reconstructed; refresh per same source, separate sources stack                                               |
| Projectiles | Speed 70, range 45 sim units; four directions at 90 degrees                            | Absolute units and launch phase reconstructed; no nondeterministic unlogged aiming                                                      |
| Web         | 75% nonstacking area slow for 10 s; Spider immunity; radius 10/12/14/16/18/40          | Client-to-sim scale 5; Common availability reconstructed; ground area uses original Web visual                                          |
| Egg         | Hatch after 2 s; beetle summon; reload 5 s; lifetime 15 s                              | Dated Leaf text confirms **Mythic** Egg beetles only; other rarities, hatch delay/lifetime and repeat spawning explicitly reconstructed |
| Honey       | 20% contact movement slow; rarity duration 3.2/3.2/4.3/5.8/7.7/9.4 s                   | Common/Unusual availability reconstructed; stacks by distinct source, refreshes same source                                             |
| Cactus      | Max-health bonus 10/13/18/24/32/40; one particle; no poison                            | Bonus magnitude/count not historically established; equip increases max HP without minting HP                                           |
| Early mobs  | Common W2 calibration retained; HP x1/1.2/1.4/1.7/2.1/2.5, damage x1/1.3/1.8/2.4/3.2/4 | All server calibration reconstructed; segment IDs 13/15 and ant-hole ID 9 retain separate roles                                         |
| Economy     | Four dated common-mob drop rows; cumulative XP thresholds and XP 1/2/4/8/16/32         | Bounded initial tranche, not a complete historical drop table; XP/failure loss/allocation reconstructed                                 |

Progression uses the shared reconstruction `100*(level-1)^2`, levels 1–255,
with a level-256 next-level sentinel for progress encoding. The client byte cap
is a server compatibility choice, not a verified historical maximum. The
observed five-to-eight main-slot schedule is centralized in `LevelTable`
with unlocks at 15/30/45 (`$107` -> table 143 -> `$3645`); both Store and
projection consume catalog functions. The original server XP curve is unknown.

`candidateRanges` are explicit sensitivity bounds around adopted unknown values,
**not measured confidence intervals**. The main calibration envelope is 0.5–2x.
Where a historical conflict is known, this document records it separately (e.g.
Faster reload). JSON includes body and effect units, rounding, particle scope,
source keys, and remaining unknowns. Rare+ and unavailable historical petal
variants can exist in this local reconstruction, but never add Ultra.

## Simulation model and API

`Rules::catalog == nullptr` keeps explicit W1/W2 fixture bodies, reloads and
contact healing unchanged. Production `garden_rules()` binds `catalog::dated()`.
Catalog reloads/delays use seconds; tick-based body cooldown/poison fields use a
25 ms source tick and are converted at the simulation timing boundary.

`Match::add_player(id, start, vector<Petal>, vector<Rarity> = {})` keeps the
original API and defaults to Common. `set_loadout(PlayerId, ...)` / `equip(...)`
are immediate calls on the simulation executor. `queue(Equip{life,kinds,rarities})`
is a validated life-scoped tick-boundary command. `equip(id,slot,kind,rarity)`
updates one slot. Unknown kinds, unsupported effects, invalid rarities, mismatched
rarity lengths and >8 active slots are rejected atomically. None preserves empty
slot positions. Unchanged slots preserve their particles and timers.
`catalog::can_equip(kind,rarity)` exposes this boundary to app validation;
`client_petal()` and `petal_from_client()` provide identity mapping independently.

`PlayerView::loadout_rarities` parallels `loadout`. Each `PetalSlotView` keeps
legacy `entity` (first live orbiting particle), `entities` (all live particles),
`reload_ticks` and `reload_total_ticks`. All particle IDs refer to normal
`EntityView` rows with original kind, equipped rarity and owning `LifeId`.
The last broken/detached particle begins group reload. Detached projectiles can
coexist with a reloaded group; all children are reaped when the owning life ends.
`Defeat` retains mob kind, rarity, position and origin wave after entity removal.
`LifeChange` adds an optional final/spawn body position; its default preserves old
three-field aggregate initializers. Garden can use the final position after reap.

Tick order is commands, life/slot refresh, scheduled spawn, movement/orbits,
special effects, contacts, existing poison, queued impacts, consumption/expiry,
death/credit, final orbit update, wave adjudication. A newly launched projectile
first moves on the following tick. New poison first ticks on the following tick.
Only effective healing consumes a Rose/Leaf. Friendly mobs can eat Leaf; enemy
entities cannot receive team healing. Summons and segments stay outside main-wave
counts and credits. Honey and Web do not modify ownership or reward eligibility.

The native W3 test exercises complete registry roundtrips, all emitted mappings,
cross-rarity damage/HP, multi-particle loss/fire/reload, projectile damage and
range, poison attribution, healing delay/caps/range/consumption, Web immunity and
expiry, summon lifecycle, Faster/Cactus/Honey effects, live equipment validation,
empty slots, removed-mob reward metadata and explicit legacy fixtures. The main
agent owns CTest registration, protocol projection, store integration and real
client presentation verification.
