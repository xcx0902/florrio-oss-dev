# Garden application economy · 2022-10-30

`app::Garden` connects the dated simulation and catalog to SQLite. W1/W2 callers
can keep constructing `Garden(rules, seed, fixture_loadouts)`; persistence is enabled
by an optional fourth `std::shared_ptr<store::Store>` argument. This document covers
application behavior. Historical numbers and their evidence levels remain in
[the catalog record](catalog-20221030.md); schemas, transaction results and crash
fixtures are in [the Store record](store-20221030.md).

## Executor and I/O boundary

Garden members, rooms, life checks and completion callbacks belong to one host
executor. `EconomyQueue` owns one I/O thread. `Garden::step()` and
`Garden::poll_storage()` do not wait for SQLite; the host must poll before publish
as well as on its timer, including a manually stepped fixture host.

The application retains at most 64 accepted I/O jobs, including the running job
and a completed job whose result has not been polled. `request_profile` and
economic commands return false when this queue is full. One job runs at a time;
later jobs wait until the previous completion is consumed. An exception retries
the exact transaction, version and key before later jobs run. This prevents a
transient failed craft from being overtaken by an equip. `storage_error()` retains
the most recent exception for diagnostics. No exception is converted to a success
or to an invented original-client error opcode. Retried I/O failures use an
exponential delay from 10 ms to 1 s; polling and simulation never sleep for it.

One simulation tick can produce a settlement batch containing separate kill,
wave and pickup transactions. When the queue is full, Garden retains one pending
batch per room and pauses that room's subsequent simulation ticks until the batch
can be queued. Other rooms and host I/O remain callable. A retry after a partially
committed batch replays its earlier event keys and continues the remaining events.
The shared recipients of one kill are committed atomically by Store; the entire
tick is intentionally not one transaction.

`wait_storage(timeout=5s)` is an explicit timed test/admission barrier, not a tick
operation. A timeout returns false while preserving pending work. Shutdown uses
the separate `drain_storage()` barrier: there is no wall deadline for a slow
successful transaction. It consumes each completion, submits later jobs and
retained per-room reward batches, and returns only once all accepted work is
drained. Condition-variable waits and retry sleeps prevent a busy loop; every
five seconds a diagnostic reports that shutdown is still waiting.

Normal Host shutdown explicitly calls `host.drain_storage()` before `io.stop()`,
on the Garden executor. HTTP `request_profile` completions can capture a
`Connection` that holds Garden, creating a lifetime chain from a pending job
through the connection back to Garden. Explicit draining executes and releases
those callbacks while the host still owns Garden; relying on Garden destruction
alone cannot start the drain when those callbacks keep it alive. The destructor
remains a final drain safeguard after this explicit host barrier.

Eight failed attempts on the same job during one drain call throw an explicit
exception containing the storage error. Pending work remains available if the
caller repairs the database and retries `drain_storage()`. The destructor calls
this barrier; if it fails or a completion throws, it writes the error and pending
count to stderr, flushes that diagnostic, and calls `std::terminate`. A failed
drain therefore cannot appear to be a successful normal shutdown. This policy
does not impose a timeout on an I/O call that has not returned.

Pending jobs and unclaimed drops are memory state; this implementation does not
journal an entire match for crash recovery. Committed profile changes and Store
event results survive process exit. Forced process termination can still lose
uncommitted work; the complete drain guarantee applies to a successful explicit
host drain or normal Garden destruction.

## Reliable admission and client error feedback

Garden's false return on economic commands can mean queue backpressure or a
terminal validation rejection. The session keeps a bounded deferred reliable
queue of 256 requests and advances its ACK only through requests admitted to
that queue; backpressure leaves the blocked command at the admission boundary.
The session owns that distinction and retries deferred work in order.

Terminal economic rejections and committed craft results whose `Result.code`
is not `ok` use the verified disconnect/reload path. Reload uses the guest token
to obtain the full committed profile. They are not encoded as opcode 35's normal
failed-craft result because the original error enum has not been recovered. An
actual unsuccessful random craft has `code=ok` and continues to emit the original
opcode 35 failure flag with its returned input count.

After draining deferred commands and polling storage, the session checks these
errors before publishing a snapshot. Snapshot projection does not independently
poll storage, so a callback cannot introduce a new error between that check and
projection. The session and wire layers implement this feedback policy; Garden
continues to expose the committed result and explicit command admission status.

