/** 江清让同层微博 v2：单轮廓远程前端启动器 */
const JWR2_TAG = '[江清让微博v2]';
const JWR2_FRONTEND_URL = 'https://fchris1219-del.github.io/jiang-weibo-oneframe-v2/weibo.html';
const JWR2_ROOT_ID = 'jwr2-root';
const JWR2_BRIDGE_KEY = '__JWR2_BRIDGE__';
const JWR2_INSTANCE_KEY = '__JWR2_CLEANUP__';
const JWR2_SETTINGS_KEY = 'jiang_weibo_oneframe_v2';
const JWR2_CHAT_KEY = 'jiang_weibo_oneframe_v2';

const JWR2_DOC = (() => {
  try { return window.parent && window.parent.document ? window.parent.document : document; }
  catch (_) { return document; }
})();
const JWR2_HOST = JWR2_DOC.defaultView || window.parent || window;

let jwr2Root = null;
let jwr2Frame = null;
let jwr2RemotePromise = null;
let jwr2ChatListener = null;
let jwr2UnlockedToken = '';

function jwr2ScriptId() {
  try { return typeof getScriptId === 'function' ? String(getScriptId() || '') : ''; }
  catch (_) { return ''; }
}

function jwr2Context() {
  try { if (typeof SillyTavern?.getContext === 'function') return SillyTavern.getContext(); } catch (_) {}
  try { if (typeof JWR2_HOST.SillyTavern?.getContext === 'function') return JWR2_HOST.SillyTavern.getContext(); } catch (_) {}
  return null;
}

function jwr2Clone(value, fallback = null) {
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return fallback; }
}

function jwr2ChatId() {
  const ctx = jwr2Context();
  try { return String(ctx?.getCurrentChatId?.() || ctx?.chatId || ''); } catch (_) { return ''; }
}

function jwr2Runtime() {
  const ctx = jwr2Context() || {};
  const ch = ctx?.characters?.[ctx?.characterId] || {};
  const data = ch?.data || ch;
  let charName = String(data?.name || ctx?.name2 || '江清让');
  let userName = String(ctx?.name1 || 'user');
  let charAvatar = String(data?.avatar || ch?.avatar || '');
  let userAvatar = String(ctx?.user_avatar || ctx?.powerUserSettings?.user_avatar || '');
  try {
    const sub = ctx?.substituteParams || (typeof substituteParams === 'function' ? substituteParams : null);
    if (sub) {
      const clean = (v) => String(v || '').includes('{{') ? '' : String(v || '').trim();
      charName = clean(sub('{{char}}')) || charName;
      userName = clean(sub('{{user}}')) || userName;
      charAvatar = clean(sub('{{charAvatarPath}}')) || charAvatar;
      userAvatar = clean(sub('{{userAvatarPath}}')) || userAvatar;
    }
  } catch (_) {}
  return { chatId: jwr2ChatId(), charName, userName, charAvatar, userAvatar };
}

function jwr2SafeContext() {
  const ctx = jwr2Context() || {};
  const ch = ctx?.characters?.[ctx?.characterId] || {};
  const data = ch?.data || ch;
  return {
    chat: ctx.chat || [],
    chatMetadata: ctx.chatMetadata || {},
    name1: ctx.name1,
    name2: ctx.name2,
    user_avatar: ctx.user_avatar,
    powerUserSettings: {
      user_avatar: ctx?.powerUserSettings?.user_avatar || '',
      persona_description: ctx?.powerUserSettings?.persona_description || '',
      persona: ctx?.powerUserSettings?.persona || '',
    },
    characters: [{
      name: data?.name || ctx?.name2 || '',
      avatar: data?.avatar || ch?.avatar || '',
      description: data?.description || '',
      personality: data?.personality || data?.personality_summary || '',
      scenario: data?.scenario || '',
      first_mes: data?.first_mes || '',
      data,
    }],
    characterId: 0,
    chatId: jwr2ChatId(),
    getCurrentChatId: () => jwr2ChatId(),
    maxContext: ctx.maxContext || 32768,
    loadWorldInfo: typeof ctx.loadWorldInfo === 'function' ? ctx.loadWorldInfo.bind(ctx) : undefined,
    getWorldInfoPrompt: typeof ctx.getWorldInfoPrompt === 'function' ? ctx.getWorldInfoPrompt.bind(ctx) : undefined,
  };
}

