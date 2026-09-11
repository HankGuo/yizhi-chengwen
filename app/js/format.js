// 一纸成文 · GB/T 9704-2012《党政机关公文格式》排版引擎
// 所有尺寸换算：1mm = 56.6929 twips；1pt = 20 twips
window.FormatEngine = (function () {
  const MM = 56.6929;
  const docx = window.docx;

  // 版面基准
  const MARGIN = {
    top: Math.round(37 * MM),    // 天头 37mm
    bottom: Math.round(35 * MM), // 地脚 35mm
    left: Math.round(28 * MM),   // 订口 28mm
    right: Math.round(26 * MM),  // 翻口 26mm
  };
  const TEXT_WIDTH = Math.round(156 * MM); // 版心宽 156mm = 8845 twips
  const LINE = 580;          // 正文固定行距 29pt（225mm 版心 ÷ 22 行 ≈ 28.99pt）
  const CHAR3 = 320;         // 三号字一个字宽 = 16pt = 320 twips
  const INDENT2 = CHAR3 * 2; // 首行缩进二字

  // 字号（半磅）
  const SZ = { er: 44, san: 32, si: 28 };
  const F = {
    fs: '仿宋_GB2312',
    xbs: '方正小标宋简体',
    ht: '黑体',
    kt: '楷体_GB2312',
    st: '宋体',
    ascii: 'Times New Roman',
  };

  const fontOf = (eastAsia, bold) => ({
    ascii: F.ascii, hAnsi: F.ascii, eastAsia,
    ...(bold ? {} : {}),
  });

  const run = (text, eastAsia, size, opts = {}) =>
    new docx.TextRun({
      text, size,
      font: { ascii: opts.noTimes ? eastAsia : F.ascii, hAnsi: opts.noTimes ? eastAsia : F.ascii, eastAsia },
      bold: !!opts.bold,
      color: opts.color,
    });

  const para = (children, opts = {}) =>
    new docx.Paragraph({
      children: Array.isArray(children) ? children : [children],
      alignment: opts.align,
      spacing: { line: opts.line || LINE, lineRule: 'exact', before: opts.before || 0, after: opts.after || 0 },
      indent: opts.indent,
      border: opts.border,
      tabStops: opts.tabStops,
    });

  const widthChars = (s) => {
    let w = 0;
    for (const ch of String(s || '')) w += /[\u2E80-\u9FFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : 0.5;
    return w;
  };

  // ============ 主入口 ============
  // config: { wz(文种), form{}, blocks[](解析后的正文), opts{ redHeader, titleFont, pageNum, banji, cc, printer, jimi, jjcd } }
  function buildDocxBlob(config) {
    const { wz, form, blocks, opts } = config;
    const titleFont = opts.titleFont || F.xbs;
    const upGoing = wz.direction === '上行'; // 上行文规则
    const children = [];

    // ---- 版头：份号/密级/紧急（可选） ----
    const secretLines = [];
    if (opts.fenNo) secretLines.push(String(opts.fenNo).padStart(6, '0'));
    if (opts.jimi) secretLines.push(opts.jimi);
    if (opts.jjcd) secretLines.push(opts.jjcd);
    secretLines.forEach((t, i) => {
      children.push(para(run(t, F.ht, SZ.san), { indent: { left: 0 } }));
    });

    // ---- 发文机关标志（红头） ----
    if (opts.redHeader && form.org) {
      const len = widthChars(form.org);
      const szRed = len <= 8 ? 72 : len <= 11 ? 60 : 52; // 字数多则缩小，保持一行
      // 上行文：上边缘至版心上边缘 80mm；下行文：35mm
      const before = Math.round((upGoing ? 80 : 35) * MM) - (secretLines.length ? secretLines.length * LINE : 0);
      children.push(para(run(form.org, titleFont, szRed, { color: 'FF0000', noTimes: true }), {
        align: docx.AlignmentType.CENTER,
        before: Math.max(before, 0),
      }));
    }

    // ---- 发文字号（+上行文签发人） ----
    if (form.docno || (upGoing && form.issuer)) {
      if (upGoing) {
        // 居左空一字 + 右侧签发人右空一字
        children.push(para(
          [
            run(form.docno || '', F.fs, SZ.san),
            run('\t', F.fs, SZ.san),
            ...(form.issuer ? [run(`签发人：${form.issuer}`, F.fs, SZ.san)] : []),
          ],
          {
            before: LINE * 2,
            indent: { left: CHAR3 },
            tabStops: [{ type: docx.TabStopType.RIGHT, position: TEXT_WIDTH - CHAR3 }],
          }
        ));
      } else {
        children.push(para(run(form.docno || '', F.fs, SZ.san), {
          align: docx.AlignmentType.CENTER, before: LINE * 2,
        }));
      }
      // 发文字号之下 4mm 红色分隔线（上行文在签发人之下）
      children.push(para(run('', F.fs, SZ.san), {
        line: Math.round(4 * MM),
        border: { bottom: { color: 'FF0000', style: docx.BorderStyle.SINGLE, size: 8, space: 1 } },
      }));
    }

    // ---- 标题（红色分隔线下空二行；二号小标宋） ----
    const titleLines = String(form.title || '').split(/\n|＼/).map(s => s.trim()).filter(Boolean);
    titleLines.forEach((t, i) => {
      children.push(para(run(t, titleFont, SZ.er, { noTimes: true }), {
        align: docx.AlignmentType.CENTER,
        before: i === 0 ? LINE * 2 : 0,
        line: 720,
      }));
    });

    // ---- 主送机关（标题下空一行，顶格） ----
    if (form.to) {
      const to = /[：:]$/.test(form.to.trim()) ? form.to.trim() : form.to.trim() + '：';
      children.push(para(run(to, F.fs, SZ.san), { before: LINE }));
    }

    // ---- 正文 ----
    for (const b of blocks) {
      switch (b.type) {
        case 'h1': children.push(para(run(b.text, F.ht, SZ.san), { indent: { firstLine: INDENT2 } })); break;
        case 'h2': children.push(para(run(b.text, F.kt, SZ.san), { indent: { firstLine: INDENT2 } })); break;
        case 'h3': children.push(para(run(b.text, F.fs, SZ.san, { bold: true }), { indent: { firstLine: INDENT2 } })); break;
        case 'h4': children.push(para(run(b.text, F.fs, SZ.san), { indent: { firstLine: INDENT2 } })); break;
        case 'center': children.push(para(run(b.text, F.fs, SZ.san), { align: docx.AlignmentType.CENTER })); break;
        default: children.push(para(run(b.text, F.fs, SZ.san), { indent: { firstLine: INDENT2 } }));
      }
    }

    // ---- 附件说明（正文下空一行，左空二字） ----
    const attachment = form.attachment || opts.attachment;
    if (attachment) {
      String(attachment).split(/\n/).filter(Boolean).forEach((att, i) => {
        children.push(para(
          run(i === 0 ? `附件：${att}` : `${att}`, F.fs, SZ.san),
          { before: i === 0 ? LINE : 0, indent: { left: INDENT2 } }
        ));
      });
    }

    // ---- 落款：署名 + 成文日期（署名在日期上方，日期右空四字） ----
    const sign = form.sign || (opts.redHeader ? form.org : '');
    const date = form.date || '';
    if (sign || date) {
      const dateIndent = CHAR3 * 4; // 右空四字
      if (sign) {
        const dw = widthChars(date) * CHAR3, sw = widthChars(sign) * CHAR3;
        const signIndent = Math.max(0, Math.round(dateIndent + (dw - sw) / 2)); // 以日期为准居中
        children.push(para(run(sign, F.fs, SZ.san), {
          before: LINE * 2, align: docx.AlignmentType.RIGHT, indent: { right: signIndent },
        }));
      }
      if (date) {
        children.push(para(run(date, F.fs, SZ.san), {
          align: docx.AlignmentType.RIGHT, indent: { right: dateIndent },
        }));
      }
    }

    // ---- 版记 ----
    if (opts.banji && (opts.cc || form.org)) {
      const blackBorder = (size) => ({ bottom: { color: '000000', style: docx.BorderStyle.SINGLE, size, space: 1 } });
      // 首条粗线
      children.push(para(run('', F.fs, SZ.si), { line: Math.round(1 * MM), border: blackBorder(8) }));
      if (opts.cc) {
        children.push(para(run(`抄送：${opts.cc}。`, F.fs, SZ.si), { indent: { left: CHAR3 } }));
        children.push(para(run('', F.fs, SZ.si), { line: Math.round(0.7 * MM), border: blackBorder(6) }));
      }
      // 印发机关与印发日期（同行：左空一字，右空一字）
      children.push(para(
        [run(form.org || '', F.fs, SZ.si), run('\t', F.fs, SZ.si),
         run(`${date ? date : ''}印发`, F.fs, SZ.si)],
        {
          indent: { left: CHAR3 },
          tabStops: [{ type: docx.TabStopType.RIGHT, position: TEXT_WIDTH - CHAR3 }],
        }
      ));
      // 末条粗线
      children.push(para(run('', F.fs, SZ.si), { line: Math.round(1 * MM), border: blackBorder(8) }));
    }

    // ---- 页码（单页右空一字、双页左空一字，四号宋体，一字线） ----
    const pageFont = { ascii: F.ascii, hAnsi: F.ascii, eastAsia: F.st };
    const mkNum = (align, indent) => new docx.Paragraph({
      alignment: align,
      indent,
      children: [new docx.TextRun({
        children: ['— ', docx.PageNumber.CURRENT, ' —'],
        size: SZ.si, font: pageFont,
      })],
    });
    const footers = opts.pageNum === false ? undefined : {
      default: new docx.Footer({ children: [mkNum(docx.AlignmentType.RIGHT, { right: CHAR3 })] }),
      even: new docx.Footer({ children: [mkNum(docx.AlignmentType.LEFT, { left: CHAR3 })] }),
    };

    const doc = new docx.Document({
      evenAndOddHeaderAndFooters: !!footers,
      styles: {
        default: {
          document: { run: { font: { ascii: F.ascii, hAnsi: F.ascii, eastAsia: F.fs }, size: SZ.san } },
        },
      },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: MARGIN } },
        footers,
        children,
      }],
    });

    return docx.Packer.toBlob(doc);
  }

  // ============ 预览 HTML（浏览器近似渲染 + 近似分页） ============
  // 每页 22 行；二号标题每行约 20 字，三号正文每行 28 字；分页为近似模拟，以 WPS/Word 实际分页为准
  const LINES_PER_PAGE = 22;

  function previewHtml(config) {
    const { wz, form, blocks, opts } = config;
    const fsFont = `'FangSong','仿宋','STFangsong','仿宋_GB2312',serif`;
    const ktFont = `'Kaiti SC','Kaiti','楷体','STKaiti',serif`;
    const htFont = `'Heiti SC','SimHei','黑体',serif`;
    const titleFontCss = `'STZhongsong','华文中宋','Songti SC','SimSun',serif`;
    const upGoing = wz.direction === '上行';
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    const rows = []; // {html, lines}
    const addRow = (html, lines) => rows.push({ html, lines });

    if (opts.redHeader && form.org) {
      const len = widthChars(form.org);
      const sz = len <= 8 ? 36 : len <= 11 ? 30 : 26;
      const spacerMm = upGoing ? 80 : 35;
      addRow(`<div style="height:${spacerMm}mm"></div>`, spacerMm / 10.23);
      addRow(`<div style="text-align:center;color:#FF0000;font-family:${titleFontCss};font-weight:700;font-size:${sz}pt;letter-spacing:2px;line-height:1.45">${esc(form.org)}</div>`, 1.2);
      const head = [opts.fenNo ? String(opts.fenNo).padStart(6, '0') : '', opts.jimi, opts.jjcd].filter(Boolean).join('　');
      if (head) addRow(`<div style="font-family:${htFont};font-size:16pt;line-height:1.5">${esc(head)}</div>`, head.split('　').length * 1);
    }
    if (form.docno || (upGoing && form.issuer)) {
      addRow(`<div style="height:2.2em"></div>`, 2.2);
      addRow(`<div style="font-family:${fsFont};font-size:16pt;display:flex;${upGoing ? 'justify-content:space-between;padding:0 1em' : 'justify-content:center'};line-height:1.8">
        <span>${esc(form.docno || '')}</span>${upGoing && form.issuer ? `<span>签发人：${esc(form.issuer)}</span>` : ''}</div>`, 1);
      addRow(`<div style="margin-top:1.4mm;border-bottom:1pt solid #FF0000"></div>`, 0.4);
    }
    String(form.title || '').split(/\n|＼/).filter(Boolean).forEach((t, i) => {
      const lines = Math.max(1, Math.ceil(widthChars(t) / 20));
      addRow(`${i === 0 ? `<div style="height:2.2em"></div>` : ''}
        <div style="text-align:center;font-family:${titleFontCss};font-weight:700;font-size:22pt;line-height:1.55">${esc(t)}</div>`, (i === 0 ? 2.2 : 0) + lines);
    });
    if (form.to) {
      const to = /[：:]$/.test(form.to.trim()) ? form.to.trim() : form.to.trim() + '：';
      const lines = Math.max(1, Math.ceil(widthChars(to) / 28));
      addRow(`<div style="height:1em"></div><div style="font-family:${fsFont};font-size:16pt;line-height:1.8">${esc(to)}</div>`, 1 + lines);
    }
    for (const b of blocks) {
      const lines = Math.max(1, Math.ceil(widthChars(b.text) / 28));
      const fontMap = { h1: htFont, h2: ktFont, h3: fsFont + ';font-weight:700', h4: fsFont, center: fsFont, p: fsFont };
      const hl = esc(b.text).replace(/(【[^】]*】)/g, '<mark style="background:#fff1a8">$1</mark>');
      if (b.type === 'center') addRow(`<div style="text-align:center;font-size:16pt;font-family:${fsFont};line-height:1.8">${hl}</div>`, lines);
      else addRow(`<div style="font-size:16pt;text-indent:2em;font-family:${fontMap[b.type] || fsFont};line-height:1.8">${hl}</div>`, lines);
    }
    const attachment = form.attachment || opts.attachment;
    if (attachment) {
      String(attachment).split(/\n/).filter(Boolean).forEach((att, i) => {
        addRow(`${i === 0 ? `<div style="height:1em"></div>` : ''}<div style="font-size:16pt;padding-left:2em;font-family:${fsFont};line-height:1.8">${i === 0 ? '附件：' + esc(att) : esc(att)}</div>`, (i === 0 ? 1 : 0) + 1);
      });
    }
    const sign = form.sign || (opts.redHeader ? form.org : '');
    if (sign || form.date) {
      addRow(`<div style="height:2.4em"></div>`, 2.6);
      if (sign) addRow(`<div style="text-align:right;font-size:16pt;font-family:${fsFont};padding-right:2em;line-height:1.8">${esc(sign)}</div>`, 1);
      if (form.date) addRow(`<div style="text-align:right;font-size:16pt;font-family:${fsFont};padding-right:4em;line-height:1.8">${esc(form.date)}</div>`, 1);
    }

    // 分页组装
    let html = '', used = 0, page = 1, pageHtml = '';
    const flush = () => {
      html += `<div class="yz-paper" style="position:relative;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1),0 8px 28px rgba(0,0,0,.1);margin:0 auto 16px;padding:37mm 26mm 35mm 28mm;width:210mm;min-height:297mm;box-sizing:border-box;color:#000">` +
        pageHtml +
        `<div style="position:absolute;bottom:11mm;left:0;right:0;text-align:center;font-family:'Times New Roman',serif;font-size:12pt;color:#333">— ${page} —</div></div>`;
      pageHtml = ''; page++; used = 0;
    };
    for (const r of rows) {
      if (used > 0 && used + r.lines > LINES_PER_PAGE + 0.9) flush();
      pageHtml += r.html; used += r.lines;
    }
    if (opts.banji && (opts.cc || form.org)) {
      let bj = `<div style="margin-top:2.5em"><div style="border-top:1pt solid #000"></div>`;
      bj += `<div style="padding:2pt 0;font-size:14pt;font-family:${fsFont};line-height:1.7">`;
      if (opts.cc) bj += `<div style="padding-left:1em">抄送：${esc(opts.cc)}。</div><div style="border-top:0.75pt solid #000;margin:2pt 0"></div>`;
      bj += `<div style="padding-left:1em;display:flex;justify-content:space-between"><span>${esc(form.org || '')}</span><span style="padding-right:1em">${esc(form.date || '')}印发</span></div></div>`;
      bj += `<div style="border-top:1pt solid #000"></div></div>`;
      if (used > 0 && used + 3.6 > LINES_PER_PAGE + 0.9) flush();
      pageHtml += bj;
    }
    flush();
    return html;
  }

  return { buildDocxBlob, previewHtml, estimatePages: (c) => previewHtml(c).length, MARGIN, LINE, SZ, F };

})();