## Admission and private profiles

`request_profile(token, callback, admit=true)` enqueues `Store::admit`; a known
bearer restores its profile, while an empty or unknown bearer creates an unrelated
new token. With `admit=false` it performs lookup only. Its callback receives
`optional<store::Profile>` and runs only from `poll_storage` on the host executor.
The host can use that result to return the original normal presentation cache
before starting the original client JavaScript. A successful read primes a bounded
256-entry admission cache. `Garden::admit` consumes the cached profile and uses
the persistent guest ID and token for the member identity.

The synchronous `admit` signature retains a compatibility fallback for unprimed
callers: it queues admission and polls for up to five seconds. **That fallback can
block the caller's host executor.** Production startup should first complete
`request_profile` asynchronously, then invoke `admit` with the returned token.
`step` never calls this fallback. This is a known limitation for a direct WebSocket
hello that bypasses the normal host cache/bootstrap path; admission is not claimed
to be universally nonblocking.

`Member::profile` is the latest observed committed snapshot. An older replay
snapshot cannot replace a newer version. Craft results are retained in a bounded
256-entry `deque<pair<uint64_t,store::Result>>`; `craft_sequence` gives each entry
a per-member cursor for the wire projection. Equip changes are applied through
`Match::set_loadout` only after commit. There is no newly invented S→C equip command
in this application layer.

## Equipment and crafting

Store keeps main slots at `[0,8)` and reserve slots at `[8,16)`. Original equipment
messages/cache use `n` main entries followed by `n` reserve entries, where `n` is
the shared catalog slot count: five initially, six at level 15, seven at 30 and
eight at 45. The application maps those compact indices to fixed Store banks;
unused original indices at or above `2*n` must be empty. Active slots reject
registered kinds whose authoritative effect is not modeled. Reserve slots may
hold registered inventory identities, but moving an unsupported effect active
is rejected before a Store mutation.

Opcode 12 supplies the full equipment array. Opcode 28 supplies two slot indices
and their **pre-swap** items. The application compares both old values against
the ordered committed state, then exchanges them atomically. The static evidence
is the dated Binaryen WAT `$463` at `build/wave/reference/client.wat:275857`:
the selected slot/index and selected item are staged at scratch offsets 8/9,
the target slot/index and its current profile item at 11/12; opcode 28 writes
both pairs through `$113` before updating UI animation bookkeeping. This identifies
old-value preconditions, rather than target assignments. Function names/line
numbers describe this local disassembly, not stable Wasm ABI names. Snapshot Wasm
SHA256: `68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0`.
Original UI runtime confirmation is recorded separately by the wire acceptance.

Craft maps `all=false` to one attempt; `all=true` to an automatic batch bounded by
Store's 1024-attempt cap, stopping when fewer than five available copies remain.
Original Autocraft generates these same requests per item/rarity. The wire `keep`
includes equipped copies. At the job's first execution, Garden subtracts the
actual committed count of matching equipped items and passes only the remaining
unequipped reserve to Store. Thus queued equip→craft ordering does not double
protect equipped items. The original request semantics, resolved version and
resolved Store request stay fixed across I/O retries.

Connected membership is required. During a running match, economic commands also
require the current acknowledged living `LifeId`; lobby operations do not require
a spawned life. Store validates stock, counts, slot locks and protected recipes.
Ready arriving behind economic jobs is deferred without waiting, then creates
the match using committed equipment. Leaving or replacing the connection prevents
an old deferred Ready from admitting that old connection.

`command(..., key)` receives the host connection nonce plus reliable sequence.
Garden prefixes an OS-random process scope, so restarting local connection and
sequence counters does not replay unrelated old work. Exact same-key requests
reuse their resolved version/request; changed semantics conflict. At most 8192
resolved command contexts are retained in memory; Store keeps durable results.
App validation rejections do not mint inventory and do not invent a wire result.
A reconnect with a different reliable key is a new request, not proof of replay.

## Combat settlement policy

The following allocation and distance choices are explicit reconstruction policy,
not a claim to reproduce the later December 30 damage-share formula.

