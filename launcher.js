/** 酱微博：单轮廓远程前端启动器 */
const JWR2_TAG = '[酱微博]';
const JWR2_FRONTEND_URL = 'https://fchris1219-del.github.io/jiang-weibo-oneframe-v2/weibo.html?v=ee68adb';
const JWR2_ROOT_ID = 'jwr2-root';
const JWR2_BRIDGE_KEY = '__JWR2_BRIDGE__';
const JWR2_INSTANCE_KEY = '__JWR2_CLEANUP__';
const JWR2_SETTINGS_KEY = 'jiang_weibo_oneframe_v2';
const JWR2_CHAT_KEY = 'jiang_weibo_oneframe_v2';
// 导出角色酒馆脚本时只替换这一行；null 表示使用远程 HTML 的系统默认预设。
const JWR2_EMBEDDED_PRESET = null;

const JWR2_DOC = (() => {
  try { return window.parent && window.parent.document ? window.parent.document : document; }
  catch (_) { return document; }
})();
const JWR2_HOST = JWR2_DOC.defaultView || window.parent || window;

let jwr2Root = null;
let jwr2Frame = null;
let jwr2RemotePromise = null;
let jwr2ChatListener = null;
let jwr2DragCleanup = null;
let jwr2ViewportCleanup = null;

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
  let charName = String(data?.name || ctx?.name2 || '角色');
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
  const embedded = jwr2Clone(JWR2_EMBEDDED_PRESET, null);
  const embeddedId = embedded?.id ? String(embedded.id) : '';
  return {
    version: 6,
    api: { mode: 'main', source: 'custom', url: '', model: '', models: [], temperature: 0.8, maxTokens: 4096, token: '' },
    context: { mode: 'recent', recentMessages: 3, manualSummary: '', includeChar: true, includePersona: true, includeScenario: true, includeWorldInfo: true, loreScanKeyword: '🩶', nativePrompt: 'detailed', nativePromptText: '', customEntries: [], injectMain: false, ...(embedded?.config || {}) },
    presetTemplates: embedded ? [embedded] : [],
    activePresetTemplateId: embeddedId || 'system',
    embeddedPresetId: embeddedId,
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
  const embedded = jwr2Clone(JWR2_EMBEDDED_PRESET, null);
  const embeddedChanged = !!(embedded?.id && String(raw.embeddedPresetId || '') !== String(embedded.id));
  if (embeddedChanged) {
    out.context = { ...base.context, ...(embedded.config || {}) };
    out.activePresetTemplateId = String(embedded.id);
    out.embeddedPresetId = String(embedded.id);
  }
  const templateMap = new Map();
  [...(Array.isArray(raw.presetTemplates) ? raw.presetTemplates : []), ...(embedded ? [embedded] : [])].forEach((item) => {
    if (item?.id) templateMap.set(String(item.id), jwr2Clone(item, item));
  });
  out.presetTemplates = [...templateMap.values()];
  out.context.customEntries = Array.isArray(out.context.customEntries) ? out.context.customEntries : [];
  out.slots = Array.isArray(raw.slots) && raw.slots.length ? jwr2Clone(raw.slots, base.slots) : base.slots;
  out.slots = out.slots.map((slot) => ({ ...slot, context: { ...base.context, ...(embeddedChanged ? (embedded?.config || {}) : (slot?.context || {})), customEntries: Array.isArray(embeddedChanged ? embedded?.config?.customEntries : slot?.context?.customEntries) ? (embeddedChanged ? embedded.config.customEntries : slot.context.customEntries) : [] } }));
  if (Number(raw.version || 0) < 3 && Number(raw.context?.recentMessages) === 12) out.context.recentMessages = 3;
  out.version = 6;
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

function jwr2ApiPublicState() {
  const api = jwr2ReadSettings().api;
  const { token, encryptedToken, ...publicApi } = api;
  return { ...publicApi, hasToken: !!token };
}
function jwr2PublicSettings() {
  const settings = jwr2ReadSettings();
  return { ...settings, api: jwr2ApiPublicState() };
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
    { role: 'system', content: '你是小微博数据生成器。严格按任务要求输出协议标签，不解释。' },
    { role: 'user', content: input },
  ];
}
async function jwr2RequestSide(request, override = {}) {
  const api = jwr2ReadSettings().api;
  if (api.mode !== 'side') throw new Error('副 API 未启用');
  if (!api.url || !api.model) throw new Error('副 API 地址或模型为空');
  if (!api.token) throw new Error('尚未保存副 API Token');
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
    ? { chat_completion_source: 'custom', custom_url: base, custom_include_headers: JSON.stringify({ Authorization: 'Bearer ' + api.token }), ...common }
    : { chat_completion_source: api.source || 'openai', reverse_proxy: base, proxy_password: api.token, ...common };
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

async function jwr2SaveToken(token) {
  const value = String(token || '').trim();
  if (!value) throw new Error('请输入 Token');
  jwr2WriteSettings({ api: { token: value, encryptedToken: '' } });
  return jwr2ApiPublicState();
}
function jwr2CollectModelIds(data) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id); out.push(id);
  };
  const walk = (value, depth = 0) => {
    if (depth > 5 || value == null) return;
    if (Array.isArray(value)) return value.forEach((item) => walk(item, depth + 1));
    if (typeof value !== 'object') return;
    if (typeof value.id === 'string') add(value.id);
    else if (typeof value.name === 'string' && !/^(data|models?|object)$/i.test(value.name)) add(value.name);
    ['data', 'models', 'items', 'result'].forEach((key) => { if (value[key] != null) walk(value[key], depth + 1); });
  };
  walk(data);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
