# Tooltip geometry, petal labels, death row and centipede chain

Date: 2026-10-28. The original browser build (`static.florr.io/old/`), the
decompiled client/server bodies and the frozen goldens stayed read-only.

## 1. In-game tooltip position and text alignment

### Confirmed original behaviour

- HUD scale is the maximum of the two viewport terms, not the minimum. The WAT
  `select` at `client.wat:133286-133296` keeps the height term when
  `width*0.000520833` is smaller; the same selection is used at
  `136134-136142` and `78083-78089`. At 1440x900 this is `0.8334`; at 800x600
  it is the `0.7` floor. The previous `Math.min` produced `0.667` and `0.7`.
- `func1099` converts its anchor back to logical units (`l = y/e`, `p = x/e`,
  where `e` is the UI scale) but keeps the unscaled 24/14/16 font metrics.
  Width is the widest cached line box plus 10; height is the sum of
  `font*1.1` plus 10. The content edge is clamped to 15 logical units and the
  rounded panel adds 5 units of padding on each side
  (`functions-0704-0767.dcmp:30198`).
- Cached line bitmaps are drawn with their **bitmap box width**
  (`func385(text) + 2*trunc(font*scale)`), not the bare measured text width.
  Stretching them to the bare width compressed glyphs and made the left edge
  of the lines disagree.
- The blank initializer between rarity and description uses the native default
  font 16 (`func623`), so its line advance is `16*1.1`.

### Fix

`client/src/render/tooltip.ts` now takes CSS-pixel anchors and divides them by
the UI scale once; it lays out the unscaled 24/14/16 line stack, uses bitmap
box widths, 5-unit panel padding, the 15-unit viewport clamp and the native
`setTransform(ratio*uiScale)` matrix.

`getHudLayout` in `client/src/render/hud.ts` now uses
`Math.max(viewportWidth*0.000521, viewportHeight*0.000926)`, with the existing
0.7 floor. All tooltip callers (hotbar, slot motions, expanded inventory, menu
galleries, death row) pass `logical * scale`.

### Browser evidence (DPR 1, headless Chrome)

| Viewport | Original panel box | Rebuild panel box |
| --- | --- | --- |
| 1280x720 | x 403..623, y 532..590 | x 403..623, y 531..590 |
| 1440x900 | x 439..700, y 675..745 | x 439..700, y 675..745 |
| 1920x1080 | x 622..937, y 810..894 | x 622..937, y 810..894 |

Title/rarity/description text rows are identical at 1280x720 (title rows
537-549, description rows 577-586 in both captures). The 1440x900 and
1920x1080 captures also match the original line positions and box edges.
DPR 2 was checked separately; the legacy original scales its UI from the
backing-store size, while this port keeps CSS-pixel UI geometry. That known
DPR presentation difference is not changed here.

## 2. Long petal names in hotbar and death cards

`func587` computes the card label font from the **definition radius** at
`definition+36`:

```
font = f32(definitionRadius * cardSize) * 0.014286
```

`PETAL_INFO.radius`, however, is the collision radius used by entity art.
Basic's definition radius is 14 but Dandelion's is 11 and its collision radius
is 9. Using the collision radius made Dandelion and other long names render too
large and overflow the 70-unit card.

`tools/gen-client-petals.mjs` now emits a separate `labelSize` from the
definition radius, and `client/src/schema/petals.ts` was regenerated. Slot
labels use `labelSize * size / 70`; entity art keeps using `radius`. A browser
check with slot 0 set to Dandelion shows the smaller 11-unit label inside the
card, while Basic keeps its previous 14-unit label.

The label bitmap keeps the native raster oversampling used by the archived
0.7 trace (`2.4*scale*0.882583333` in effective font pixels); this preserves
the 60x29 cached Basic bitmap in `tests/parity/golden/garden-idle` while the
destination box now uses the full bitmap box width.

## 3. Death row cards and tooltip

`func1095` snapshots the retained slots, draws the statistics first, then draws
the retained cards at `mb = logicalHeight - 45`. Each card uses the same
`function_587` as the hotbar, including the definition-radius label. The card
tooltip is queued from the card transform with anchor `(0, -size/2 - 10)` and
the per-slot eased alpha `j[0]`; `func1099` drains that queue **after** the
cards and statistics (`functions-0704-0767.dcmp:10150-10158`, queue drain at
`10221` and following). Drawing it inline made the statistics text cover the
tooltip title.