function jwr2DefaultStore() {
  return {
    version: 2,
    api: { mode: 'main', source: 'custom', url: '', model: '', temperature: 0.8, maxTokens: 4096, encryptedToken: '' },
    context: { recentMessages: 12, includeChar: true, includePersona: true, includeScenario: true, includeWorldInfo: true, injectMain: false },
    slots: [{ id: 'default', name: '默认档位', initPrompt: '', wbLore: '' }],
  };
}

function jwr2ReadSettings() {
  const ctx = jwr2Context();
  const base = jwr2DefaultStore();
  const raw = ctx?.extensionSettings?.[JWR2_SETTINGS_KEY];
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...jwr2Clone(raw, {}) };
  out.api = { ...base.api, ...(raw.api || {}) };
  out.context = { ...base.context, ...(raw.context || {}) };
  out.slots = Array.isArray(raw.slots) && raw.slots.length ? jwr2Clone(raw.slots, base.slots) : base.slots;
  return out;
}

function jwr2WriteSettings(next) {
  const ctx = jwr2Context();
  if (!ctx) return false;
  if (!ctx.extensionSettings || typeof ctx.extensionSettings !== 'object') ctx.extensionSettings = {};
  const prev = jwr2ReadSettings();
  const merged = {
    ...prev,
    ...jwr2Clone(next, {}),
    api: { ...prev.api, ...(next?.api || {}) },
    context: { ...prev.context, ...(next?.context || {}) },
  };
  ctx.extensionSettings[JWR2_SETTINGS_KEY] = merged;
  ctx.saveSettingsDebounced?.();
  return jwr2Clone(merged, merged);
}

function jwr2ReadChatStore() {
  const raw = jwr2Context()?.chatMetadata?.[JWR2_CHAT_KEY];
  return raw && typeof raw === 'object' ? jwr2Clone(raw, {}) : {};
}

