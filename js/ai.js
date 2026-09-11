// 一纸成文 · BYOK AI 拟稿（流式 SSE，OpenAI 兼容协议）
// 用户的 API Key 只存本地 localStorage；拟稿请求由浏览器直发用户选择的服务商，本产品不经手材料
window.AI = (function () {
  const DEFAULTS = {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    key: '',
  };
  const PRESETS = [
    { name: 'DeepSeek', base: 'https://api.deepseek.com', model: 'deepseek-chat', note: '注册即送额度，一篇材料约 1 分钱' },
    { name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', note: '阿里云百炼开通' },
    { name: 'Kimi', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k', note: '月之暗面开放平台' },
    { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-air', note: '智谱开放平台' },
    { name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', note: '需海外支付方式' },
  ];

  function getConfig() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('yizhi.ai') || '{}') }; }
    catch { return { ...DEFAULTS }; }
  }
  function saveConfig(cfg) {
    localStorage.setItem('yizhi.ai', JSON.stringify({ ...getConfig(), ...cfg }));
  }

  const SYSTEM_PROMPT = `你是一名在某党政机关办公室工作了二十年的资深笔杆子，精通《党政机关公文处理工作条例》和《党政机关公文格式》（GB/T 9704-2012），写的材料多次被上级转发。你的任务是根据用户给出的文种、要素和要点，写出可以直接进入排版环节的公文正文。

铁律：
1. 输出纯文本，禁止任何 Markdown 语法（不要 #、*、-、列表符、表格）。
2. 层级严格用：一、→（一）→ 1. →（1），一行一个自然段，段首不留空格。
3. 语言庄重平实，符合体制内文风：多用"要""确保""不得""原则上""经研究"等规范表述，杜绝AI腔（"首先/其次/总之""让我们""综上所述"等一律不用）。
4. 凡涉及具体数字、金额、日期、人名、单位名等你没有把握的信息，一律用【　】占位（如【具体金额】），严禁编造。
5. 只输出正文本身：从主送单位（以"："结尾）开始，到结尾固定用语结束。不要输出标题、发文字号、落款和日期（界面会自动排版这些要素），也不要任何解释说明。
6. 结尾规范语：通知类"特此通知"；报告类"特此报告"；请示类"以上请示妥否，请批示"；函类视情形用"请予支持为盼"等。`;

  function userPrompt(wz, form) {
    const fields = wz.fields.map(f => `${f.label}：${form[f.key] || '（未填）'}`).join('\n');
    return `【文种】${wz.name}（${wz.desc}）
【本文种写作要求】${wz.aiHint}
【已填要素】
${fields}
【正文要求】${form.len ? `篇幅约${form.len}。` : '篇幅视文种常规标准，宁精勿滥。'}`;
  }

  // 清洗模型输出：去 markdown 残留、规范空白
  function clean(text) {
    return String(text || '')
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```\s*$/, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  // 流式拟稿：AsyncGenerator 逐段产出
  async function* draftStream({ wz, form, signal }) {
    const cfg = getConfig();
    if (!cfg.key) throw Object.assign(new Error('尚未配置 API Key，请点击右上角「API 设置」'), { code: 'NO_KEY' });
    const base = cfg.baseUrl.replace(/\/+$/, '');
    let res;
    try {
      res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt(wz, form) },
          ],
          temperature: 0.7,
          stream: true,
        }),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw Object.assign(new Error('网络请求失败：该 API 地址可能不允许浏览器调用（CORS），可在设置中改用支持跨域的服务商或中转'), { code: 'CORS' });
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error('API Key 无效或无权限（' + res.status + '）'), { code: 'AUTH' });
      if (res.status === 402) throw Object.assign(new Error('账户余额不足（402），请到服务商充值'), { code: 'BALANCE' });
      if (res.status === 429) throw Object.assign(new Error('请求过于频繁（429），稍后再试'), { code: 'RATE' });
      throw new Error(`API 返回 ${res.status}：${t.slice(0, 200)}`);
    }

    const ctype = res.headers.get('content-type') || '';
    if (!res.body || ctype.includes('application/json')) {
      // 服务商未按流式返回，整体返回
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('API 未返回内容');
      yield clean(text);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', emitted = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content || '';
          if (delta) { emitted += delta; yield clean(emitted); }
        } catch { /* 忽略无法解析的行 */ }
      }
    }
    if (!emitted) throw new Error('API 未返回内容');
    yield clean(emitted);
  }

  // 连接测试：发一个极小请求，返回 {ok, latencyMs, model, message}
  async function testConnection() {
    const cfg = getConfig();
    if (!cfg.key) return { ok: false, message: '未填写 API Key' };
    const t0 = performance.now();
    try {
      const base = cfg.baseUrl.replace(/\/+$/, '');
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      });
      const ms = Math.round(performance.now() - t0);
      if (res.ok) return { ok: true, latencyMs: ms, message: `连接成功（${ms}ms，模型 ${cfg.model}）` };
      if (res.status === 401 || res.status === 403) return { ok: false, message: `Key 无效或无权限（${res.status}）` };
      if (res.status === 402) return { ok: false, message: '余额不足（402）' };
      if (res.status === 404) return { ok: false, message: '模型名或地址有误（404），请检查' };
      return { ok: false, message: `API 返回 ${res.status}` };
    } catch {
      return { ok: false, message: '无法连接：地址不可达或不允许浏览器跨域（CORS）' };
    }
  }

  return { getConfig, saveConfig, draftStream, testConnection, clean, SYSTEM_PROMPT, PRESETS, DEFAULTS };
})();
