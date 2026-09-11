// 一纸成文 · 离线激活码验证（Ed25519，tweetnacl）
window.License = (function () {
  const PUBLIC_KEY_B64 = 'yVccFVXRY8PohP5scgCj0jF8cC38o9Q5uKrvi9vLbQQ=';
  const STORE = 'yizhi.license';
  const FREE_TYPES = new Set(['tongzhi', 'qingshi', 'baogao', 'han', 'jiyao']); // 免费文种

  const b64urlToBytes = (s) => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const bin = atob(b64 + pad);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  };

  function verify(license) {
    try {
      const parts = String(license || '').trim().split('.');
      if (parts.length !== 3 || parts[0] !== 'YIZHI1') return { ok: false, reason: '格式不正确' };
      const json = new TextEncoder().encode(new TextDecoder().decode(b64urlToBytes(parts[1])));
      const sig = b64urlToBytes(parts[2]);
      const pub = Uint8Array.from(atob(PUBLIC_KEY_B64), c => c.charCodeAt(0));
      const ok = window.nacl.sign.detached.verify(json, sig, pub);
      if (!ok) return { ok: false, reason: '签名无效' };
      const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
      if (payload.prod !== 'yizhi') return { ok: false, reason: '产品不匹配' };
      if (payload.exp && new Date(payload.exp) < new Date()) return { ok: false, reason: '已过期' };
      return { ok: true, payload };
    } catch (e) {
      return { ok: false, reason: '解析失败：' + e.message };
    }
  }

  function get() {
    const code = localStorage.getItem(STORE) || '';
    if (!code) return null;
    const r = verify(code);
    return r.ok ? { code, payload: r.payload } : null;
  }

  function activate(code) {
    const r = verify(code);
    if (!r.ok) return r;
    localStorage.setItem(STORE, code.trim());
    return r;
  }

  function deactivate() { localStorage.removeItem(STORE); }
  function isPro() { return !!get(); }
  function canUse(wz) { return wz.free || isPro(); }

  return { verify, activate, deactivate, isPro, canUse, get, FREE_TYPES };
})();
