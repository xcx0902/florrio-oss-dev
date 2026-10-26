/**
 * Baseline parity scenarios.
 *
 * `steps` are executed after a fixed 90-frame boot to the main menu. Each
 * `advance` is a number of 16 ms virtual frames. `reset` clears the Canvas2D
 * recorder so the golden captures a short, focused frame window.
 */
export const BOOT_FRAMES = 90;

export const scenarios = [
  {
    name: 'boot-menu',
    description: 'Load to the main menu without input.',
    steps: [{ advance: 90 }],
    expect: 'menu',
  },
  {
    name: 'garden-idle',
    description: 'Press Enter, spawn into the garden and stand still.',
    steps: [
      { key: 'Enter' },
      { advance: 30 },
      { reset: true },
      { advance: 60 },
    ],
    expect: 'garden',
  },
  {
    name: 'move',
    description: 'Spawn, aim right and hold a movement direction for one second.',
    steps: [
      { key: 'Enter' },
      { advance: 30 },
      { mouseMove: { x: 1100, y: 360 } },
      { advance: 30 },
      { reset: true },
      { advance: 60 },
    ],
    expect: 'garden',
  },
  {
    name: 'attack',
    description: 'Spawn, aim right, hold the left mouse button and capture the attack pose.',
    steps: [
      { key: 'Enter' },
      { advance: 30 },
      { mouseMove: { x: 1100, y: 360 } },
      { advance: 10 },
      { mouseDown: 'left' },
      { advance: 20 },
      { reset: true },
      { advance: 60 },
      { mouseUp: 'left' },
    ],
    expect: 'garden',
  },
  {
    name: 'equip',
    description: 'Spawn, open the inventory panel, select slot 1 and capture the panel state.',
    steps: [
      { key: 'Enter' },
      { advance: 30 },
      { key: 'KeyI' },
      { advance: 5 },
      { key: 'Digit1' },
      { advance: 5 },
      { key: 'KeyI' },
      { reset: true },
      { advance: 30 },
    ],
    expect: 'garden',
  },
  {
    name: 'damage',
    description: 'Spawn, move toward the right-side garden and wait for a mob contact.',
    steps: [
      { key: 'Enter' },
      { advance: 30 },
      { mouseMove: { x: 1100, y: 360 } },
      { advance: 240 },
      { reset: true },
      { advance: 60 },
    ],
    expect: 'garden',
  },
  {
    name: 'death',
    description: 'Spawn, move toward mobs and wait long enough for a death/respawn cycle.',
    steps: [
      { key: 'Enter' },
      { advance: 30 },
      { mouseMove: { x: 1100, y: 360 } },
      { advance: 600 },
      { reset: true },
      { advance: 60 },
    ],
    expect: 'garden',
  },
  {
    name: 'spawn',
    description: 'Spawn and observe several mob spawn cycles while standing still.',
    steps: [
      { key: 'Enter' },
      { advance: 150 },
      { reset: true },
      { advance: 60 },
    ],
    expect: 'garden',
  },
];

export function scenarioByName(name) {
  const scenario = scenarios.find(item => item.name === name);
  if (!scenario) throw new Error(`unknown scenario ${name}; known: ${scenarios.map(item => item.name).join(', ')}`);
  return scenario;
}