| Event                            | Application policy                                                                                                                                                         | Durable key                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Kill                             | Only garden `main_mob` defeats with known mob/rarity and a team source owned by an eligible current life                                                                   | random match identity / `kill` / victim slot:generation |
| Shared XP/gallery                | Every connected living room member gets the full catalog mob XP and that mob's discovery; fatal source can be petal/projectile/summon, but its life must still be eligible | Same immutable kill recipient set                       |
| Segments/holes/summons/residuals | No separate root XP, gallery reward or drop roll                                                                                                                           | None                                                    |
| Drop creation                    | Independent deterministic server PRNG rolls from matching catalog mob-kind/source-rarity rows; only output rarities 0..5                                                   | Victim key plus drop-table row                          |
| Pickup                           | Connected living members within 36 simulation units; nearest wins, exact ties use lower persistent player ID; one item to one recipient                                    | random match identity / `pickup` / drop identity        |
| Highest wave                     | Only a threshold transition completing a wave; no update on entering a wave, deadline advance, wipe or last disconnect                                                     | random match identity / `wave` / completed number       |

Eligibility is frozen at the authoritative tick, before I/O. A player dying in
that tick is excluded. Sim's terminal-wave cleanup is distinguished from an
actual player defeat, so clearing the last wave does not remove a survivor's last
kill eligibility. An ended `LifeChange` carries the body and its final position
captured before body removal. Garden uses that snapshot for terminal pickup
distance, including movement during the final tick and a clear on the first tick;
it does not substitute the previous tick's position. The root kill ledger and
Store event key both prevent duplicate settlement. A claimed drop remains reserved
for its original winner while its
transaction retries; it is removed after commit. Old drops may be picked up in a
later wave. They have no client-authored claim endpoint, no expiry timer and no
persisted world representation in this tranche. The wire layer decides their
visual presentation.

Match reward identities are random independently of process-local numeric
`MatchId`; a restarted Garden's first match cannot reuse an earlier reward key.
Profile reward replays cannot regress newer cached versions. XP, gallery, inventory
and highest-wave effects are taken from Store's committed result, never inferred
from client caches or credited-defeat counters.

## Native verification

`tests/native/w3_economy.cpp` covers:

- A blocked transaction, 64 accepted jobs, rejected job 65, executor-only callbacks
  and commit-before-profile/result/Ready behavior.
- Ordered craft/equip, compact reserve mapping, current-life validation, unsupported
  active kinds, wire keep conversion, exact request replay and monotonic profiles.
- Swap old-value preconditions, inventory conservation, exact-key replay without
  reversing the swap, and stale-old-value rejection.
- Exceptions after inventory writes, before COMMIT and after COMMIT, with a second
  queued craft proving retry ordering and single consumption.
- Two guests sharing root kill XP/gallery, level threshold crossing, nonrewarding
  segments/holes/summons, a fixed-seed dated drop, out-of-range denial and nearest
  single-recipient pickup.
- A kill committed before a failing wave transaction, followed by whole-batch
  retry with exactly one kill mutation and one completed-wave mutation per guest.
- Deadline noncompletion, repeated ticks/polls, disconnected/dead/stale-owner
  exclusions, fresh Store/Garden recovery and restart-safe match identities.
- A first-tick final-wave clear preserving survivor XP, completion and pickup;
  final-tick movement beyond pickup distance preserving XP/completion while
  leaving the drop unclaimed.
- A 5.3-second transaction with 64 accepted jobs and an unsubmitted kill/wave
  batch: timed wait fails without losing work, destruction drains it all, and a
  new Store recovers exactly one equipment, kill and wave commit.
- Persistent transaction failure exhausting the explicit drain retry budget with
  backoff and no uncommitted profile/result, followed by repair and a complete,
  exactly-once drain of both retained commands.

Verified commands (2026-11-08):

```sh
cmake --build build/wave/native --target wave_w3_economy wave_w2_garden --parallel 2
ctest --test-dir build/wave/native --output-on-failure --no-tests=error -R 'W3-economy|W2-GARDEN'
```

Standalone C++20 builds use `-Wall -Wextra -Wpedantic -Werror`; a separate
AddressSanitizer/UndefinedBehaviorSanitizer build runs the same fixture. These
checks validate application/storage behavior and simulated authoritative events.
They do not substitute for original-browser W3 wire, cache, menu or visual checks.
