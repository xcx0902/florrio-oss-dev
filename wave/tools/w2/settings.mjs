import assert from 'node:assert/strict';

export async function guestSettings(page, guest) {
  assert.match(guest, /^[0-9a-f]{12,}$/i);
  const status = `User ID: ${guest.slice(0, 12)}`;
  const settings = [];
  for (const mode of ['fresh', 'restored', 'rotating']) {
    if (mode === 'restored') {
      await page.reload();
      await page.waitForFunction(() => window.waveLabels.has('Ready'));
    } else if (mode === 'rotating') {
      await page.evaluate(() => localStorage.setItem('florrio_gamemode', '1'));
      await page.reload();
      await page.waitForFunction(() => window.waveLabels.has('Desert'));
    }
    await page.evaluate(() => window.waveLabels.clear());
    await page.mouse.click(23, 23);
    await page.waitForFunction((status) => window.waveLabels.has(status), status);
    const labels = await page.evaluate(() => [...window.waveLabels]);
    assert.deepEqual(
      labels.filter((label) => label.startsWith('User ID: ')),
      [status],
    );
    assert.ok(!labels.includes('(logging in)'), `${mode}: guest login is complete`);
    assert.equal(await page.evaluate(() => localStorage.getItem('cp6_player_id')), guest);
    settings.push({ mode, labels });
  }
  return settings;
}
