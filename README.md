# 江清让同层微博 · 单轮廓档位版

这是不覆盖旧版的全新仓库。微博的发帖、评论、私信、推荐流与个人主页功能沿用原实现；本版重做的是启动壳、设置、存档、API 与上下文注入。

## 安装

1. 下载 `酒馆助手脚本_江清让同层微博_单轮廓档位版.json`。
2. 在酒馆助手中导入并启用。
3. 进入任意角色聊天，点击右下角“博”悬浮按钮。

## 存储分层

- 全局设置：写入 SillyTavern `extension_settings.jiang_weibo_oneframe_v2`，跟随酒馆服务器配置。
- 当前聊天记录：写入 `chatMetadata.jiang_weibo_oneframe_v2`，不同聊天档自动绑定不同微博记录。
- 档位初始化：切入档位时，将初始化提示词与 `wb_lore` 写入首楼，并同步当前 swipe。
- `localStorage`：只作旧数据兼容和离线镜像，不再作为唯一主存。

## API 与上下文

- 默认使用酒馆当前主 API，通过 `generateRaw` 发送微博专用消息数组。
- 选择独立副 API 后才改走副通道；Token 使用 AES-GCM + PBKDF2 加密，解锁口令不保存。
- 注入顺序：档位初始化提示词 → 角色/Persona/场景 → 世界书 → 最近聊天 → 微博快照 → 当前任务。
- 世界书支持自动读取激活条目，也支持手动勾选并把正文快照随聊天保存。

设计参考了 [ST-BaiBai-Book](https://github.com/baibai-git/ST-BaiBai-Book) 的 `extension_settings`、`chatMetadata`、主 API 回退与上下文构建方式。