async function jwr2WriteChatStore(next) {
  const ctx = jwr2Context();
  if (!ctx) return false;
  if (!ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') ctx.chatMetadata = {};
  ctx.chatMetadata[JWR2_CHAT_KEY] = { ...jwr2ReadChatStore(), ...jwr2Clone(next, {}), savedAt: Date.now() };
  if (typeof ctx.saveMetadata === 'function') await ctx.saveMetadata();
  else ctx.saveMetadataDebounced?.();
  return true;
}

function jwr2Marker(which) {
  const open = '<' + '!--';
  return open + ' JWR2_SLOT_' + which + ' --' + '>';
}

async function jwr2WriteFirstFloor(slot) {
  const ctx = jwr2Context();
  if (!ctx?.chat?.length) throw new Error('当前聊天没有首楼');
  const msg = ctx.chat[0];
  const start = jwr2Marker('START');
  const end = jwr2Marker('END');
  const old = String(msg?.mes || '');
  const escapedName = String(slot?.name || '默认档位').replace(/[<>]/g, '');
  const initPrompt = String(slot?.initPrompt || '').trim();
  const lore = String(slot?.wbLore || '').trim();
  const block = [
    start,
    '<wb_lore>',
    '[微博档位|' + escapedName + ']',
    initPrompt ? '[初始化提示词]\n' + initPrompt : '',
    lore,
    '</wb_lore>',
    end,
  ].filter(Boolean).join('\n');
  const pattern = new RegExp(start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const next = (old.replace(pattern, '').trimEnd() + '\n\n' + block).trim();
  msg.mes = next;
  if (Array.isArray(msg.swipes)) {
    const index = typeof msg.swipe_id === 'number' ? msg.swipe_id : 0;
    if (index >= 0 && index < msg.swipes.length) msg.swipes[index] = next;
  }
  await ctx.saveChat?.();
  return true;
}

function jwr2SetMainInjection(text, enabled) {
  const ctx = jwr2Context();
  if (typeof ctx?.setExtensionPrompt !== 'function') return false;
  ctx.setExtensionPrompt('jiang_weibo_wblore_v2', enabled ? String(text || '') : '', 1, 0, false, 0, null);
  return true;
}

function jwr2B64(bytes) {
  let raw = '';
  bytes.forEach((b) => { raw += String.fromCharCode(b); });
  return btoa(raw);
}
function jwr2Bytes(text) {
  const raw = atob(String(text || ''));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function jwr2DerivedKey(passphrase, salt, usage) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, usage);
}
async function jwr2EncryptToken(token, passphrase) {
  if (!token || !passphrase) throw new Error('请同时填写 Token 和解锁口令');
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await jwr2DerivedKey(passphrase, salt, ['encrypt']);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));
  return JSON.stringify({ v: 1, salt: jwr2B64(salt), iv: jwr2B64(iv), data: jwr2B64(new Uint8Array(data)) });
}
async function jwr2DecryptToken(payload, passphrase) {
  if (!payload) throw new Error('还没有保存加密 Token');
  if (!passphrase) throw new Error('请输入解锁口令');
  try {
    const box = JSON.parse(payload);
    const key = await jwr2DerivedKey(passphrase, jwr2Bytes(box.salt), ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: jwr2Bytes(box.iv) }, key, jwr2Bytes(box.data));
    return new TextDecoder().decode(plain);
  } catch (_) { throw new Error('解锁失败：口令错误或密文损坏'); }
}

function jwr2ApiPublicState() {
  const api = jwr2ReadSettings().api;
  return { ...api, encryptedToken: undefined, hasToken: !!api.encryptedToken, unlocked: !!jwr2UnlockedToken };
}
function jwr2NormalizeUrl(raw) {
  let url = String(raw || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(url)) url = url.replace(/\/chat\/completions$/i, '');
  if (/^https?:\/\/[^/?#]+$/i.test(url)) url += '/v1';
  return url;
}
function jwr2ExtractContent(data) {
  let out = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.output_text ?? data?.content ?? '';
  if (Array.isArray(out)) out = out.map((x) => typeof x === 'string' ? x : (x?.text || x?.content || '')).join('');
  return String(out || '').trim();
}
function jwr2Messages(request) {
  if (Array.isArray(request?.messages)) return request.messages;
  const input = String(request?.user_input || request?.prompt || request || '');
  return [
    { role: 'system', content: '你是同层微博数据生成器。严格按任务要求输出协议标签，不解释。' },
    { role: 'user', content: input },
  ];
}
async function jwr2RequestSide(request, override = {}) {
  const api = jwr2ReadSettings().api;
  if (api.mode !== 'side') throw new Error('副 API 未启用');
  if (!api.url || !api.model) throw new Error('副 API 地址或模型为空');
  if (!jwr2UnlockedToken) throw new Error('副 API Token 尚未解锁');
  const ctx = jwr2Context();
  if (!ctx?.getRequestHeaders) throw new Error('酒馆请求头不可用');
  const common = {
    model: api.model,
    messages: jwr2Messages(request),
    temperature: Number(api.temperature) || 0,
    max_tokens: Math.max(1, Number(override.maxTokens) || Number(api.maxTokens) || 4096),
    stream: false,
    tool_choice: 'none',
    presence_penalty: 0,
    frequency_penalty: 0,
  };
  const base = jwr2NormalizeUrl(api.url);
  const body = api.source === 'custom'
    ? { chat_completion_source: 'custom', custom_url: base, custom_include_headers: JSON.stringify({ Authorization: 'Bearer ' + jwr2UnlockedToken }), ...common }
    : { chat_completion_source: api.source || 'openai', reverse_proxy: base, proxy_password: jwr2UnlockedToken, ...common };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const res = await fetch('/api/backends/chat-completions/generate', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body), signal: controller.signal });
    const raw = await res.text();
    let data = null; try { data = JSON.parse(raw); } catch (_) {}
    if (!res.ok) throw new Error('HTTP ' + res.status + '：' + String(data?.error?.message || data?.message || raw).slice(0, 240));
    const content = jwr2ExtractContent(data);
    if (!content) throw new Error('副 API 返回空内容');
    return content;
  } finally { clearTimeout(timer); }
}
async function jwr2GenerateRaw(request) {
  const api = jwr2ReadSettings().api;
  if (api.mode === 'side') return jwr2RequestSide(request);
  const ctx = jwr2Context();
  if (typeof ctx?.generateRaw === 'function') {
    const out = await ctx.generateRaw({ prompt: jwr2Messages(request), responseLength: Number(api.maxTokens) || 4096 });
    if (!String(out || '').trim()) throw new Error('酒馆主 API 返回空内容');
    return String(out).trim();
  }
  if (typeof generateRaw === 'function') return generateRaw(request);
  throw new Error('当前酒馆版本未提供 generateRaw');
}

