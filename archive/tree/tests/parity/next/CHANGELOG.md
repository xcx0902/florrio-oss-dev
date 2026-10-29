# `tests/parity/next` baseline changelog

`tests/parity/next` is the **self-consistency** baseline of the reconstructed
client (`run-client-scenario.mjs`). It is not an equivalence proof: the
visual gate against the archived client is `tests/parity/visual/report.json`
(R19.2). Every `npm run parity:client:update` must add a row here, because this
checkout has no `.git` and content hashes are the only history.

| Date (Asia/Shanghai) | Command | Reason | Canvas digests (boot-menu / garden-idle / move / attack / equip / damage / death / spawn) |
| --- | --- | --- | --- |
| 2026-10-24 22:30 | `npm run parity:client:update` | Same-frame visual reconstruction: golden trace now keeps the last 3 frames, camera.json pins the recorded camera, background is the archived alpha-0.1 bands over `#1EA761`, grid lines carry the +0.5 px offset, camera model is the runtime-probed 0.9 scale/0.6 ppw, and HUD/menu/entity art were ported. This is a self-consistency baseline only; the golden comparison is `tests/parity/visual/report.json`. | `4805857a / d1564dd5 / 690575ec / 1a1a32fd / 4c7c80e9 / d3ec766a / 70e517a3 / f3185e22` |
| 2026-10-23 22:52 (recorded 2026-10-24 00:03) | `npm run parity:client:update` | Old baseline only had `boot-menu` passing after the sub-pixel grid (`30.010254 px`, no `round(x)+0.5`, no `lineWidth` setter), two-layer arena (`#1A9657` exterior / `#1EA761` interior), hotbar colours and `lineWidth` changes. All eight scenes re-recorded. | `7015364d / 66c25aae / 19e6ae3c / aab9166c / edd3e1ec / 1cbdf95a / bc23298a / 129ede48` |

## Screenshot hashes at the 2026-10-24 22:30 re-record

| Scenario | SHA-256 |
| --- | --- |
| boot-menu | `5bc9c130b270266bb4420982ca873d70c47043762e569ad2a332a6e928c7b427` |
| garden-idle | `5f58382202e7604ad2b7e1d41cf3eb0c4a65dbf84e9b0b6e54e5d7b9fe6adf69` |
| move | `0d0ba6666b8016629959584f44c4ac4f324f94e63c185d94e979ae7e85cbfbf4` |
| attack | `00bd18ee259c0de9e8b56fca72e88b909a6b18506b7a8ff2302ced315c273557` |
| equip | `51e27bbbb96eced2d28721b521e62ac270ebe47a0414dd3d85082e3579f82f49` |
| damage | `f7e835242b8a9160e25d5138c72c02447719b5768fa4bcee768c3be9a92de893` |
| death | `6bbf1da9ded750207cc244c69a6fbf34b135f1ecb6d327e78651a3b1d53fa7b3` |
| spawn | `7a92d5c084f6fa2e3e0b9204de8f71f2fd3ee2f3e66c4c480e8a21f963ea0a02` |

## Screenshot hashes at the 2026-10-24 re-record

| Scenario | SHA-256 |
| --- | --- |
| boot-menu | `d763e34fec628ba22f82f7db00fcd56989f04efa9de260dd6547e5ec8ec5e611` |
| garden-idle | `d2c6c4e050e5fe81a3748f8ebef8e3306e67c451a5ccef806c9cd96db425fc95` |
| move | `98feb7a4709f374c5d5814b1adecb95bd20b4fe49fb228fd5c7a146da58396f4` |
| attack | `e691c4619f78ba35abfa085d3f3d632429095124dda651ddd3b92156c685853c` |
| equip | `1d501f1b78aebebeca30b5869745b67da2e65b0a07363b977ee6736699586e81` |
| damage | `63b441455a2b1ca33e6a67cedd32901632d015821204f34f3c7c892ce000d27c` |
| death | `9c8de2b05cdcfb9cc917fda09b0eec1cefc849da30cbe164c67d1ada8a20ec38` |
| spawn | `62a907452b21b526667f7f42d48504b8584ac05426b0853caad191be0233da4c` |

## Rules

- A baseline refresh is allowed only after explaining **why** the renderer
  changed; record the previous digests when they are available.
- A refresh never replaces the archived-client golden comparison. If a change
  also moves the visual gate, record both numbers in the same row or in
  `reports/current-verification.json`.
- `parity:client` proves repeatability. `parity:visual` proves equivalence.

## 2026-10-25 audit follow-up re-record

Command: `node tools/parity/run-client-scenario.mjs --all --update`.