`drawDeathOverlay` now queues the tooltip records, draws the statistics, and
then renders the tooltips after them. `deathHoveredSlot` hit-tests the retained
row (60-unit cards for filled equipped slots, 50-unit cards afterwards, pitch
`size+10`, origin 20) and `createHudState` advances one alpha per slot with the
native `1 - 0.7^(delta*0.06)` curve. Hovering works while dead; moving off the
card fades it out; respawn clears all tooltip alphas.

The frozen `death-observed.png` confirms the row's green cards at x
14/63/112/161/210 with 42-pixel width and labels at the same baseline. Its
vertical origin is 10 pixels lower than a 1280x720 layout because that oracle
frame was captured from a slightly taller canvas; the source formula
`logicalHeight - 45` matches the 1280x720 HUD layout (`logicalHeight 1029`).

The original client rejects synthetic suicide opcode-3 input, so a live
original hover capture was not possible. The draw order above is taken from the
`clientFrame` disassembly and the retained-row geometry from the frozen oracle
plus `func1095`; this limitation is recorded rather than fabricated.

## 4. Centipede chain after the head dies

Server `func404 removeEntity` publishes the removed record's owner to every
child before the record is released:

```
c = (a+236)[0] & ((a[93] << 25) >> 31);
while (b = a[18]) { e = b - 44; b = b[2]; function_73(e, c); }
```

`func73 setEntityOwner` clears the old owner link and either unlinks (owner 0)
or adopts the new owner. `func424 removeAi` detaches the dead AI record. The
port previously only cleared `child->owner`, leaving `ai.predecessor` pointing
at a released handle. `update_ai` skips every segment with a live predecessor
and `constrain_linked_entities` only enters through roots, so the remaining
body froze/disconnected after the head died.

`World::destroy` now transfers the dead entity's owner (only with the +93
ownership flag) to its children, re-points their `ai.predecessor`/`ai.owner` to
that owner when the dead entity itself was a linked segment, and otherwise
makes the next segment a root. `set_owner` sets the ownership flag, so a middle
segment removed later links its child to the preceding segment instead of
snapping the chain. The hard-coded centipede root filter now includes evil
centipede segments (type 18).

Regression: `test_centipede_exact_chain_and_rare` destroys the head and then a
middle segment, checking one root, eight linked segments after the head is
gone, and that the third segment adopts the first as owner/predecessor.

## 5. Development tools

- Removed the **Server speed** selector and all `setSpeed`/`serverSpeed`
  plumbing from `client/src/main.ts` and `client/src/dev/cheat.ts`. One input
  packet again advances exactly one fixed 50 ms server tick, matching the
  original fixed-step server.
- The cheat panel now lists read-only `petal id => name` and `mob id => name`
  tables above the loadout fields.
- Removed the Discord and Reddit buttons from the top-right of the menu
  (`client/src/render/menu.ts`). This is a deliberate product deviation from
  the original; `client/tests/menu-golden.test.mjs` filters exactly the native
  button op range 418..468 and leaves the rest of the strict frame comparison
  intact.

## Verification

- `npm run test:client`: 264/264.
- `npm run test:engine`: all unit/ctest targets pass, including the new
  centipede removal assertions.
- `node --test test/server-combat.test.mjs test/server-simulation.test.mjs
  test/server-spatial-ai.test.mjs`: 20/20.
- `npm run parity:engine-state:strict`: all 8 scenarios pass.
- `CLIENT_ROOT=dist-next node --test client/tests/menu-interactions.test.mjs`:
  13/13; `CLIENT_ROOT=dist-next node --test client/tests/worker-shim.test.mjs`:
  48/48.
- `npm run build:dist-next` and `npm run verify:dist-next`: 142 files,
  1,307,340 bytes, no issues.
- Browser checks: 1280x720, 1440x900 and 1920x1080 tooltip boxes/text rows;
  Dandelion hotbar label; death card row and hover tooltip.
