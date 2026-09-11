// 一纸成文 · 单位预设与文稿库（全部存于本地浏览器）
window.Store = (function () {
  const PRESET_KEY = 'yizhi.presets';
  const DOCS_KEY = 'yizhi.docs';

  // ---------- 单位预设 ----------
  function getPresets() {
    try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); } catch { return []; }
  }
  function savePreset(p) {
    const list = getPresets();
    if (!p.id) p.id = 'p' + Date.now();
    const i = list.findIndex(x => x.id === p.id);
    if (i >= 0) list[i] = p; else list.unshift(p);
    localStorage.setItem(PRESET_KEY, JSON.stringify(list.slice(0, 20)));
    return p;
  }
  function deletePreset(id) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(getPresets().filter(p => p.id !== id)));
  }
  // 应用预设到 state（form + opts）
  function applyPreset(p, form, opts) {
    if (p.org) form.org = p.org;
    if (p.sign) form.sign = p.sign;
    if (p.org && !form.sign) form.sign = p.org;
    if (p.cc !== undefined) opts.cc = p.cc;
    if (p.titleFont) opts.titleFont = p.titleFont;
    if (p.redHeader !== undefined) opts.redHeader = p.redHeader;
    if (p.banji !== undefined) opts.banji = p.banji;
    if (p.docnoPrefix && !form.docno) form.docno = p.docnoPrefix;
  }

  // ---------- 文稿库 ----------
  function getDocs() {
    try { return JSON.parse(localStorage.getItem(DOCS_KEY) || '[]'); } catch { return []; }
  }
  function saveDoc(doc) {
    const list = getDocs();
    doc.id = doc.id || 'd' + Date.now();
    doc.ts = doc.ts || Date.now();
    const i = list.findIndex(x => x.id === doc.id);
    if (i >= 0) list[i] = doc; else list.unshift(doc);
    localStorage.setItem(DOCS_KEY, JSON.stringify(list.slice(0, 50)));
    return doc;
  }
  function getDoc(id) { return getDocs().find(d => d.id === id) || null; }
  function deleteDoc(id) {
    localStorage.setItem(DOCS_KEY, JSON.stringify(getDocs().filter(d => d.id !== id)));
  }

  return { getPresets, savePreset, deletePreset, applyPreset, getDocs, saveDoc, getDoc, deleteDoc };
})();