async function jwr2SaveToken(token, passphrase) {
  const encryptedToken = await jwr2EncryptToken(token, passphrase);
  jwr2UnlockedToken = token;
  jwr2WriteSettings({ api: { encryptedToken } });
  return jwr2ApiPublicState();
}
async function jwr2UnlockToken(passphrase) {
  jwr2UnlockedToken = await jwr2DecryptToken(jwr2ReadSettings().api.encryptedToken, passphrase);
  return jwr2ApiPublicState();
}
async function jwr2TestApi(draft) {
  if (draft) jwr2WriteSettings({ api: draft });
  const mode = jwr2ReadSettings().api.mode;
  const result = mode === 'side'
    ? await jwr2RequestSide({ messages: [{ role: 'user', content: '只回复 OK。' }] }, { maxTokens: 16 })
    : await jwr2GenerateRaw({ messages: [{ role: 'user', content: '只回复 OK。' }] });
  return String(result || '').slice(0, 80);
}

function jwr2Close() {
  jwr2Root?.querySelector('#jwr2-overlay')?.classList.remove('on');
}
async function jwr2Reload() {
  if (jwr2Frame) jwr2Frame.srcdoc = '';
  jwr2RemotePromise = null;
  return jwr2LoadFrame(true);
}

function jwr2InstallBridge() {
  JWR2_HOST[JWR2_BRIDGE_KEY] = {
    owner: jwr2ScriptId(),
    getContext: () => jwr2SafeContext(),
    getCurrentChatId: () => jwr2ChatId(),
    getChatMessages: (...args) => typeof getChatMessages === 'function' ? getChatMessages(...args) : [],
    getSettings: () => jwr2ReadSettings(),
    saveSettings: (value) => jwr2WriteSettings(value),
    getChatStore: () => jwr2ReadChatStore(),
    saveChatStore: (value) => jwr2WriteChatStore(value),
    writeFirstFloor: (slot) => jwr2WriteFirstFloor(slot),
    setMainInjection: (text, enabled) => jwr2SetMainInjection(text, enabled),
    getApiState: () => jwr2ApiPublicState(),
    saveApiSettings: (value) => jwr2WriteSettings({ api: value }),
    saveApiToken: (token, passphrase) => jwr2SaveToken(token, passphrase),
    unlockApiToken: (passphrase) => jwr2UnlockToken(passphrase),
    clearApiToken: () => { jwr2UnlockedToken = ''; jwr2WriteSettings({ api: { encryptedToken: '' } }); return jwr2ApiPublicState(); },
    testApi: (draft) => jwr2TestApi(draft),
    generate: (request) => jwr2GenerateRaw(request),
    generateRaw: (request) => jwr2GenerateRaw(request),
    close: () => jwr2Close(),
    reload: () => jwr2Reload(),
  };
}

