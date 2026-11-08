# W3 authoritative economy store

`store.hpp` is the independent C++20 application boundary. Link `store.cpp`
against stock SQLite using `find_package(SQLite3 REQUIRED)` and
`SQLite::SQLite3`. Public structs import no simulation, catalog, or wire types.
The implementation reads the generated catalog's inline level and craft tables
as the single numeric authority; no catalog/simulation library link is required.

## Integration contract

Construct `wave::store::Store(path, options)` on the application's I/O worker.
The API is synchronous. One instance serializes callers with a mutex; separate
instances and processes serialize writes with SQLite `BEGIN IMMEDIATE`.
The application owns its bounded queue, overload policy, and tick isolation.
Do not invoke another method on the same store from its RNG/fault callbacks.

`admit(token)` recovers a known bearer token or creates an unrelated fresh guest.
`recover_guest(token)` returns an optional and never creates anything. Tokens
are 256 bits from OS entropy, encoded as 64 lowercase hexadecimal characters;
the injectable craft RNG cannot influence credentials. Public commands require
that token; reward recipients use trusted server guest IDs. Arbitrary claimed
guest IDs/tokens are never adopted. Protocol caches and match reconnect state
have lifecycles outside this database.

`Profile::inventory` counts **all owned copies, including equipment**. Slots
0–7 are main slots and 8–15 are their reserve counterparts. Empty slots are
`std::nullopt`. Owned items accept original petal kinds 1–45 and rarities 0–5.
Discoveries are **explicit mob gallery entries only**, with their separate
original mob kinds 1–35 and rarities 0–5. Starter, crafted, rewarded, and seeded
petals never implicitly discover a mob; the caller supplies discoveries.
The original table's `None` kind 0 is never an owned item. Equipped copies
must be owned and are always protected against crafting.

New guests have XP 0, level 1, highest wave 0, version 0, and exactly five
Basic Common copies in the first five main slots. There are no gameplay test
handouts. `seed_for_testing` replaces a fixture profile only when the caller
explicitly constructs the store with `Options::allow_test_seed = true`.
Use it in an offline test executable; the production default is false.

Commands carry `Command{scope,key,expected_version}`. A scope such as a server
connection UUID and key such as the original reliable sequence establishes the
application's replay boundary. The store does not require a client request ID.
The app resolves current life eligibility before building `EquipRequest::alive`.
It supplies the full desired slots array; validation preserves owned quantities.

`CraftRequest{item,attempts,automatic,keep,highest_output_rarity}` maps the
original all flag to `automatic`. Attempts are capped at 1024. Automatic craft
stops early when it cannot reserve five unequipped inputs after protecting
`keep` additional unequipped copies. A manual batch commits all requested
attempts or rejects the batch without any inventory change. Either mode
operates on one input kind/rarity without cascading into the newly created
rarity. The app can enqueue subsequent bounded commands if required by the UI.
Basic Common is forbidden; Basic Unusual and above can craft. Mythic cannot
craft Ultra, and `highest_output_rarity` protects a lower configured ceiling.

`Result` contains a status, `replayed`, the original result profile, and craft
totals (attempts, successes, consumed, returned). A failed roll is a successful
command with zero creations. `returned` counts unconsumed copies of the five
submitted inputs; equipped and keep copies are separate. A replay returns the
original committed snapshot, even if later operations changed the profile.
Use `recover_guest` for the current authoritative snapshot when needed. Do not
replace a newer in-memory profile with an older replay snapshot.

`reward(RewardEvent{match_id,scope,event_id,recipients})` accepts the server's
eligible recipient set. The app resolves damage attribution, shared eligibility,
distance, and logical segmented-death identity before calling it. Use separate
scopes for kill XP, pickup claims, and wave completion. Each recipient can carry
XP, items, discoveries, highest wave, and an optional expected profile version.
The canonical recipient set commits atomically and has one immutable result.
Two claimants using the same pickup event cannot both win: the changed
recipient fingerprint conflicts. Reordered identical shared recipients replay.
Highest wave is monotonic; XP does not implicitly award wave progress.

## Transactions and recovery

The database uses WAL, foreign keys, a configured busy timeout (default 5 s), and
`synchronous=FULL`. Schema v1 stores profiles, inventory, slots and discoveries;
v2 adds command and reward journals. Both migrations run in one transaction.
Opening a future schema fails instead of silently reinterpreting it.

