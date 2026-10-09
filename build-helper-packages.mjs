import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const launcherPath = path.join(root, 'launcher.js');
const htmlPath = path.join(root, 'weibo.html');
const remotePath = path.join(root, '酒馆助手脚本_酱微博.json');
const embeddedPath = path.join(root, '酒馆助手脚本_酱微博_完整内嵌测试版.json');

const launcher = fs.readFileSync(launcherPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const remote = JSON.parse(fs.readFileSync(remotePath, 'utf8'));
const embedded = JSON.parse(fs.readFileSync(embeddedPath, 'utf8'));

// 酒馆助手会把 content 放进真正的 <script> 元素中执行。仅 JSON.stringify
// 不会转义 HTML 的闭合 script 标签，浏览器会在内嵌 HTML 中途提前结束启动器。
// 把所有 “<” 编码成 JavaScript 字符串转义：运行时值不变，同时源码不会
// 出现 </script> 或 <!-- 这类 HTML parser sentinel。
function scriptElementSafeString(value) {
  return JSON.stringify(String(value)).replaceAll('<', '\\u003c');
}

function buildEmbeddedSource() {
  const marker = '// 导出角色酒馆脚本时只替换这一行；null 表示使用远程 HTML 的系统默认预设。';
  const presetLine = 'const JWR2_EMBEDDED_PRESET = null;';
  const anchor = `${marker}\n${presetLine}`;
  if (!launcher.includes(anchor)) throw new Error('找不到内嵌常量插入位置');
  const replacement = `${marker}\nconst JWR2_EMBEDDED_HTML = ${scriptElementSafeString(html)};\n${presetLine}`;
  // 使用函数返回替换文本，避免 HTML 内的 $&、$`、$' 被 String.replace
  // 当成特殊替换记号，进而把 launcher 片段混入 JavaScript 字符串。
  return launcher.replace(anchor, () => replacement);
}

remote.content = launcher;
remote.info = '酱微博启动器；远程加载前端。构建：20261009-linked-lore-v8。';
embedded.content = buildEmbeddedSource();
embedded.info = '完整内嵌测试版：同步显示热梗与 NPC 世界书绑定，按用途独立保存；安全转义内嵌 HTML。构建：20261009-linked-lore-v8。';

fs.writeFileSync(remotePath, `${JSON.stringify(remote, null, 2)}\n`);
fs.writeFileSync(embeddedPath, `${JSON.stringify(embedded, null, 2)}\n`);

if (/<\/script/i.test(embedded.content) || /<!--/.test(embedded.content)) {
  throw new Error('内嵌启动器仍含 HTML parser sentinel');
}

console.log(`built ${path.basename(remotePath)} (${remote.content.length} chars)`);
console.log(`built ${path.basename(embeddedPath)} (${embedded.content.length} chars)`);