Reason: production-derived menu entropy/metadata transition, native f32 scalar and camera interpolation, viewport/arena boundary history, owner-based text-cache lifetime, and entity animation/effect/UI reconstruction changed the generic renderer. The synthetic eight-scene baseline is refreshed only for repeatability; archived-client golden files and acceptance tolerances remain unchanged. Original equivalence is independently checked by the strict three-frame Canvas gate and pixel gate in the bound acceptance run.

| Scenario | Previous Canvas SHA-256 | Current Canvas SHA-256 | Previous screenshot SHA-256 | Current screenshot SHA-256 |
| --- | --- | --- | --- | --- |
| boot-menu | `f67941ed79190a6dcec47b53333805e45daa5d9c9eee675178411b69f9e0d023` | `23a9c150e12448dbd1e96f27970053656f370d933ba8a29a8a3f74d0548faf86` | `5bc9c130b270266bb4420982ca873d70c47043762e569ad2a332a6e928c7b427` | `1159b587929a43fd9df6eece1a6d6e50a929ac779f9516b03986f043f2e60bfe` |
| garden-idle | `e1ef99e415d01f47e7607d1aaf45f39a59a5d4ba5fdd1387a7999a42b30d6014` | `168995b84e336139ba6e68d014cc2eb7d939f5b057777a85e17f7a1d2f77cb2c` | `5f58382202e7604ad2b7e1d41cf3eb0c4a65dbf84e9b0b6e54e5d7b9fe6adf69` | `07d83de51c491be359cc1e25b723c7f14246293dfc6d40e9f2a5217d348cb60e` |
| move | `1ee17855e0d86e8585aa98d6137e3c222efa8573c697b110174d38a82e1fd61f` | `80ebf208e0252dae42869adb4e404be63e95da6452c8f09fa788d8d6885d358d` | `0d0ba6666b8016629959584f44c4ac4f324f94e63c185d94e979ae7e85cbfbf4` | `84d3ba044f40617efd23194f14b0b9267b332ccaa8b5f61aba5aa508aa7f5319` |
| attack | `1b8f14e30adfa0cead202fe77a0534ae79f41fce9f1f240434edb3dc75abb4b3` | `f160e089093aa1ccd2b6b5f71a3edbdacce55aceae4b5578319fe1a86912048f` | `00bd18ee259c0de9e8b56fca72e88b909a6b18506b7a8ff2302ced315c273557` | `15a42b13fbd9695191eb874bae0d1f7b5999578b997d235e41b57665020d7d8b` |
| equip | `028415c6ba08d735657bd8ea0eb88601cf93681ed36fc0589976ec041f682550` | `1d0591652fe606ae6c8330eeb3e739ceb0d44b75ddd933220ef1336d75ae3756` | `51e27bbbb96eced2d28721b521e62ac270ebe47a0414dd3d85082e3579f82f49` | `b75dfe40c118c4b3dab0f4285ef9293a6a7fae9b3572940a50ad43f133341965` |
| damage | `cd6f7cad41584f1e2b52c5f75136bb9e7758191101302a56333df9671dd3eb99` | `dd74a1bac109fd6f558334ae437c2828a28740522b19533676d6d62f10efd6c9` | `f7e835242b8a9160e25d5138c72c02447719b5768fa4bcee768c3be9a92de893` | `a5b886b2d6baa754bf5638fbd3dff28f5b313e252eb39405d89bea06c77abb25` |
| death | `ae3ff650fa7444851d5cb16f75d6c3eb384866539445045903f9880c4c62e149` | `8588581da335f914c63f7baf3ea533e64748f62bfb1c857dea13948c8ccb1965` | `6bbf1da9ded750207cc244c69a6fbf34b135f1ecb6d327e78651a3b1d53fa7b3` | `1f4904a5a147fc0c05ab2375f8b3bf4e23356e75fdac5ed441030a9f56a17021` |
| spawn | `06d0d41cb556562d4518cebd7702c682bf16cedc4b1b818e6291c490f11b7d7d` | `b967390e1ea1dc5185ef807a07b3a6bf8528fdc2c8ad71bf29f174810ed430d4` | `7a92d5c084f6fa2e3e0b9204de8f71f2fd3ee2f3e66c4c480e8a21f963ea0a02` | `4df33b3d31299b99fded48b950b98fbd7c32655633001837b300c63a334466c4` |

Repeatability harness correction: every repeat now starts in a fresh page with identical initial clock and renderer cache history. Reusing a page after only resetting fixture WorldState retained native text/arena/menu histories and was a different starting condition. The recorded first-run hashes above are unchanged; all eight scenes repeat exactly with the corrected isolation.