async function jwr2ListApiModels(draft = {}) {
  jwr2WriteSettings({ api: draft });
  const api = jwr2ReadSettings().api;
  if (api.mode !== 'side') return [];
  if (!api.url) throw new Error('请先填写 API 基础地址');
  if (!api.token) throw new Error('请先保存 Token');
  const ctx = jwr2Context();
  const base = jwr2NormalizeUrl(api.url);
  const common = api.source === 'custom'
    ? { chat_completion_source: 'custom', custom_url: base, custom_include_headers: JSON.stringify({ Authorization: 'Bearer ' + api.token }) }
    : { chat_completion_source: api.source || 'openai', reverse_proxy: base, proxy_password: api.token };
  let lastError = null;
  try {
    if (!ctx?.getRequestHeaders) throw new Error('酒馆请求头不可用');
    const res = await fetch('/api/backends/chat-completions/status', {
      method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(common),
    });
    const raw = await res.text();
    let data = null; try { data = JSON.parse(raw); } catch (_) {}
    if (!res.ok) throw new Error('HTTP ' + res.status + '：' + String(data?.error?.message || data?.message || raw).slice(0, 180));
    const models = jwr2CollectModelIds(data);
    if (models.length) {
      jwr2WriteSettings({ api: { models, model: models.includes(api.model) ? api.model : models[0] } });
      return models;
    }
  } catch (error) { lastError = error; }
  try {
    const res = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + api.token, Accept: 'application/json' } });
    const raw = await res.text();
    let data = null; try { data = JSON.parse(raw); } catch (_) {}
    if (!res.ok) throw new Error('HTTP ' + res.status + '：' + String(data?.error?.message || data?.message || raw).slice(0, 180));
    const models = jwr2CollectModelIds(data);
    if (!models.length) throw new Error('接口未返回可用模型');
    jwr2WriteSettings({ api: { models, model: models.includes(api.model) ? api.model : models[0] } });
    return models;
  } catch (error) {
    throw new Error('拉取模型失败：' + String(error?.message || lastError?.message || error));
  }
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
    // 酒馆助手的 getChatMessages 必须传楼层范围；空参数在部分版本中只会返回单楼。
    // 这里固定读取当前聊天的全部楼层，并保留隐藏状态，交给前端按“当前可见 / 全部前文”筛选。
    getAllChatMessages: () => typeof getChatMessages === 'function'
      ? getChatMessages('0-{{lastMessageId}}', { role: 'all', hide_state: 'all', include_swipes: false })
      : [],
    // 柏宝书仅通过公开只读 API 获取；桥接由酒馆主窗口执行，避免 iframe 作用域差异。
    // 柏宝书只读 API：不设 before，包含最近已生成有效摘要的楼层。
    getBaiBaiHistory: () => {
      const api=JWR2_HOST.STBaiBaiBook;
      if(!api || typeof api.getHistory!=='function')return {available:false,reason:'柏宝书 getHistory 公共接口未就绪'};
      try{
        const history=api.getHistory();
        if(!history || typeof history!=='object')return {available:false,reason:'柏宝书未返回剧情摘要'};
        return {available:true,chatId:String(history.chat?.id||''),text:String(history.relativeText||history.text||''),nodes:Array.isArray(history.nodes)?history.nodes.length:0,coverage:history.coverage||null};
      }catch(error){return {available:false,reason:String(error?.message||error)};}
    },
    hasBaiBaiBook: () => !!(JWR2_HOST.STBaiBaiBook?.getHistory),
    // 仅读取柏宝书公开快照中的「眼下局势」。
    getBaiBaiSceneFocus: () => {
      const api=JWR2_HOST.STBaiBaiBook;
      if(!api||typeof api.getSnapshot!=='function')return {available:false,reason:'柏宝书公开 API 尚未加载'};
      try{
        const snap=api.getSnapshot();
        if(!snap||typeof snap!=='object')return {available:false,reason:'柏宝书未返回当前聊天快照'};
        const f=snap.state?.sceneFocus;
        const sceneFocus=f&&typeof f==='object'?{
          situation:String(f.situation||'').trim(),
          participants:Array.isArray(f.participants)?f.participants.map(String):[],
          tension:String(f.tension||'').trim(),
          pendingBeat:String(f.pendingBeat||'').trim(),
          updatedTime:String(f.updatedTime||'').trim()
        }:null;
        return {available:true,chatId:String(snap.chat?.id||''),sceneFocus};
      }catch(error){return {available:false,reason:String(error?.message||error)};}
    },
    getSettings: () => jwr2PublicSettings(),
    getEmbeddedPreset: () => jwr2Clone(JWR2_EMBEDDED_PRESET, null),
    saveSettings: (value) => jwr2WriteSettings(value),
    getChatStore: () => jwr2ReadChatStore(),
    saveChatStore: (value) => jwr2WriteChatStore(value),
    writeFirstFloor: (slot) => jwr2WriteFirstFloor(slot),
    setMainInjection: (text, enabled) => jwr2SetMainInjection(text, enabled),
    getApiState: () => jwr2ApiPublicState(),
    saveApiSettings: (value) => jwr2WriteSettings({ api: value }),
    saveApiToken: (token) => jwr2SaveToken(token),
    listApiModels: (draft) => jwr2ListApiModels(draft),
    clearApiToken: () => { jwr2WriteSettings({ api: { token: '', encryptedToken: '' } }); return jwr2ApiPublicState(); },
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
  #${JWR2_ROOT_ID}{all:initial;position:fixed;inset:auto;top:0;left:0;width:100vw;height:100vh;z-index:2147483000;pointer-events:none;overflow:visible;isolation:isolate;font-family:-apple-system,"PingFang SC",sans-serif}
  #jwr2-fab{all:unset;box-sizing:border-box;position:absolute;right:18px;bottom:72px;width:54px;height:54px;border-radius:18px;display:grid;place-items:center;pointer-events:auto;cursor:pointer;color:#fff;background:linear-gradient(145deg,#ff9639,#e94738);border:1px solid #ffffff70;box-shadow:0 10px 28px #c7352f66;font:800 22px "Songti SC",serif}
  #jwr2-overlay{position:absolute;inset:0;display:none;place-items:center;pointer-events:auto;background:#07101bbd;backdrop-filter:blur(12px)}#jwr2-overlay.on{display:grid}
  #jwr2-backdrop{position:absolute;inset:0}
  #jwr2-frame{position:relative;width:min(420px,calc(100% - 24px));height:min(760px,calc(100% - 24px));border:0;border-radius:22px;background:#f7f7f7;box-shadow:0 30px 100px #0009;overflow:hidden}
  #jwr2-status{position:absolute;width:min(420px,calc(100% - 24px));height:min(760px,calc(100% - 24px));border-radius:22px;display:grid;place-items:center;padding:24px;box-sizing:border-box;text-align:center;background:#fff;color:#555;font-size:13px;pointer-events:none}#jwr2-status.bad{color:#b72f2f}
  @media(max-width:520px){#jwr2-fab{right:10px;bottom:62px}#jwr2-overlay{place-items:stretch;padding:max(10px,env(safe-area-inset-top)) 6px max(8px,env(safe-area-inset-bottom));box-sizing:border-box}#jwr2-frame,#jwr2-status{width:100%;height:100%;border-radius:14px}}
  </style>
  <button id="jwr2-fab" type="button" aria-label="打开微博">博</button>
  <section id="jwr2-overlay"><div id="jwr2-backdrop"></div><iframe id="jwr2-frame" title="微博" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe><div id="jwr2-status">准备加载…</div></section>`;
  JWR2_DOC.body.appendChild(root);
  jwr2Root = root;
  jwr2Frame = root.querySelector('#jwr2-frame');
  const syncViewport = () => {
    const viewport = JWR2_HOST.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || JWR2_HOST.innerWidth || 390));
    const height = Math.max(1, Math.round(viewport?.height || JWR2_HOST.innerHeight || 760));
    const left = Math.round(viewport?.offsetLeft || 0);
    const top = Math.round(viewport?.offsetTop || 0);
    root.style.left = left + 'px'; root.style.top = top + 'px';
    root.style.width = width + 'px'; root.style.height = height + 'px';
  };
  syncViewport();
  JWR2_HOST.visualViewport?.addEventListener?.('resize', syncViewport);
  JWR2_HOST.visualViewport?.addEventListener?.('scroll', syncViewport);
  JWR2_HOST.addEventListener?.('resize', syncViewport);
  JWR2_HOST.addEventListener?.('orientationchange', syncViewport);
  jwr2ViewportCleanup = () => {
    JWR2_HOST.visualViewport?.removeEventListener?.('resize', syncViewport);
    JWR2_HOST.visualViewport?.removeEventListener?.('scroll', syncViewport);
    JWR2_HOST.removeEventListener?.('resize', syncViewport);
    JWR2_HOST.removeEventListener?.('orientationchange', syncViewport);
  };
  JWR2_HOST[JWR2_INSTANCE_KEY] = jwr2Cleanup;
  jwr2InstallBridge();
  const fab = root.querySelector('#jwr2-fab');
  const posKey = 'jwr2_fab_position_v1';
  let moved = false;
  const clampFab = (x, y) => ({
    x: Math.max(8, Math.min((root.clientWidth || JWR2_HOST.innerWidth || 390) - 62, Number(x) || 8)),
    y: Math.max(8, Math.min((root.clientHeight || JWR2_HOST.innerHeight || 760) - 62, Number(y) || 8)),
  });
  const placeFab = (value) => {
    const p = clampFab(value?.x, value?.y);
    fab.style.left = p.x + 'px'; fab.style.top = p.y + 'px';
    fab.style.right = 'auto'; fab.style.bottom = 'auto';
    return p;
  };
  try {
    const saved = JSON.parse(JWR2_HOST.localStorage?.getItem(posKey) || 'null');
    if (saved) placeFab(saved);
  } catch (_) {}
  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    const rect = fab.getBoundingClientRect?.() || { left: 0, top: 0 };
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const startX = event.clientX; const startY = event.clientY;
    moved = false;
    fab.setPointerCapture?.(event.pointerId);
    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 5) moved = true;
      const p = placeFab({ x: ev.clientX - offsetX, y: ev.clientY - offsetY });
      if (moved) ev.preventDefault?.();
      try { JWR2_HOST.localStorage?.setItem(posKey, JSON.stringify(p)); } catch (_) {}
    };
    const onUp = () => {
      JWR2_DOC.removeEventListener?.('pointermove', onMove, true);
      JWR2_DOC.removeEventListener?.('pointerup', onUp, true);
      setTimeout(() => { moved = false; }, 0);
    };
    JWR2_DOC.addEventListener?.('pointermove', onMove, true);
    JWR2_DOC.addEventListener?.('pointerup', onUp, true);
  };
  fab.addEventListener?.('pointerdown', onPointerDown);
  fab.onclick = () => { if (!moved) jwr2Open(); };
  jwr2DragCleanup = () => fab.removeEventListener?.('pointerdown', onPointerDown);
  root.querySelector('#jwr2-backdrop').onclick = jwr2Close;
}

function jwr2Cleanup() {
  // 脚本关闭后也不能留下过期的主对话注入。
  if (JWR2_HOST[JWR2_INSTANCE_KEY] === jwr2Cleanup) jwr2SetMainInjection('', false);
  try { jwr2DragCleanup?.(); } catch (_) {}
  jwr2DragCleanup = null;
  try { jwr2ViewportCleanup?.(); } catch (_) {}
  jwr2ViewportCleanup = null;
  try { jwr2ChatListener?.stop?.(); } catch (_) {}
  jwr2ChatListener = null;
  try { jwr2Root?.remove(); } catch (_) {}
  jwr2Root = null; jwr2Frame = null; jwr2RemotePromise = null;
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
        // ST 的 setExtensionPrompt 是持久槽；必须清除上一聊天的 wb_lore。
        jwr2SetMainInjection('', false);
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
    alert('酱微博启动失败：' + String(error?.message || error));
  }
})();
