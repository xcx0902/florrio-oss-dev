import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuAnimation } from '../../public/render/menu-animation.js';

test('home petals are drawn only from discovered petal types', () => {
  const animation = new MenuAnimation(1234567);
  animation.setPetals([2, 6]);
  const flowers = animation.sample(1000, 1280, 720);
  assert.ok(flowers.length > 0, 'menu spawns floating petals');
  assert.ok(flowers.every(flower => flower.type === 2 || flower.type === 6),
    'no undiscovered Basic fallback once the gallery has entries');
});

test('an empty discovery list falls back to Basic during the first boot', () => {
  const animation = new MenuAnimation(1);
  animation.setPetals([]);
  const flowers = animation.sample(500, 1280, 720);
  assert.ok(flowers.length > 0);
  assert.ok(flowers.every(flower => flower.type === 1));
});
