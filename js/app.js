// 一纸成文 · v2 主控制器
window.App = (function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const state = {
    step: 1,
    wz: null,
    form: {},
    body: '',
    docId: null, // 当前文稿 id（存文稿库后存在）
    opts: { redHeader: true, pageNum: true, banji: true, titleFont: '方正小标宋简体', cc: '', attachment: '', jimi: '', jjcd: '', fenNo: '' },
    zoom: null, // null = 自适应
    aiCtrl: null,
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' is-err' : '');
    t.textContent = msg;
    $('#toastWrap').appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  // ================= 步骤流转 =================
  function renderSteps() {
    $$('#steps .step').forEach(el => {
      const n = +el.dataset.step;
      el.classList.toggle('is-active', n === state.step);
      el.classList.toggle('is-done', n < state.step);
      el.querySelector('.step-no').textContent = n < state.step ? '' : n;
      if (n < state.step) el.querySelector('.step-no').innerHTML = '<i class="ph ph-check" style="font-size:11px"></i>';
    });
  }

  function goto(step) {
    if (step >= 2 && !state.wz) return;
    if (step === 3) {
      if (!$('#bodyText').value.trim()) { toast('请先生成或填写正文', true); return; }
      state.body = $('#bodyText').value;
      persist();
    }
    state.step = step;
    [1, 2, 3].forEach(n => $('#step' + n).classList.toggle('hidden', n !== step));
    renderSteps();
    if (step === 3) { renderOptions(); renderPreview(); }
    if (step === 1) renderGrid();
    window.scrollTo({ top: 0 });
  }

  function persist() {
    localStorage.setItem('yizhi.draft', JSON.stringify({
      wzId: state.wz?.id || null, form: state.form, body: state.body, opts: state.opts, docId: state.docId,
    }));
  }

  // ================= 步骤 1 =================
  function renderGrid() {
    const q = ($('#wzSearch').value || '').trim().toLowerCase();
    const list = window.WENZHONG.filter(w => !q || w.name.toLowerCase().includes(q) || w.desc.includes(q) || w.cat.includes(q));
    if (!list.length) {
      $('#wzGrid').innerHTML = '<div class="empty-search"><i class="ph ph-file-magnifying-glass" style="font-size:30px"></i><br>没有找到相关文种，换个关键词试试</div>';
      return;
    }
    const cats = [...new Set(list.map(w => w.cat))];
    $('#wzGrid').innerHTML = cats.map(cat => `
      <div class="cat-title">${cat}</div>
      <div class="wz-grid">
        ${list.filter(w => w.cat === cat).map(w => `
          <button class="wz-card" data-id="${w.id}">
            <span class="tags">
              ${w.free ? '<span class="tag tag-free">免费</span>' : '<span class="tag tag-pro">专业</span>'}
              ${w.direction === '上行' ? '<span class="tag tag-up">上行</span>' : ''}
            </span>
            <div class="name">${w.name}</div>
            <div class="desc">${esc(w.desc)}</div>
          </button>`).join('')}
      </div>`).join('');
    $$('#wzGrid .wz-card').forEach(el => el.addEventListener('click', () => select(el.dataset.id)));
  }

  function select(id) {
    const wz = window.WENZHONG.find(w => w.id === id);
    if (!wz) return;
    if (!window.License.canUse(wz)) { openLicense(); toast(`「${wz.name}」属于专业版文种，激活后即可使用`, true); return; }
    if (!state.wz || state.wz.id !== id) {
      state.wz = wz; state.form = {}; state.body = ''; state.docId = null;
      state.opts.redHeader = wz.cat === '法定公文';
      $('#bodyText').value = '';
    } else {
      state.wz = wz;
    }
    $('#wzTitle').textContent = wz.name + (wz.direction !== '—' ? `（${wz.cat} · ${wz.direction}文）` : `（${wz.cat}）`);
    $('#wzDesc').textContent = wz.desc;
    renderForm();
    renderPresetChips();
    goto(2);
  }

  // ================= 步骤 2 =================
  function renderForm() {
    $('#formFields').innerHTML = state.wz.fields.map(f => `
      <div class="field ${f.type === 'textarea' || f.key === 'title' ? 'field-full' : ''}">
        <label for="f_${f.key}">${esc(f.label)}${f.required ? ' <span style="color:var(--accent)">*</span>' : ''}</label>
        ${f.type === 'textarea'
          ? `<textarea id="f_${f.key}" rows="4" placeholder="${esc(f.ph || '')}">${esc(state.form[f.key] || '')}</textarea>`
          : `<input id="f_${f.key}" placeholder="${esc(f.ph || '')}" value="${esc(state.form[f.key] || '')}" autocomplete="off">`}
      </div>`).join('');
    state.wz.fields.forEach(f => {
      const el = $('#f_' + f.key);
      el.addEventListener('input', () => { state.form[f.key] = el.value; persist(); });
    });
  }

  function renderPresetChips() {
    const presets = window.Store.getPresets();
    const row = $('#presetChips');
    if (!presets.length) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    $('#presetChipsList').innerHTML = presets.map(p =>
      `<button class="chip" data-id="${p.id}">${esc(p.name)}</button>`).join('');
    $$('#presetChipsList .chip').forEach(el => el.addEventListener('click', () => {
      const p = window.Store.getPresets().find(x => x.id === el.dataset.id);
      if (!p) return;
      window.Store.applyPreset(p, state.form, state.opts);
      renderForm();
      toast(`已套用预设「${p.name}」`);
    }));
  }

  function collectForm() {
    state.wz.fields.forEach(f => { state.form[f.key] = $('#f_' + f.key)?.value ?? state.form[f.key] ?? ''; });
  }

  // ---- AI 流式拟稿 ----
  async function aiDraft() {
    collectForm();
    const cfg = window.AI.getConfig();
    if (!cfg.key) { openSettings(); toast('请先在「API 设置」中配置你的 API Key', true); return; }
    const btn = $('#aiBtn'), status = $('#aiStatus');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> 正在拟稿…';
    status.className = 'ai-status';
    status.textContent = '已连接 ' + cfg.model + '，正在生成…';
    $('#aiStopBtn').classList.remove('hidden');
    state.aiCtrl = new AbortController();
    const ta = $('#bodyText');
    ta.value = '';
    let lastLen = 0;
    try {
      for await (const partial of window.AI.draftStream({ wz: state.wz, form: state.form, signal: state.aiCtrl.signal })) {
        ta.value = partial;
        if (ta.value.length - lastLen > 60) { ta.scrollTop = ta.scrollHeight; lastLen = ta.value.length; }
        status.textContent = `正在生成…已输出 ${partial.length} 字`;
      }
      state.body = ta.value;
      updateCount();
      persist();
      status.className = 'ai-status is-ok';
      status.textContent = '拟稿完成，已按文种规范生成。请人工核实【　】占位与事实表述。';
    } catch (e) {
      if (e.name === 'AbortError') {
        status.textContent = '已停止。';
      } else {
        status.className = 'ai-status is-err';
        status.textContent = e.message;
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-sparkle"></i> AI 拟稿';
      $('#aiStopBtn').classList.add('hidden');
      state.aiCtrl = null;
      updateCount();
    }
  }

  function stopAI() { state.aiCtrl?.abort(); }

  function useFramework() {
    collectForm();
    const lines = state.wz.framework.map(line => line.replace(/\{(\w+)\}/g, (_, k) => state.form[k] || `{${k}}`));
    $('#bodyText').value = lines.map(l => l.replace(/^(h1|h2|h3|p|center)\|/, '')).join('\n');
    state.body = $('#bodyText').value;
    updateCount(); persist();
    toast('框架已填入，把 { } 与【　】替换为实际内容即可');
  }

  function useSample() {
    collectForm();
    const s = window.SAMPLES[state.wz.id] || { form: window.SAMPLES._generic.form, body: null };
    Object.entries(s.form || {}).forEach(([k, v]) => { if (!state.form[k]) state.form[k] = v; });
    if (s.body) {
      $('#bodyText').value = s.body;
      state.body = s.body;
    } else {
      useFramework();
      return;
    }
    renderForm();
    updateCount(); persist();
    toast('示例已填入，点「生成文书」看排版效果');
  }

  function updateCount() {
    const v = $('#bodyText').value;
    const cjk = (v.match(/[\u4e00-\u9fff]/g) || []).length;
    $('#bodyCount').textContent = v ? `${cjk} 字 / ${v.length} 字符` : '';
  }

  function saveToLibrary(silent) {
    collectForm();
    const title = state.form.title || state.wz.name + '（未命名）';
    const doc = window.Store.saveDoc({
      id: state.docId, wzId: state.wz.id, title,
      form: state.form, body: $('#bodyText').value, opts: state.opts, ts: Date.now(),
    });
    state.docId = doc.id;
    persist();
    if (!silent) toast('已存入文稿库');
  }

  // ================= 步骤 3 =================
  const OPT_DEFS = [
    { key: 'redHeader', label: '红头版式', type: 'bool' },
    { key: 'pageNum', label: '页码（单右双左）', type: 'bool' },
    { key: 'banji', label: '版记', type: 'bool' },
    { key: 'titleFont', label: '标题字体', type: 'select', options: ['方正小标宋简体', '华文中宋', '宋体'] },
    { key: 'fenNo', label: '份号', type: 'text', ph: '如：000015' },
    { key: 'jimi', label: '密级', type: 'select', options: ['', '秘密', '机密', '绝密'] },
    { key: 'jjcd', label: '紧急程度', type: 'select', options: ['', '特急', '加急'] },
    { key: 'cc', label: '抄送', type: 'text', ph: '如：市委办公室、市人大常委会办公室' },
    { key: 'attachment', label: '附件说明', type: 'text', ph: '每行一个附件名' },
  ];

  function renderOptions() {
    $('#options').innerHTML = OPT_DEFS.map(o => {
      const v = state.opts[o.key];
      if (o.type === 'bool') {
        return `<div class="opt"><span>${o.label}</span><div class="switch ${v ? 'on' : ''}" data-opt="${o.key}" role="switch" aria-checked="${!!v}" tabindex="0"></div></div>`;
      }
      if (o.type === 'select') {
        return `<div class="opt"><span>${o.label}</span><select data-opt="${o.key}">${o.options.map(x => `<option value="${esc(x)}" ${x === v ? 'selected' : ''}>${x || '无'}</option>`).join('')}</select></div>`;
      }
      return `<div class="opt" style="flex-direction:column;align-items:stretch"><span>${o.label}</span><input type="text" data-opt="${o.key}" value="${esc(v || '')}" placeholder="${esc(o.ph || '')}"></div>`;
    }).join('') + `<p class="engine-note">排版引擎按 GB/T 9704-2012 输出：页边距 37/35/28/26mm、二号小标宋标题、三号仿宋正文、固定行距、上行文签发人版式、单双页码外侧、版记三线。</p>`;
    $$('#options [data-opt]').forEach(el => {
      const key = el.dataset.opt;
      if (el.classList.contains('switch')) {
        const toggle = () => { state.opts[key] = !state.opts[key]; el.classList.toggle('on', state.opts[key]); renderPreview(); persist(); };
        el.addEventListener('click', toggle);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      } else {
        el.addEventListener('change', () => { state.opts[key] = el.value; renderPreview(); persist(); });
      }
    });
  }

  function buildConfig() {
    return {
      wz: state.wz,
      form: state.form,
      blocks: window.Parser.parseText($('#bodyText').value),
      opts: state.opts,
    };
  }

  function renderPreview() {
    const cfg = buildConfig();
    $('#preview').innerHTML = window.FormatEngine.previewHtml(cfg);
    const pages = $$('#preview .yz-paper').length;
    $('#pageBadge').innerHTML = `<i class="ph ph-files"></i> ${pages} 页（近似）`;
    $('#previewMeta').textContent = `${state.wz.name} · 约 ${pages} 页 · ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    applyZoom();
    renderChecks(cfg);
    renderGate();
  }

  function renderChecks(cfg) {
    const issues = window.Checker.run(cfg);
    const box = $('#checkList');
    if (!issues.length) {
      box.innerHTML = '<div class="check-item check-ok"><i class="ph ph-check-circle"></i><span>未发现常见格式与文风问题</span></div>';
      return;
    }
    box.innerHTML = issues.map(i => `
      <div class="check-item check-${i.level}">
        <i class="ph ${i.level === 'error' ? 'ph-x-circle' : i.level === 'warn' ? 'ph-warning-circle' : 'ph-info'}"></i>
        <span>${esc(i.msg)}${i.quote ? `<span class="q">${esc(i.quote)}</span>` : ''}</span>
      </div>`).join('');
  }

  function renderGate() {
    const gated = !window.License.canUse(state.wz);
    $('#dlBtn').disabled = gated;
    const gate = $('#dlGate');
    gate.classList.toggle('hidden', !gated);
    if (gated) gate.innerHTML = `<i class="ph ph-lock-key"></i> 专业版文种 <button class="btn btn-primary" style="padding:4px 12px;font-size:12px" id="gateBtn">去激活</button>`;
    if (gated) $('#gateBtn').addEventListener('click', openLicense);
  }

  async function download() {
    if (!window.License.canUse(state.wz)) { openLicense(); return; }
    const btn = $('#dlBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> 正在生成…';
    try {
      const cfg = buildConfig();
      const blob = await window.FormatEngine.buildDocxBlob(cfg);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (state.form.title || state.wz.name).replace(/[\\/:*?"<>|\n]/g, '_').slice(0, 60) + '.docx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      saveToLibrary(true);
      toast('已生成 .docx 并存入文稿库。建议用 WPS / Word 打开核对');
    } catch (e) {
      toast('生成失败：' + e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-download-simple"></i> 下载 .docx';
    }
  }

  // ---- 缩放 ----
  function applyZoom() {
    const inner = $('#preview');
    const wrap = $('#previewScroll');
    const paperW = 794;
    if (state.zoom) {
      inner.style.zoom = state.zoom;
      inner.style.width = paperW + 'px';
    } else {
      const w = wrap.clientWidth - 44;
      inner.style.zoom = Math.min(1, w / paperW);
      inner.style.width = paperW + 'px';
    }
  }

  // ================= 弹窗 =================
  function closeModals() { $$('.modal-mask').forEach(m => m.classList.add('hidden')); }

  function openSettings() {
    const cfg = window.AI.getConfig();
    $('#cfgBase').value = cfg.baseUrl;
    $('#cfgModel').value = cfg.model;
    $('#cfgKey').value = cfg.key;
    $('#aiPresets').innerHTML = window.AI.PRESETS.map((p, i) =>
      `<button class="chip" data-i="${i}">${p.name}</button>`).join('');
    $$('#aiPresets .chip').forEach(el => el.addEventListener('click', () => {
      const p = window.AI.PRESETS[+el.dataset.i];
      $('#cfgBase').value = p.base; $('#cfgModel').value = p.model;
      $$('#aiPresets .chip').forEach(c => c.classList.remove('is-active'));
      el.classList.add('is-active');
    }));
    $('#connResult').classList.add('hidden');
    $('#settingsMask').classList.remove('hidden');
  }

  async function testConn() {
    window.AI.saveConfig({ baseUrl: $('#cfgBase').value.trim(), model: $('#cfgModel').value.trim(), key: $('#cfgKey').value.trim() });
    const box = $('#connResult');
    box.classList.remove('hidden', 'conn-ok', 'conn-fail');
    box.textContent = '正在测试…';
    const r = await window.AI.testConnection();
    box.classList.add(r.ok ? 'conn-ok' : 'conn-fail');
    box.textContent = (r.ok ? '✓ ' : '✗ ') + r.message;
  }

  function saveSettings() {
    window.AI.saveConfig({ baseUrl: $('#cfgBase').value.trim(), model: $('#cfgModel').value.trim(), key: $('#cfgKey').value.trim() });
    closeModals();
    toast('已保存，Key 仅存于本机浏览器');
  }

  function openLicense() {
    const lic = window.License.get();
    $('#licenseState').innerHTML = lic
      ? `<div class="conn-result conn-ok" style="margin-bottom:10px">已激活专业版<br>授权给：<strong>${esc(lic.payload.name || '用户')}</strong>　${lic.payload.exp ? '有效期至 ' + esc(lic.payload.exp) : '永久有效'}</div>`
      : `<div class="conn-result" style="background:var(--bg);color:var(--ink-2);margin-bottom:10px">当前为免费版：通知、请示、报告、函、会议纪要 5 种文种可用</div>`;
    $('#licenseInput').value = lic?.code || '';
    $('#deBtn').classList.toggle('hidden', !lic);
    $('#licenseMask').classList.remove('hidden');
  }

  function doActivate() {
    const r = window.License.activate($('#licenseInput').value);
    if (r.ok) {
      toast('激活成功，全部文种已解锁');
      refreshBadge();
      closeModals();
      if (state.step === 1) renderGrid();
    } else toast('激活失败：' + r.reason, true);
  }

  function refreshBadge() { $('#proBadge').classList.toggle('hidden', !window.License.isPro()); }

  // ---- 单位预设管理 ----
  let editingPresetId = null;
  function openPresets() {
    editingPresetId = null;
    clearPresetEditor();
    renderPresetList();
    $('#presetsMask').classList.remove('hidden');
  }
  function clearPresetEditor() {
    ['pName', 'pOrg', 'pDocno', 'pCc'].forEach(id => $('#' + id).value = '');
    $('#pFont').value = '方正小标宋简体';
    $('#pRed').checked = true; $('#pBanji').checked = true;
    $('#presetDeleteBtn').classList.add('hidden');
  }
  function renderPresetList() {
    const list = window.Store.getPresets();
    $('#presetList').innerHTML = list.length
      ? list.map(p => `
        <div class="preset-item" data-id="${p.id}">
          <div><div class="pi-name">${esc(p.name)}</div><div class="pi-org">${esc(p.org || '')}</div></div>
          <span class="spacer"></span>
          <button class="pi-use">套用</button>
          <button class="pi-del" title="删除"><i class="ph ph-trash"></i></button>
        </div>`).join('')
      : '<div class="preset-empty"><i class="ph ph-buildings"></i>还没有保存的单位预设<br>在上面填写后点「保存预设」</div>';
    $$('#presetList .preset-item').forEach(el => {
      const id = el.dataset.id;
      el.addEventListener('click', (e) => {
        const p = window.Store.getPresets().find(x => x.id === id);
        if (e.target.closest('.pi-del')) { window.Store.deletePreset(id); renderPresetList(); return; }
        if (e.target.closest('.pi-use')) {
          if (state.wz) {
            window.Store.applyPreset(p, state.form, state.opts);
            renderForm(); renderPresetChips();
            closeModals();
            toast(`已套用预设「${p.name}」`);
          } else toast('请先选择文种再套用预设', true);
          return;
        }
        // 点击行 = 载入编辑
        $('#pName').value = p.name; $('#pOrg').value = p.org || '';
        $('#pDocno').value = p.docnoPrefix || ''; $('#pCc').value = p.cc || '';
        $('#pFont').value = p.titleFont || '方正小标宋简体';
        $('#pRed').checked = p.redHeader !== false;
        $('#pBanji').checked = p.banji !== false;
        editingPresetId = id;
        $('#presetDeleteBtn').classList.remove('hidden');
      });
    });
  }
  function savePreset() {
    const name = $('#pName').value.trim();
    if (!name) { toast('请填写预设名称', true); return; }
    window.Store.savePreset({
      id: editingPresetId, name,
      org: $('#pOrg').value.trim(), docnoPrefix: $('#pDocno').value.trim(),
      cc: $('#pCc').value.trim(), titleFont: $('#pFont').value,
      redHeader: $('#pRed').checked, banji: $('#pBanji').checked,
    });
    editingPresetId = null;
    clearPresetEditor();
    renderPresetList();
    renderPresetChips();
    toast('预设已保存');
  }

  // ---- 文稿库 ----
  function openDocs() {
    renderDocs();
    $('#docsMask').classList.remove('hidden');
  }
  function renderDocs() {
    const docs = window.Store.getDocs();
    $('#docsList').innerHTML = docs.length
      ? docs.map(d => `
        <div class="doc-item" data-id="${d.id}">
          <i class="ph ph-file-text" style="font-size:20px;color:var(--ink-3)"></i>
          <div><div class="di-title">${esc(d.title)}</div>
          <div class="di-meta">${esc((window.WENZHONG.find(w => w.id === d.wzId)?.name) || d.wzId)} · ${new Date(d.ts).toLocaleString('zh-CN', { hour12: false })}</div></div>
          <span class="spacer"></span>
          <button class="di-del" title="删除"><i class="ph ph-trash"></i></button>
        </div>`).join('')
      : '<div class="preset-empty"><i class="ph ph-book-open-text"></i>文稿库还是空的<br>写作后点「存入文稿库」，下载时也会自动保存</div>';
    $$('#docsList .doc-item').forEach(el => {
      const id = el.dataset.id;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.di-del')) { window.Store.deleteDoc(id); renderDocs(); return; }
        const d = window.Store.getDoc(id);
        if (!d) return;
        const wz = window.WENZHONG.find(w => w.id === d.wzId);
        if (!wz) { toast('该文稿的文种不可用', true); return; }
        state.wz = wz; state.form = d.form || {}; state.body = d.body || '';
        state.opts = { ...state.opts, ...(d.opts || {}) };
        state.docId = d.id;
        $('#wzTitle').textContent = wz.name + `（${wz.cat}）`;
        $('#wzDesc').textContent = wz.desc;
        renderForm(); renderPresetChips();
        $('#bodyText').value = state.body;
        updateCount();
        closeModals();
        goto(2);
      });
    });
  }

  // ================= 恢复草稿 =================
  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem('yizhi.draft') || '{}');
      if (d.opts) state.opts = { ...state.opts, ...d.opts };
      if (d.docId) state.docId = d.docId;
      if (d.wzId) {
        const wz = window.WENZHONG.find(w => w.id === d.wzId);
        if (wz && window.License.canUse(wz)) {
          state.wz = wz; state.form = d.form || {}; state.body = d.body || '';
          $('#wzTitle').textContent = wz.name + `（${wz.cat}）`;
          $('#wzDesc').textContent = wz.desc;
          renderForm();
          $('#bodyText').value = state.body;
          updateCount();
        }
      }
    } catch { /* 忽略损坏的草稿 */ }
  }

  // ================= 初始化 =================
  function init() {
    renderGrid();
    refreshBadge();
    restore();
    renderPresetChips();

    $('#wzSearch').addEventListener('input', renderGrid);
    $('#btnBack1').addEventListener('click', () => goto(1));
    $('#btnBack2').addEventListener('click', () => goto(2));
    $('#toStep3Btn').addEventListener('click', () => goto(3));
    $('#aiBtn').addEventListener('click', aiDraft);
    $('#aiStopBtn').addEventListener('click', stopAI);
    $('#fwBtn').addEventListener('click', useFramework);
    $('#sampleBtn').addEventListener('click', useSample);
    $('#saveDocBtn').addEventListener('click', () => saveToLibrary(false));
    $('#dlBtn').addEventListener('click', download);
    $('#printBtn').addEventListener('click', () => window.print());
    $('#byokLink').addEventListener('click', (e) => { e.preventDefault(); openSettings(); });
    $('#bodyText').addEventListener('input', () => { updateCount(); });
    $('#bodyText').addEventListener('blur', () => { state.body = $('#bodyText').value; persist(); });

    $('#btnSettings').addEventListener('click', openSettings);
    $('#saveConnBtn').addEventListener('click', saveSettings);
    $('#testConnBtn').addEventListener('click', testConn);
    $('#btnLicense').addEventListener('click', openLicense);
    $('#activateBtn').addEventListener('click', doActivate);
    $('#deBtn').addEventListener('click', () => { window.License.deactivate(); refreshBadge(); openLicense(); if (state.step === 1) renderGrid(); });
    $('#btnPresets').addEventListener('click', openPresets);
    $('#presetSaveBtn').addEventListener('click', savePreset);
    $('#presetDeleteBtn').addEventListener('click', () => { if (editingPresetId) { window.Store.deletePreset(editingPresetId); editingPresetId = null; clearPresetEditor(); renderPresetList(); renderPresetChips(); } });
    $('#btnDocs').addEventListener('click', openDocs);

    $$('[data-close]').forEach(el => el.addEventListener('click', closeModals));
    $$('.modal-mask').forEach(m => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModals(); }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModals();
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (state.step === 2 && state.wz) saveToLibrary(false); }
    });

    window.addEventListener('resize', () => { if (state.step === 3) applyZoom(); });
    $('#zoomIn').addEventListener('click', () => { state.zoom = Math.min(1.6, (state.zoom || 1) + 0.15); applyZoom(); });
    $('#zoomOut').addEventListener('click', () => { state.zoom = Math.max(0.3, (state.zoom || 1) - 0.15); applyZoom(); });
    $('#zoomFit').addEventListener('click', () => { state.zoom = null; applyZoom(); });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { goto, select, aiDraft, useFramework, useSample, toggleOptDebug: () => state.opts, openSettings, openLicense, openPresets, openDocs };
})();
