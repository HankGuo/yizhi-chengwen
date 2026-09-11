// 一纸成文 · 格式与文风自查引擎
// 产出问题清单：error（必须处理）/ warn（建议处理）/ tip（提示）
window.Checker = (function () {
  // 各文种规范结束语（实务口径）
  const ENDINGS = {
    tongzhi: { re: /特此通知/, hint: '通知结尾应使用规范结束语“特此通知。”' },
    qingshi: { re: /(妥否，请批示|妥否，请批复|特此请示)/, hint: '请示结尾应使用“以上请示妥否，请批示。”' },
    baogao: { re: /特此报告/, hint: '报告结尾应使用“特此报告。”' },
    han: { re: /(请予支持为盼|请研究函复|特此函告|特此函询|盼复)/, hint: '函应使用规范结束语，如“请予支持为盼。”“请研究函复。”' },
    pifu: { re: /(特此批复|此复)/, hint: '批复结尾可用“特此批复。”或“此复。”' },
    tongbao: { re: /特此通报/, hint: '通报结尾应使用“特此通报。”' },
    gonggao: { re: /特此公告/, hint: '公告结尾应使用“特此公告。”' },
    tonggao: { re: /(特此通告|自.*施行|本通告自)/, hint: '通告应注明施行时间或以“特此通告。”结尾' },
  };
  const AI_TONE = /(首先，|其次，|再者，|综上所述|总而言之|让我们|值得注意的是|不难发现|众所周知|赋能|抓手闭环)/;
  const MARKDOWN = /(^|\n)\s*(#{1,6}\s|\*\*|-\s|\d+\.\s\*\*)/;

  function run({ wz, form, blocks, opts }) {
    const issues = [];
    const bodyText = blocks.map(b => b.text).join('\n');
    const has = (re) => re.test(bodyText);

    // 1. Markdown 残留（error）
    if (MARKDOWN.test(bodyText)) {
      issues.push({ level: 'error', msg: '正文含 Markdown 符号（#、**、- 等），请清除后再排版', quote: '' });
    }
    // 2. 占位符（warn）
    const ph = window.Parser.placeholders(blocks);
    if (ph.length) {
      issues.push({ level: 'warn', msg: `正文含 ${ph.length} 处【占位符】待核实替换`, quote: ph.slice(0, 4).join('、') });
    }
    // 3. 规范结束语（warn）
    const ending = ENDINGS[wz.id];
    if (ending && !ending.re.test(bodyText)) {
      issues.push({ level: 'warn', msg: ending.hint, quote: '' });
    }
    // 4. 层级跳级（warn）
    let last = 0; // 1..4
    const rank = { h1: 1, h2: 2, h3: 3, h4: 4 };
    for (const b of blocks) {
      if (!(b.type in rank)) continue;
      const r = rank[b.type];
      if (r > last + 1 && last > 0) {
        issues.push({ level: 'warn', msg: `层级跳级：“${trim(b.text)}”之前缺少上一级标题`, quote: trim(b.text) });
        break;
      }
      last = r;
    }
    // 5. 成文日期格式（tip）
    if (form.date && !/^\d{4}年\d{1,2}月\d{1,2}日$/.test(form.date.trim())) {
      issues.push({ level: 'warn', msg: `成文日期建议用“2026年9月12日”格式，当前为“${form.date}”`, quote: form.date });
    }
    if (!form.date && wz.cat === '法定公文') {
      issues.push({ level: 'tip', msg: '未填成文日期，落款处将不显示日期（预印公文可留空）' });
    }
    // 6. 请示一文一事（tip）
    if (wz.id === 'qingshi' && /(一是.*二是|第一，.*第二，|同时申请|并申请)/.test(bodyText)) {
      issues.push({ level: 'warn', msg: '请示应“一文一事”，正文似含多个请求事项，建议拆分', quote: '' });
    }
    // 7. 正文提及附件但未填附件说明（warn）
    if (/附[件表][：:]/.test(bodyText) && !(form.attachment || opts.attachment)) {
      issues.push({ level: 'warn', msg: '正文提到附件，但未在右侧填写“附件说明”', quote: '' });
    }
    // 8. AI 腔（warn）
    const m = bodyText.match(AI_TONE);
    if (m) {
      issues.push({ level: 'warn', msg: `检测到口语化/AI 腔表述“${m[1]}”，建议改为公文规范表述`, quote: m[1] });
    }
    // 9. 正文过短（tip）
    const cjk = (bodyText.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjk < 80) {
      issues.push({ level: 'tip', msg: `正文仅 ${cjk} 字，多数文种建议 300 字以上`, quote: '' });
    }
    // 10. 主送缺失（法定公文 warn）
    if (wz.cat === '法定公文' && !form.to && !['gonggao', 'tonggao', 'mingling', 'jueyi', 'gongbao'].includes(wz.id)) {
      issues.push({ level: 'warn', msg: '法定公文一般应有主送机关，请填写“主送单位”', quote: '' });
    }
    return issues;
  }

  function trim(s) { s = String(s || ''); return s.length > 16 ? s.slice(0, 16) + '…' : s; }

  return { run };
})();
