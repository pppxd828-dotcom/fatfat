// 運動紀錄需要網路；進行中的狀態由伺服器保存。
const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2) +
      '-' +
      Math.random().toString(36).slice(2);
let W = {
  names: [],
  name: localStorage.wName || '',
  course: null,
  session: null,
  rest: 0,
  loading: 0,
};
async function loadW() {
  const generation = ++W.loading;
  try {
    const names = (await api('wCourses', {})).names;
    if (generation !== W.loading) return;
    W.names = names;
    if (!names.includes(W.name))
      W.name = names.find((n) => n.startsWith('C_推日')) || names[0] || '';
    const x = W.name ? await api('wOpen', { name: W.name }) : null;
    if (generation !== W.loading) return;
    W.course = x && x.course;
    W.session = x && x.session;
    renderW();
  } catch (e) {
    if (generation !== W.loading) return;
    if (e.message === 'auth') return gate();
    $('#wbody').textContent = '讀取運動資料失敗：' + e.message;
  }
}
function renderW() {
  $('#wnames').innerHTML =
    '<select id="wpick" aria-label="選擇課表">' +
    W.names
      .map(
        (n) =>
          `<option value="${esc(n)}" ${n === W.name ? 'selected' : ''}>${esc(n.startsWith('C_') ? n.slice(2) : n)}</option>`,
      )
      .join('') +
    '</select>';
  const x = W.session,
    c = x ? x.course : W.course;
  if (!c) {
    $('#wbody').textContent = '無法載入課表';
    return;
  }
  if (!x) {
    $('#wbody').innerHTML =
      `<button class="pri" data-wa="start">開始訓練</button><p>課表僅供讀取，不會清空原表紀錄。</p>`;
    return;
  }
  let content = `<p>訓練日期：${esc(x.date)}（台灣時間）</p>`;
  if (c.warnings && c.warnings.length)
    content += '<p class="warn">部分動作強度以「中」暫估，請檢查動作庫。</p>';
  for (const a of c.actions) {
    content += `<div class="row" style="display:block"><b>${esc(a.name)}</b><small>${esc(a.muscle)}・估算強度 ${esc(a.intensity)}</small>`;
    for (const n of a.setNumbers) {
      const s = x.sets.find((z) => z.action === a.name && z.number === n);
      const key = encodeURIComponent(a.name) + '|' + n;
      if (s)
        content += `<div>第 ${n} 組 ✓ ${esc(s.weight)} kg × ${esc(s.reps)} <button data-wa="undo" data-key="${esc(key)}">取消</button></div>`;
      else
        content += `<div style="display:flex;gap:6px;align-items:center"><span>第${n}組</span><input type="number" step="0.5" min="0" max="1000" placeholder="kg" data-w="${esc(key)}" style="width:80px"><input type="number" min="1" max="200" placeholder="次" data-r="${esc(key)}" style="width:70px"><button data-wa="set" data-key="${esc(key)}">完成</button></div>`;
    }
    content += '</div>';
  }
  content +=
    '<h3>有氧紀錄</h3>' +
    x.cardio
      .map(
        (c) =>
          `<div class="row">${esc(c.type === '其他' ? c.name : c.type)}：${esc(c.minutes)} 分鐘${c.type === '走路散步' && Number.isInteger(c.steps) ? '・' + esc(c.steps) + ' 步' : ''}</div>`,
      )
      .join('') +
    `<button data-wa="cardio">新增有氧</button><button class="pri" data-wa="finish" style="width:100%;margin-top:12px">結束訓練</button><p><small>結束後才計入飲食；熱量為粗估，可能與 TDEE 活動係數重疊。</small></p>`;
  $('#wbody').innerHTML = content;
}
function cardioDialog() {
  dlg(
    `<h3>新增有氧（每段分開記錄）</h3><label>項目<select id="ct"><option>坡度快走</option><option>走路散步</option><option>橢圓機</option><option>健身車</option><option>階梯機</option><option>其他</option></select></label><label>時間（分鐘）<input id="cm" type="number" min="0.01" max="1440" step="0.1"></label><label id="walksteps">步數<input id="csteps" type="number" inputmode="numeric" min="1" max="1000000" step="1" placeholder="這次散步的步數"></label><p id="cadence-note" style="font-size:0.85em;color:var(--muted)">輸入時間和步數後，會提供粗略步調建議。</p><label id="walkspeed">坡度快走速度（km/h）<input id="cs" type="number" step="0.1"></label><label id="walkgrade">坡度快走坡度（%）<input id="cg" type="number" step="0.1"></label><label id="powerfield">功率（瓦，選填）<input id="cw" type="number"></label><label id="intensityfield"><span id="ci-title">自覺強度</span><select id="ci"><option value="">請選擇</option><option value="輕">輕</option><option value="中">中</option><option value="高">高</option></select></label><label id="otherfield">其他項目名稱<input id="cn"></label><button class="pri" id="csave">儲存有氧</button>`,
  );
  let lastCardioType = '';
  let manualWalkPace = false;
  function refreshCardioFields() {
    const t = $('#ct').value;
    if (lastCardioType && lastCardioType !== t) {
      $('#ci').value = '';
      manualWalkPace = false;
    }
    lastCardioType = t;
    $('#ci-title').textContent = t === '走路散步' ? '步速' : '自覺強度';
    const labels =
      t === '走路散步'
        ? [
            '請選擇步速',
            '慢走（約 3.2–3.9 km/h）',
            '一般（約 4.5–5.5 km/h）',
            '快走（約 5.6–6.3 km/h）',
          ]
        : ['請選擇', '輕', '中', '高'];
    Array.from($('#ci').options).forEach((o, i) => (o.textContent = labels[i]));
    $('#walksteps').hidden = t !== '走路散步';
    $('#cadence-note').hidden = t !== '走路散步';
    $('#walkspeed').hidden = t !== '坡度快走';
    $('#walkgrade').hidden = t !== '坡度快走';
    $('#powerfield').hidden = !['健身車', '橢圓機', '階梯機'].includes(t);
    $('#intensityfield').hidden = t === '坡度快走';
    $('#otherfield').hidden = t !== '其他';
  }
  function recommendWalkPace() {
    if ($('#ct').value !== '走路散步') return;
    const minutes = Number($('#cm').value),
      steps = Number($('#csteps').value);
    const note = $('#cadence-note');
    if (!(
      minutes > 0 &&
      minutes <= 1440 &&
      Number.isInteger(steps) &&
      steps >= 1 &&
      steps <= 1000000
    )) {
      note.textContent = '輸入時間和步數後，會提供粗略步調建議。';
      if (!manualWalkPace) $('#ci').value = '';
      return;
    }
    const cadence = steps / minutes;
    // 步頻僅為初步參考，不能直接換算速度；120 為介面上的粗略分界。
    const suggestion = cadence < 100 ? '輕' : cadence < 120 ? '中' : '高';
    const label = { 輕: '慢走', 中: '一般', 高: '快走' }[suggestion];
    if (!manualWalkPace) $('#ci').value = suggestion;
    note.textContent = `平均約 ${Math.round(cadence)} 步／分鐘；粗略建議：${label}。步幅和地形會影響結果，請自行調整。${manualWalkPace ? '（保留你選的步速）' : ''}`;
  }
  $('#ct').onchange = () => {
    refreshCardioFields();
    recommendWalkPace();
  };
  $('#cm').oninput = recommendWalkPace;
  $('#csteps').oninput = recommendWalkPace;
  $('#ci').onchange = () => {
    if ($('#ct').value === '走路散步') {
      manualWalkPace = $('#ci').value !== '';
      recommendWalkPace();
    }
  };
  refreshCardioFields();
  $('#csave').onclick = async () => {
    const t = $('#ct').value;
    let c = { id: uid(), type: t, minutes: Number($('#cm').value) };
    if (t === '坡度快走') {
      c.speed = Number($('#cs').value);
      c.incline = $('#cg').value === '' ? null : Number($('#cg').value);
    } else {
      if (['健身車', '橢圓機', '階梯機'].includes(t) && $('#cw').value !== '')
        c.watts = Number($('#cw').value);
      if ($('#ci').value) c.intensity = $('#ci').value;
      if (t === '其他') c.name = $('#cn').value.trim();
    }
    if (!Number.isFinite(c.minutes) || c.minutes <= 0 || c.minutes > 1440)
      return alert('請輸入有效時間');
    if (t === '走路散步') {
      c.steps = Number($('#csteps').value);
      if (!Number.isInteger(c.steps) || c.steps < 1 || c.steps > 1000000)
        return alert('請輸入這次散步的步數（1–1,000,000 的整數）');
    }
    if (
      t === '坡度快走' &&
      (!Number.isFinite(c.speed) ||
        c.speed < 0.1 ||
        c.speed > 30 ||
        c.incline === null ||
        !Number.isFinite(c.incline) ||
        c.incline < 0 ||
        c.incline > 40)
    )
      return alert('請輸入速度 0.1–30 km/h 與坡度 0–40%');
    if (t !== '坡度快走') {
      if (c.watts !== undefined && (!Number.isFinite(c.watts) || c.watts < 1 || c.watts > 1000))
        return alert('功率需介於 1–1000 瓦');
      if (!(t === '健身車' && c.watts !== undefined) && !c.intensity)
        return alert(t === '走路散步' ? '請選擇步速' : '請選擇自覺強度');
      if (t === '其他' && !c.name) return alert('請輸入其他有氧的項目名稱');
    }
    let old = localStorage.flPendingCardio;
    if (old) {
      const p = JSON.parse(old);
      if (p.sessionId !== W.session.id) return alert('另一筆有氧尚待確認，請先切回原訓練');
      c = p.cardio;
    } else localStorage.flPendingCardio = JSON.stringify({ sessionId: W.session.id, cardio: c });
    $('#csave').disabled = true;
    try {
      const r = await api('wCardio', { id: W.session.id, cardio: c });
      localStorage.removeItem('flPendingCardio');
      W.session = r.session;
      $('#dlg').close();
      renderW();
    } catch (e) {
      if (e.remote) {
        localStorage.removeItem('flPendingCardio');
        alert('有氧資料未儲存：' + e.message);
      } else alert('無法確認是否已儲存，請再次按儲存以重試同一筆。' + e.message);
      $('#csave').disabled = false;
    }
  };
}
async function wAct(t) {
  const action = t.dataset.wa,
    selectedName = W.name;
  t.disabled = true;
  try {
    if (action === 'start') {
      let key = 'flStartId:' + W.name,
        id = localStorage.getItem(key) || uid();
      localStorage.setItem(key, id);
      const r = await api('wStart', { id, name: W.name });
      localStorage.removeItem(key);
      W.session = r.session;
    }
    if (action === 'set' || action === 'undo') {
      const parts = t.dataset.key.split('|'),
        name = decodeURIComponent(parts[0]),
        number = Number(parts[1]);
      if (action === 'set') {
        const wi = document.querySelector('[data-w="' + CSS.escape(t.dataset.key) + '"]'),
          ri = document.querySelector('[data-r="' + CSS.escape(t.dataset.key) + '"]');
        if (wi.value === '' || ri.value === '') throw Error('請輸入重量和次數');
        const r = await api('wSet', {
          id: W.session.id,
          action: name,
          number,
          weight: Number(wi.value),
          reps: Number(ri.value),
        });
        W.session = r.session;
        const count = W.session.course.actions.reduce((n, a) => n + a.setNumbers.length, 0);
        W.rest = W.session.sets.length < count ? Date.now() + 90000 : 0;
      } else {
        const r = await api('wUndo', { id: W.session.id, action: name, number });
        W.session = r.session;
      }
    }
    if (action === 'cardio') {
      cardioDialog();
      t.disabled = false;
      return;
    }
    if (action === 'finish') {
      if (localStorage.flPendingCardio) throw Error('有氧紀錄尚未確認，請先重試儲存');
      await api('wFinish', { id: W.session.id });
      W.session = null;
      await load();
      alert('訓練已結束；已記錄至輕量運動紀錄。');
      await loadW();
      return;
    }
    if (W.name !== selectedName) {
      await loadW();
      return;
    }
    renderW();
  } catch (e) {
    alert(e.message);
    t.disabled = false;
  }
}
setInterval(() => {
  const s = Math.ceil((W.rest - Date.now()) / 1000);
  $('#wrest').textContent = s > 0 ? '休息 ' + s + ' 秒' : '';
}, 500);
document.addEventListener('change', (e) => {
  if (e.target.id === 'wpick') {
    W.name = e.target.value;
    localStorage.wName = W.name;
    loadW();
  }
});
