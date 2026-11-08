# Original profile / highest-wave investigation

Read-only investigation of the retained 2022-10-30 client. No wire or application
behavior was changed by this investigation. **No profile field can currently be
identified as `highest_wave` with sufficient evidence.** In particular, assigning
that name to one of the four integers below would be a reconstruction assumption.

## Artifact identity and exact fields

| Input                                 | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `wave-reference/20221030/client.wasm` | `68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0` |
| `wave-reference/20221030/client.js`   | `23c51f12ec4f31b66e4796d799ac944c05b60114cb84ba58e354ed1c53ab4dc0` |
| `build/wave/reference/client.wat`     | `235c18e162e92ed0d8407814da325ca3aecc00cb40fccd0ab221db008743e3dd` |

Line numbers below refer to that exact WAT, not to a shortened function extract.
In `$601`, after the first 276-value profile array, the next four values are
ordinary unsigned base-128 varints, not floats or fixed-width words:

| Order after the array | Profile destination | Full reader store line |
| --------------------- | ------------------- | ---------------------- |
| 0                     | `profile + 2220`    | 420631                 |
| 1                     | `profile + 2224`    | 420953                 |
| 2                     | `profile + 2228`    | 421284                 |
| 3                     | `profile + 2232`    | 421600                 |

The array loop ends at line 420280 (`i32.const 276`). The alternate full-reader
branch also writes the four destinations (422286 onward). The incremental reader
at 446195–447178 uses `base = $140(entity) + 2220`, delta-coded indices, a four-byte
stride, and an unsigned-varint value store. This establishes an indexed integer
collection, but does not establish its semantic names or a biome ordering.

`$140` (72485 onward) creates/returns the entity's profile component at entity
offset 104. It initializes level 1 at `+8` and clears 2261 bytes starting at `+12`
(72970–72986), which includes these four values. Therefore zero is the observed
constructor default, not evidence that zero means “no wave completed.”

The current writer's four zero `vu`s occupy the correct syntactic positions.
They cannot be given a supported highest-wave value solely from this layout.
Wire byte positions after a nonempty inventory/counter array are variable; use
decoded field order, not absolute packet byte offsets.

## Requested functions and the actual display path

| Function                 | Observed role / relevant evidence                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$988` (928289 onward)   | Reads a message identifier and dispatches on `id - 11` (928953); called from `$601` and `$3309`. No direct reader of the four profile destinations.                                                                                              |
| `$991` (948126 onward)   | Per-frame client/world update, called by `$3437` between receive/update and send processing. No direct reader of those destinations.                                                                                                             |
| `$992` (971915 onward)   | Drains a queued outgoing-message structure after checking the connection state at socket-object `+104 == 2`; uses `$600` to send. No profile progression display established.                                                                    |
| `$2627` (1440748 onward) | Connection callback, not a wave-selection control. It checks JS asm-constant `143827`, whose retained glue is `a => 1 == ba[a].readyState`; then changes connection state `+104` from 1 to 2 and invokes its callback. Function-table slot 4970. |
| `$140`                   | Profile component constructor/accessor described above.                                                                                                                                                                                          |

The actual `"Wave %d"` label is `$828`, not the profile integers. At
564014–564028 it selects the active cached wave component; at 566035–566053 it
formats `componentFields[+12] + 1` with static string address 35604. This is the
**current match's displayed wave**, not a highest-wave label. `$845`
(575872 onward) formats `"Starting in %.0f..."` from a countdown in milliseconds;
the text does not represent a selected starting-wave number.

The large menu renderer `$939` builds `"Squad"` and `"Private squad"` using
strings 35316 and 35302 (notably 731997 and 732344). The retained static strings
contain no “Highest Wave” or “Starting Wave” selection label. A whole-module
search found no direct `*.load* offset=2220/2224/2228/2232`, nor a second use of
the profile-array base `+2220` outside its incremental decoder. This is bounded
negative evidence: it does not exclude opaque generic copies or prove a
server-side meaning for these values.

## Original behavior versus an inference

The client's own embedded changelog is primary artifact evidence. Its strings
describe automatic squad placement/start selection:

| Static address | Observed statement, paraphrased                                              |
| -------------- | ---------------------------------------------------------------------------- |
| 44916          | Squad starting wave partly depends on each member's best completed wave.     |
| 45025          | Public joining chooses the highest-wave game available to that player.       |
| 42914          | Joining existing public games requires having beaten the squad's wave.       |
| 44052          | The initial-wave calculation was changed to permit higher starts.            |
| 48025 / 48059  | An older change allowed wave-11 starts and reset prior highest-wave records. |

Inference: highest-wave eligibility and the chosen starting wave were decided by
the original server. This supports using persisted highest-wave data for server
matching/start policy; it does **not** identify a private-profile field, recover
the policy formula, or establish a native manual wave selector. No manual
highest-wave/start-wave selector was recovered in this investigation. These
embedded historical entries also do not establish behavior after this client's
cutoff.

## Reproducible checks and remaining discriminator

1. Verify the three hashes above, extract `$601`, and inspect the four stores.
   Follow the preceding first-array loop to its `276` bound and the following
   string reader to verify field order. Inspect 446195 onward separately to
   distinguish an incremental update from a full profile.
2. In a separate local original-client probe, emit distinct values such as
   `[17, 29, 43, 61]` in those four positions. Locate the profile pointer via the
   profile entity's component offset 104, then inspect its four u32 destinations.
   This verifies decoding and alignment only; these values are **not** valid
   semantic highest-wave test data yet.
3. Compare menu/Squad rendering and outgoing commands while changing each value
   independently. A visual change or packet change needs a traced consumer before
   naming the field. Separately change the wave-component index: `$828`'s label
   should change to index + 1, proving it is a different display path.
4. A captured original server profile with an independently known best wave, or
   original server code/schema, remains the strongest discriminator. Correlation
   across two profiles and across a newly completed wave would be needed to
   identify a candidate, its mode ordering, and whether it stores a completed
   count or a zero-based index.

Steps 2–4 are proposed discriminators, not runtime observations made here. The
investigation intentionally leaves the four values unnamed and does not alter
the main agent's wire writer or protocol tests.
