// Assembled and served exclusively by wave_host_dev. Original JS/Wasm stay intact.
(() => {
  const rarities = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic'];
  const reopenKey = 'wave_dev_open';
  const button = document.createElement('button');
  button.id = 'wave-dev-toggle';
  button.textContent = '存档调试 · DEV';
  const dialog = document.createElement('dialog');
  dialog.id = 'wave-dev';
  dialog.setAttribute('aria-labelledby', 'wave-dev-title');
  dialog.innerHTML = `
    <header><h1 id="wave-dev-title">存档调试 <small>DEV</small></h1>
      <button type="button" data-close aria-label="关闭存档调试">关闭</button></header>
    <h2>XP / LEVEL 与最高波次</h2>
    <p>修改总 XP 会换算等级；修改等级会将 XP 设为该等级起点。降级会卸下未解锁槽位的装备。
      三个场景的最高波次可分别设为 0 或更高，影响下次开局波次。保存会写入存档并刷新游戏。</p>
    <form data-progress>
      <label>当前总计 XP
        <input name="xp" type="text" inputmode="numeric" pattern="[0-9]+" required />
      </label>
      <label>LEVEL 等级
        <input name="level" type="number" min="1" step="1" required />
      </label>
      <label>Garden 最高波次
        <input name="garden" type="number" min="0" max="2147483647" step="1" required />
      </label>
      <label>Desert 最高波次
        <input name="desert" type="number" min="0" max="2147483647" step="1" required />
      </label>
      <label>Ocean 最高波次
        <input name="ocean" type="number" min="0" max="2147483647" step="1" required />
      </label>
      <div class="wave-dev-actions wave-dev-wide">
        <button type="submit" disabled>保存进度并刷新</button>
      </div>
    </form>
    <h2>库存</h2>
    <p>设置当前访客持有的花瓣总数，包含已装备副本。减少数量会卸下多余装备，
      设为 0 删除。保存会写入存档并刷新游戏。</p>
    <form data-inventory>
      <label>花瓣<select name="kind" required></select></label>
      <label>稀有度<select name="rarity" required></select></label>
      <label class="wave-dev-wide">持有总数
        <input name="count" type="number" min="0" max="4294967295" step="1" required value="0" />
      </label>
      <div class="wave-dev-actions wave-dev-wide">
        <button type="button" data-zero>数量设为 0</button>
        <button type="submit" disabled>保存并刷新</button>
      </div>
    </form>
    <p role="status" aria-live="polite"></p>
    <table><caption>当前持有</caption>
      <thead><tr><th>花瓣</th><th>稀有度</th><th>数量 / 已装备</th><th></th></tr></thead>
      <tbody></tbody>
    </table>`;
  document.body.append(button, dialog);
  const form = dialog.querySelector('[data-inventory]');
  const progressForm = dialog.querySelector('[data-progress]');
  const progressSave = progressForm.querySelector('[type="submit"]');
  const xp = progressForm.elements.namedItem('xp');
  const level = progressForm.elements.namedItem('level');
  const kind = form.elements.namedItem('kind');
  const rarity = form.elements.namedItem('rarity');
  const count = form.elements.namedItem('count');
  const save = form.querySelector('[type="submit"]');
  const status = dialog.querySelector('[role="status"]');
  const rows = dialog.querySelector('tbody');
  let profile;
  let token;
  let busy = false;
  for (const [index, name] of rarities.entries()) {
    rarity.add(new Option(name, index));
  }
  function selectedCount() {
    const held = profile?.inventory.find(
      ([k, r]) => k === Number(kind.value) && r === Number(rarity.value),
    );
    count.value = held?.[2] ?? '0';
  }
  function close() {
    dialog.close();
    sessionStorage.removeItem(reopenKey);
  }
  async function load() {
    save.disabled = true;
    progressSave.disabled = true;
    status.textContent = '正在读取当前访客存档…';
    token = localStorage.getItem('cp6_player_id');
    if (!token) {
      status.textContent = '请等待游戏完成访客登录后重试。';
      return;
    }
    try {
      const response = await fetch('/wave/dev/inventory/' + token, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('读取失败，请关闭面板后重试。');
      }
      profile = await response.json();
      xp.value = profile.xp;
      xp.setCustomValidity('');
      level.max = profile.maximumLevel;
      level.value = profile.level;
      for (const [index, name] of ['garden', 'desert', 'ocean'].entries()) {
        progressForm.elements.namedItem(name).value = profile.highestWaves[index];
      }
      const selected = kind.value;
      kind.replaceChildren();
      for (const petal of profile.petals) {
        kind.add(new Option(petal.name + (petal.supported ? '' : '（仅库存）'), petal.kind));
      }
      if (selected) {
        kind.value = selected;
      }
      selectedCount();
      rows.replaceChildren();
      for (const [k, r, owned] of profile.inventory) {
        const row = rows.insertRow();
        row.insertCell().textContent = profile.petals.find((p) => p.kind === k).name;
        row.insertCell().textContent = rarities[r];
        const equipped = profile.slots.filter((s) => s && s[0] === k && s[1] === r).length;
        row.insertCell().textContent = `${owned} / ${equipped}`;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = '编辑';
        edit.setAttribute(
          'aria-label',
          `编辑 ${rarities[r]} ${profile.petals.find((p) => p.kind === k).name}`,
        );
        edit.addEventListener('click', () => {
          kind.value = k;
          rarity.value = r;
          selectedCount();
          count.focus();
          count.select();
        });
        row.insertCell().append(edit);
      }
      status.textContent = profile.inventory.length
        ? '选择花瓣修改数量，或编辑下方已有条目。'
        : '库存为空，可选择任意花瓣添加。';
      save.disabled = false;
      progressSave.disabled = false;
    } catch (error) {
      status.textContent = error.message;
    }
  }
  async function open() {
    if (!dialog.open) {
      dialog.showModal();
    }
    sessionStorage.setItem(reopenKey, '1');
    await load();
  }
  button.addEventListener('click', open);
  dialog.querySelector('[data-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', () => sessionStorage.removeItem(reopenKey));
  // Registered before the original client, whose global shortcuts otherwise
  // consume editing keys and prevent text selection even inside DOM inputs.
  for (const type of ['keydown', 'keyup', 'keypress', 'selectstart']) {
    window.addEventListener(
      type,
      (event) => {
        if (!dialog.open) {
          return;
        }
        event.stopImmediatePropagation();
        if (type === 'keydown' && event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      },
      true,
    );
  }
  for (const type of ['mousedown', 'mouseup', 'mousemove', 'click', 'wheel']) {
    dialog.addEventListener(type, (event) => event.stopPropagation());
  }
  kind.addEventListener('change', selectedCount);
  rarity.addEventListener('change', selectedCount);
  dialog.querySelector('[data-zero]').addEventListener('click', () => {
    count.value = '0';
  });
  xp.addEventListener('input', () => {
    xp.setCustomValidity('');
    if (!profile || !/^[0-9]+$/.test(xp.value)) {
      return;
    }
    const total = BigInt(xp.value);
    if (total > 9223372036854775807n) {
      xp.setCustomValidity('总 XP 不能超过 9223372036854775807。');
      return;
    }
    level.value = Math.min(
      profile.maximumLevel,
      profile.xpThresholds.filter((threshold) => BigInt(threshold) <= total).length,
    );
  });
  level.addEventListener('input', () => {
    if (profile && level.validity.valid) {
      xp.value = profile.xpThresholds[Number(level.value) - 1];
      xp.setCustomValidity('');
    }
  });
  async function submit(event, editingForm, path, mutation) {
    event.preventDefault();
    if (busy || !profile || !editingForm.reportValidity()) {
      return;
    }
    busy = true;
    save.disabled = true;
    progressSave.disabled = true;
    status.textContent = '正在保存…';
    try {
      // Original startup may submit its cached equipment after the panel opens.
      // Resolve the current version on save; the write still uses atomic CAS.
      const latest = await fetch(path + token, { cache: 'no-store' });
      if (!latest.ok) {
        throw new Error('无法读取当前存档，请重试。');
      }
      const { version } = await latest.json();
      const response = await fetch(path + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          ...mutation,
          version,
          key: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        await load();
        throw new Error(
          response.status === 409
            ? '存档已变化，已重新读取。请确认修改后再次保存。'
            : '保存失败，未确认修改。请重试。',
        );
      }
      location.reload();
    } catch (error) {
      status.textContent = error.message;
      save.disabled = false;
      progressSave.disabled = false;
      busy = false;
    }
  }
  form.addEventListener('submit', (event) => {
    void submit(event, form, '/wave/dev/inventory/', {
      kind: kind.value,
      rarity: rarity.value,
      count: count.value,
    });
  });
  progressForm.addEventListener('submit', (event) => {
    void submit(event, progressForm, '/wave/dev/progress/', {
      xp: xp.value,
      ...Object.fromEntries(
        ['level', 'garden', 'desert', 'ocean'].map((name) => [
          name,
          String(Number(progressForm.elements.namedItem(name).value)),
        ]),
      ),
    });
  });
  if (sessionStorage.getItem(reopenKey)) {
    void open();
  }
})();