function jwr2Json(value) {
  const commentOpen = '<' + '!--';
  return JSON.stringify(String(value || '')).replace(/<\//g, '<\\/').split(commentOpen).join('<' + '\\!--');
}
async function jwr2FetchRemote(force = false) {
  if (force) jwr2RemotePromise = null;
  if (!jwr2RemotePromise) {
    jwr2RemotePromise = (async () => {
      const url = JWR2_FRONTEND_URL + (JWR2_FRONTEND_URL.includes('?') ? '&' : '?') + 'v=' + Date.now();
      const res = await fetch(url, { cache: 'reload', mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('远程前端 HTTP ' + res.status);
      const html = await res.text();
      if (html.length < 1000 || !html.includes('<div id="app">')) throw new Error('远程前端内容无效');
      return html;
    })();
  }
  return jwr2RemotePromise;
}
function jwr2PrepareHtml(html) {
  const r = jwr2Runtime();
  const base = '<base href="' + JWR2_FRONTEND_URL.replace(/[^/]+$/, '') + '">';
  const bridgeBody = `
const __jwr2=window.parent[${jwr2Json(JWR2_BRIDGE_KEY)}];
window.WeiboHost=__jwr2;
window.charName=${jwr2Json(r.charName)};
window.userName=${jwr2Json(r.userName)};
window.charAvatarPath=${jwr2Json(r.charAvatar)};
window.userAvatarPath=${jwr2Json(r.userAvatar)};
window.__JQR_CHAT_ID__=${jwr2Json(r.chatId)};
window.SillyTavern={getContext:()=>__jwr2.getContext(),getCurrentChatId:()=>__jwr2.getCurrentChatId()};
window.getChatMessages=(...args)=>__jwr2.getChatMessages(...args);
window.generate=(...args)=>__jwr2.generate(...args);
window.generateRaw=(...args)=>__jwr2.generateRaw(...args);
`;
  const bridge = '<scr' + 'ipt>' + bridgeBody + '</scr' + 'ipt>';
  return String(html).replace(/<head(\s[^>]*)?>/i, (m) => m + base + bridge);
}

function jwr2Status(text, bad = false) {
  const el = jwr2Root?.querySelector('#jwr2-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('bad', bad);
  el.style.display = text ? 'grid' : 'none';
}
async function jwr2LoadFrame(force = false) {
  if (!jwr2Frame) return;
  jwr2Status('正在加载微博…');
  try {
    const html = await jwr2FetchRemote(force);
    jwr2Frame.onload = () => jwr2Status('');
    jwr2Frame.srcdoc = jwr2PrepareHtml(html);
  } catch (error) {
    console.error(JWR2_TAG, error);
    jwr2Status('加载失败：' + String(error?.message || error) + '（关闭后重试）', true);
  }
}
function jwr2Open() {
  if (!jwr2ChatId()) return alert('请先进入一个角色聊天档');
  jwr2Root?.querySelector('#jwr2-overlay')?.classList.add('on');
  if (!jwr2Frame?.srcdoc) void jwr2LoadFrame(false);
}

function jwr2Mount() {
  try {
    const old = JWR2_HOST[JWR2_INSTANCE_KEY];
    if (typeof old === 'function' && old !== jwr2Cleanup) old();
  } catch (_) {}
  JWR2_DOC.getElementById(JWR2_ROOT_ID)?.remove();
  const root = JWR2_DOC.createElement('div');
  root.id = JWR2_ROOT_ID;
  if (jwr2ScriptId()) root.setAttribute('script_id', jwr2ScriptId());
  root.innerHTML = `<style>
  #${JWR2_ROOT_ID}{all:initial;position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:-apple-system,"PingFang SC",sans-serif}
  #jwr2-fab{all:unset;box-sizing:border-box;position:absolute;right:18px;bottom:72px;width:54px;height:54px;border-radius:18px;display:grid;place-items:center;pointer-events:auto;cursor:pointer;color:#fff;background:linear-gradient(145deg,#ff9639,#e94738);border:1px solid #ffffff70;box-shadow:0 10px 28px #c7352f66;font:800 22px "Songti SC",serif}
  #jwr2-overlay{position:absolute;inset:0;display:none;place-items:center;pointer-events:auto;background:#07101bbd;backdrop-filter:blur(12px)}#jwr2-overlay.on{display:grid}
  #jwr2-backdrop{position:absolute;inset:0}
  #jwr2-frame{position:relative;width:min(420px,calc(100vw - 24px));height:min(760px,calc(100dvh - 24px));border:0;border-radius:22px;background:#f7f7f7;box-shadow:0 30px 100px #0009;overflow:hidden}
  #jwr2-status{position:absolute;width:min(420px,calc(100vw - 24px));height:min(760px,calc(100dvh - 24px));border-radius:22px;display:grid;place-items:center;padding:24px;box-sizing:border-box;text-align:center;background:#fff;color:#555;font-size:13px;pointer-events:none}#jwr2-status.bad{color:#b72f2f}
  @media(max-width:520px){#jwr2-fab{right:10px;bottom:62px}#jwr2-overlay{place-items:stretch}#jwr2-frame,#jwr2-status{width:100vw;height:100dvh;border-radius:0}}
  </style>
  <button id="jwr2-fab" type="button" aria-label="打开江清让同层微博">博</button>
  <section id="jwr2-overlay"><div id="jwr2-backdrop"></div><iframe id="jwr2-frame" title="江清让同层微博" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe><div id="jwr2-status">准备加载…</div></section>`;
  JWR2_DOC.body.appendChild(root);
  jwr2Root = root;
  jwr2Frame = root.querySelector('#jwr2-frame');
  JWR2_HOST[JWR2_INSTANCE_KEY] = jwr2Cleanup;
  jwr2InstallBridge();
  root.querySelector('#jwr2-fab').onclick = jwr2Open;
  root.querySelector('#jwr2-backdrop').onclick = jwr2Close;
}

function jwr2Cleanup() {
  try { jwr2ChatListener?.stop?.(); } catch (_) {}
  jwr2ChatListener = null;
  try { jwr2Root?.remove(); } catch (_) {}
  jwr2Root = null; jwr2Frame = null; jwr2RemotePromise = null; jwr2UnlockedToken = '';
  try {
    if (JWR2_HOST[JWR2_BRIDGE_KEY]?.owner === jwr2ScriptId()) delete JWR2_HOST[JWR2_BRIDGE_KEY];
    if (JWR2_HOST[JWR2_INSTANCE_KEY] === jwr2Cleanup) delete JWR2_HOST[JWR2_INSTANCE_KEY];
  } catch (_) {}
}

(function jwr2BootImmediately() {
  try {
    jwr2Mount();
    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined' && tavern_events.CHAT_CHANGED) {
      jwr2ChatListener = eventOn(tavern_events.CHAT_CHANGED, () => {
        jwr2UnlockedToken = '';
        if (jwr2Frame) jwr2Frame.srcdoc = '';
        jwr2RemotePromise = null;
        jwr2Close();
      });
    }
    window.addEventListener?.('pagehide', jwr2Cleanup, { once: true });
    window.addEventListener?.('beforeunload', jwr2Cleanup, { once: true });
    console.log(JWR2_TAG, '单轮廓启动器已挂载');
  } catch (error) {
    console.error(JWR2_TAG, '启动失败', error);
    alert('江清让微博启动失败：' + String(error?.message || error));
  }
})();