Inventory, progression, profile version and the command/reward result commit
in the same transaction. Deduplication checks precede version checks so a retry
after a lost reply recovers its original result. The fingerprint stores the
complete canonical length-delimited semantic request, including operation,
expected version and all policy arguments; it uses no collision-prone hash.
Changed semantics with an already committed scoped key return `key_conflict`.

Terminal command rejections are journaled without changing profile version.
Unknown guest, invalid key, version conflicts, and uncommitted reward errors
are retryable and are not journaled. SQLite lock/I/O failures throw `Error`,
which exposes its SQLite code. No success is returned before commit. Faults at
`after_inventory` or `before_commit` roll back; `after_commit` models a committed
result whose reply was lost. Result codecs have an explicit version and checked
boundaries, independent of C++ object layout. Journals are retained durably;
the application must not reuse their keys for different operations.

## Historical evidence and reconstruction boundaries

Rules version: `20221030.store-reconstruction.1`.

| Rule                       | Adopted behavior                                                           | Evidence and limits                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNG mode                   | Independent success draw per attempt; no pity counter                      | Existing `wave/data/evidence/20221030/rules.json`, `craft.rng.mode`, original 2022-10-20 changelog. New profiles only; importing old pseudorandom failure counters is not implemented. |
| Success display            | 60%, 40%, 20%, 10%, 3% for inputs Common through Legendary                 | Main investigation's original Wasm `$902`, u32 table at memory `53136 + rarity*4`: `[60,40,20,10,3,0]`; Common 60% also confirmed in original UI.                                      |
| Server success probability | The same five displayed probabilities, integer thresholds out of 1,000,000 | **Reconstruction assumption:** display values do not independently establish server thresholds.                                                                                        |
| Recipe                     | Five input copies create one copy one rarity higher on success             | Original five-to-one menu behavior; no Ultra crafting before the 2022-10-30 cutoff.                                                                                                    |
| Failure loss               | Destroy 1–4 copies; return the other 1–4                                   | Original UI explicitly says failure destroys 1–4. **Reconstruction:** uniform loss within that range, using a separate unbiased draw.                                                  |
| Basic restriction          | Common Basic cannot craft; Unusual+ can                                    | Main investigation's original UI `$436`, `rarity==0 && kind==1`.                                                                                                                       |
| Ownership                  | Inventory includes equipment                                               | Main investigation's original `cached_inventory` subtraction in `$308`.                                                                                                                |
| XP levels                  | Delegates to `catalog::level_for_xp` and its generated `xp_thresholds`     | **Reconstruction** in the dated catalog; shared with projection. Current catalog uses quadratic cumulative XP `100*(L-1)^2`, capped at level 255. No separate store formula.           |
| Slot unlock                | Five pairs below level 15, six at 15, seven at 30, eight at 45             | **Observed** original `$107` cached_num_petals, table 143, `$3645`. Store delegates to the catalog's unlock helper.                                                                    |
| Auto/batch controls        | Single input tier, hard attempt cap, explicit keep and rarity ceiling      | **Reconstruction** of bounded server policy. Raw packet interpretation and original result encoding remain owned by wire/application integration.                                      |

## Native verification

From the repository root, without editing CMake:

```sh
clang++ -std=c++20 -O2 -Wall -Wextra -Wpedantic -Werror -pthread \
  -I wave/server wave/server/store/store.cpp wave/tests/native/w3_store.cpp \
  -lsqlite3 -o /tmp/w3-store-test
/tmp/w3-store-test
```

The no-argument executable covers W3-02/03/04 at the store boundary: exact
probability thresholds, failure-loss boundaries, five-input recipe, Basic and
Mythic protection, auto keep/equipment/cap, atomic manual batches, shared XP,
monotonic highest wave, invalid requests, integer overflow, migration, full
profile recovery, two-connection races, eight same-instance callers, bounded
SQLite lock waits, injected rollback/lost reply, and child-process exits before
and after commit. The application/wire/browser acceptance remains a separate
integration responsibility.

The complete schema, limits, historical evidence, queue contract, and named
fault/recovery tests are documented in `wave/docs/store-20221030.md`.
