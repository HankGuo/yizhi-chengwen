// 一纸成文 · 正文结构解析器
// 把纯文本解析为段落结构，识别公文的四个层级与特殊行
window.Parser = (function () {
  const H1 = /^[一二三四五六七八九十]{1,3}[、.．]/;
  const H2 = /^（[一二三四五六七八九十]{1,3}）/;
  const H3 = /^\d{1,2}[、.．]/;
  const H4 = /^（\d{1,2}）/;
  const CENTER = /^[*【center】]/;

  function classify(line) {
    const t = line.trim();
    if (!t) return null;
    if (H1.test(t)) return { type: 'h1', text: t };
    if (H2.test(t)) return { type: 'h2', text: t };
    if (H4.test(t)) return { type: 'h4', text: t };
    if (H3.test(t)) return { type: 'h3', text: t };
    return { type: 'p', text: t };
  }

  // 框架文本（h1|一、总体要求 形式）→ blocks
  function parseFramework(lines) {
    const out = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const sep = line.indexOf('|');
      if (sep > 0 && ['h1', 'h2', 'h3', 'p', 'center'].includes(line.slice(0, sep))) {
        out.push({ type: line.slice(0, sep), text: line.slice(sep + 1) });
      } else {
        out.push(classify(line));
      }
    }
    return out.filter(Boolean);
  }

  // 用户输入/AI 输出的纯文本 → blocks
  function parseText(text) {
    const out = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
      const b = classify(raw);
      if (b) out.push(b);
    }
    // 合并被换行打断的段落：非层级行且上一行是段落且以逗号/分号结尾则合并？——保守起见不合并，公文一行一段
    return out;
  }

  // 统计占位符 【...】
  function placeholders(blocks) {
    const list = [];
    for (const b of blocks) {
      const m = b.text.match(/【[^】]*】/g);
      if (m) list.push(...m);
    }
    return list;
  }

  return { parseText, parseFramework, placeholders, classify };
})();
