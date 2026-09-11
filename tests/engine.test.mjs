// 一纸成文 · 自动化测试（Node，无外部依赖）
// 覆盖：parser 层级解析 / checker 规则 / license 验签 / 22 文种 docx 国标断言
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
global.window = global;
global.self = global; // nacl UMD 探测 self
(0, eval)(fs.readFileSync(path.join(root, 'app/vendor/docx.iife.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(root, 'app/vendor/nacl-fast.min.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(root, 'app/js/wenzhong.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(root, 'app/js/parser.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(root, 'app/js/format.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(root, 'app/js/checker.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(root, 'app/js/license.js'), 'utf8'));

let passed = 0, failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.error('  FAIL', name); }
};

// ---------- 1. Parser ----------
console.log('\n[Parser]');
const blocks = window.Parser.parseText('一、总体要求\n（一）压实责任\n1.建立台账。\n（1）明确分工。\n正文段落。');
ok(blocks[0].type === 'h1' && blocks[1].type === 'h2' && blocks[2].type === 'h3' && blocks[3].type === 'h4' && blocks[4].type === 'p', '四级层级解析正确');
ok(window.Parser.parseText('').length === 0, '空文本安全');
const fw = window.Parser.parseFramework(['h1|一、总体要求', 'p|正文', 'center|居中']);
ok(fw[0].type === 'h1' && fw[2].type === 'center', '框架语法解析');

// ---------- 2. Checker ----------
console.log('\n[Checker]');
const wz = window.WENZHONG.find(w => w.id === 'tongzhi');
const mkCfg = (body, form = {}) => ({ wz, form: { title: '关于XX的通知', ...form }, blocks: window.Parser.parseText(body), opts: {} });
ok(window.Checker.run(mkCfg('各县：\n为做好工作，现将有关事项通知如下。\n一、总体要求\n要落实责任。')).some(i => i.msg.includes('特此通知')), '缺失规范结束语被检出');
ok(!window.Checker.run(mkCfg('各县：\n一、总体要求\n要落实责任。\n特此通知。')).some(i => i.msg.includes('特此通知')), '含规范结束语不报');
ok(window.Checker.run(mkCfg('一、总体要求\n**加粗**')).some(i => i.level === 'error'), 'Markdown 残留报 error');
ok(window.Checker.run(mkCfg('一、总体要求\n首先，要提高认识。总之，要落实。')).some(i => i.msg.includes('AI 腔')), 'AI 腔被检出');
ok(window.Checker.run(mkCfg('一、总体要求\n一是a。二是b。', { date: '2026-09-12' })).some(i => i.msg.includes('成文日期')), '日期格式被检出');

// ---------- 3. License ----------
console.log('\n[License]');
const SAMPLE_LICENSE = 'YIZHI1.eyJwcm9kIjoieWl6aGkiLCJ0eXBlIjoicHJvIiwibmFtZSI6IumXsumxvOiuouWNlS1TQU1QTEUtMjAyNjA5MTIiLCJpYXQiOiIyMDI2LTA5LTExIn0.TI4RArY830TO45CH6Tv5P8MvukzIJ2BkBixv5fMupQIwNu_na_aPXPXfGf5-izK0rDsQvoJprQjKXCAksi-DBA';
const lic = window.License.verify(SAMPLE_LICENSE);
ok(lic.ok === true && lic.payload.name === '闲鱼订单-SAMPLE-20260912', '有效激活码验签通过');
ok(window.License.verify('YIZHI1.abc.def').ok === false, '伪造激活码被拒绝');
const tampered = SAMPLE_LICENSE.replace('MjAyNjA5MTIi', 'MjAyNjA5MTM=')+'=';// payload 篡改一位
ok(window.License.verify(tampered).ok === false, '篡改 payload 被签名拒绝');
ok(window.WENZHONG.filter(w => w.free).length === 5, '免费文种恰好 5 种');
ok(window.License.FREE_TYPES.size === 5, '免费集合一致');

// ---------- 4. 22 文种 docx 全量生成 + 国标断言 ----------
console.log('\n[FormatEngine · 22 文种全量]');
const tmpDir = fs.mkdtempSync('/tmp/yizhi-test-');
const forms = {
  org: '测试市人民政府办公室文件', docno: 'X政办发〔2026〕18号', issuer: '张三',
  title: '关于开展2026年度安全生产大检查的通知', to: '各县（市、区）人民政府，市政府各部门：',
  points: '测试要点', sign: '测试市人民政府办公室', date: '2026年9月12日',
  meta: '时间：2026年9月8日\n地点：会议室', len: '10分钟',
};
let allOk = true;
for (const w of window.WENZHONG) {
  const cfg = {
    wz: w,
    form: { ...forms, title: w.id === 'jiyao' ? '会议纪要标题' : forms.title },
    blocks: window.Parser.parseFramework(w.framework).map(b => ({
      ...b, text: b.text.replace(/\{(\w+)\}/g, (m, k) => forms[k] || '【' + k + '】'),
    })),
    opts: { redHeader: w.cat === '法定公文', pageNum: true, banji: true, titleFont: '方正小标宋简体', cc: '市委办公室', attachment: '任务分解表', jimi: '', jjcd: '', fenNo: '' },
  };
  const blob = await window.FormatEngine.buildDocxBlob(cfg);
  const f = path.join(tmpDir, w.id + '.docx');
  fs.writeFileSync(f, Buffer.from(await blob.arrayBuffer()));
  // 用 python 断言
  const r = spawnSync('python3', ['-c', `
import sys, zipfile, re
z = zipfile.ZipFile(sys.argv[1])
xml = z.read('word/document.xml').decode('utf-8')
settings = z.read('word/settings.xml').decode('utf-8')
footers = [n for n in z.namelist() if n.startswith('word/footer')]
fxml = ''.join(z.read(n).decode('utf-8') for n in footers)
checks = {
  'margins': 'w:top="2098"' in xml and 'w:bottom="1984"' in xml and 'w:left="1587"' in xml and 'w:right="1474"' in xml,
  'a4': 'w:w="11906"' in xml and 'w:h="16838"' in xml,
  'fonts': '仿宋_GB2312' in xml and '方正小标宋简体' in xml,
  'line': 'w:line="580"' in xml and 'w:lineRule="exact"' in xml,
  'indent': 'w:firstLine="640"' in xml,
  'pagenum': 'evenAndOddHeaders' in settings and 'PAGE' in fxml,
  'hierarchy': True,
}
bad = [k for k, v in checks.items() if not v]
print('OK' if not bad else 'BAD:' + ','.join(bad))
`, f], { encoding: 'utf-8' });
  const out = (r.stdout || '').trim();
  const pass = out === 'OK' && blob.size > 4000;
  if (!pass) { allOk = false; console.error('  FAIL', w.id, out, blob.size); }
  else passed++;
}
console.log(`  PASS ${window.WENZHONG.length} 个文种 docx 国标断言` + (allOk ? '' : '（存在失败，见上）'));
if (!allOk) failed++;

// ---------- 5. 预览引擎 ----------
console.log('\n[Preview]');
const prevHtml = window.FormatEngine.previewHtml({
  wz, form: { ...forms }, blocks: window.Parser.parseText('各县：\n一、总体要求\n' + '内容。'.repeat(200)),
  opts: { redHeader: true, pageNum: true, banji: true, titleFont: '方正小标宋简体', cc: '市委办', attachment: '', jimi: '', jjcd: '', fenNo: '' },
});
ok((prevHtml.match(/yz-paper/g) || []).length >= 2, '长文分页 ≥ 2 页');
ok(prevHtml.includes('— 1 —'), '页码渲染');

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n===== 结果：${passed} 通过，${failed} 失败 =====`);
process.exit(failed ? 1 : 0);
