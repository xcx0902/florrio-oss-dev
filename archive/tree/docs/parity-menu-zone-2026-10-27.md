# Menu and overlevel verification

Online identity was checked in the real Chrome browser at `https://static.florr.io/old/`: `client.wasm` is 1,844,233 bytes, SHA-256 `c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1`, identical to the frozen local client. Online `client.js` SHA-256 was `1972a6370fe9676a94ec42a10e2686346c42af6ce035c2bfc2040366b5f5eec7`. No frozen artifact was changed.

## Item 11: wheel scrolling — confirmed and fixed

`source/javascript/client.js:1453` already normalizes wheel input correctly. Frozen client function626, WAT/decompiled `source/decompiled/client/functions-0256-0319.dcmp:1609`, then multiplies it by 75 times the local content scale before advancing its float32 target. Panel content scale is 1. The port omitted the 75 factor. Function626 subsequently smooths ordinary scrolling with `1 - 0.8 ** (dt * 0.06)`, rather than the port's 0.72. The native snap threshold is zero; the prior port also introduced an unsupported 0.01 snap.

The added menu regression runs actual original626 and the TypeScript menu side by side for Petals, Mobs, and Changelog. It compares each sampled frame with positive/fractional/reverse wheel deltas, changing frame times, and both clamped ends, tolerance 0.0002 logical pixels. All nine menu tests pass in real Chromium.

## Item 13: overlevel warning — confirmed and fixed

Original client1095 independently computes warning visibility from live flower position and client588's level-dependent zone boundary. Field63 only controls the radial countdown; returning to a correct zone drains the server accumulator at 0.1 times real time. Using the nonzero timer as visibility kept the incorrect warning on screen for up to 450 seconds.

Original WAT function588 (lines 65742 onward) promotes the float32 constants 0.3/0.6/0.9 to doubles, then rounds the boundary to multiples of 50 using function631. This matters at zone ties: width4125, level15 yields -800, not -850. Tests call original588 at eight level boundaries and three arena widths, comparing visibility on both sides and at the exact boundary.

Original1095 sets a title `MOVE RIGHT ->` (20px, RGB255/170/170), `You are overleveled for this zone` and `You will be unable to attack` (both14px, white), rather than a numerical seconds message. It uses a measured, rounded black panel with half opacity, anchored at viewport center minus170 logical units, laid out through original1099. The 22/18 radius circular indicator is original callback2636 via the actual vtable90324. Visibility uses `1 - 0.7 ** (dt*0.06)` and the timer uses `1 - 0.8 ** (dt*0.06)`; the countdown conversion is literally0.003922. These are retained presentation states advanced once per frame.

The warning command template writes `65.0` at `+4` (`client.wat:320237`); original691 carries that qword into the command record's `+24/+28`, and original1099 computes `panelWidth = max(labelWidth) + record[+28]` before placing the callback arc at `panelLeft + panelWidth - 30`. The port previously used only `max(labelWidth)`, which put the arc 65 logical pixels too far left and made it overlap the label text. The width now includes the 65px gutter; the focused native1099/2636 test asserts that the widest label and the title both stay at least 8px left of the 22px arc. Exact text rasterization remains browser-dependent, as noted below.

The focused tests run native1099 with its actual callback and compare both arcs for five timer fractions. The warning fade, reset, repeated frame clock, and continued timer decay in a correct zone are covered. All three focused tests pass. Exact pixel equivalence for this popup's text rasterization has not been independently established across browsers; source layout and native arc geometry are verified. Compact special-event moving boundaries are outside the default 50,000-unit single-player arena and were not changed.
