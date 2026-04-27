[English](./README.md)

# 📄 Page Copilot by Alon

Page Copilot by Alon 是一个用 AI 对比网页和视频内容的 Chrome 扩展。

它聚焦三类核心任务：

- 引用最近浏览的页面，做跨页面比较、归纳和判断
- 总结当前页面，并基于页面内容继续追问
- 在字幕可读时，通过 YouTube 和 Bilibili 字幕理解视频内容

扩展开源、本地优先，采用 Manifest V3，目前支持自带 Claude 或智谱 GLM API Key，后续可继续扩展更多提供商。

## ✨ 功能

- **跨页面比较**：引用最近访问的页面，对比文章、产品、观点或方案
- **页面总结与追问**：快速提取当前页面内容，继续围绕该页面多轮对话
- **视频字幕总结**：在 YouTube 或 Bilibili 视频页存在字幕时，优先总结字幕内容；B 站账号可读取到的 AI 字幕也会纳入支持，并提供带时间轴的字幕下载入口
- **选中即翻译 / 解释**：对局部文本做即时翻译和解释
- **浮动工具栏**：选中文本后直接复制、翻译、提问或导出 PDF
- **自带模型 API**：可配置 Claude 或智谱 GLM 的 API Key，后续可继续扩展更多提供商

## 🚀 快速开始

### 前置要求

- Google Chrome 浏览器
- 可用的模型 API Key

### 安装

#### 方式一：Chrome Web Store

从 Chrome Web Store 安装已发布版本：

https://chromewebstore.google.com/detail/page-copilot-by-alon/adbompcgkenehcjfpacopbdadcoomppa

#### 方式二：开发者模式

1. 克隆仓库

```bash
git clone https://github.com/alondotsh/Page_Copilot.git
cd Page_Copilot
```

2. 打开 `chrome://extensions/`
3. 开启右上角的“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择当前项目目录

### 版本与 Chrome 商店

`main` 分支包含最新公开源码。Chrome 商店版本可能因为审核流程暂时落后于 GitHub。

如需查看提交到 Chrome 商店的可安装快照，请参考 GitHub Releases。

### 配置

1. 点击扩展图标打开侧边栏
2. 点击右上角设置按钮
3. 填入 API Key、API URL 和模型
4. 保存设置

## 📁 目录结构

```text
Page_Copilot/
├── manifest.json
├── background.js
├── content.js
├── sidepanel.html
├── sidepanel.js
├── styles.css
├── floating-toolbar.css
├── assets/
├── docs/
├── chrome-web-store/
├── PRIVACY.md
├── LICENSE
├── README.md
└── README.zh.md
```

- `assets/`：扩展运行时资源
- `docs/`：详细使用与开发文档
- `chrome-web-store/`：Chrome 商店截图、宣传图和上架文案

## 🛠️ 技术说明

- **Chrome Extension APIs**：`sidePanel`、`contextMenus`、`storage`、`scripting`、`tabs`
- **模型调用**：兼容 Anthropic Messages 风格接口
- **已内置提供商**：Claude、GLM
- **Markdown 渲染**：自定义轻量渲染器，无外部依赖，兼容扩展 CSP

## 📚 文档

- [docs/troubleshooting.md](docs/troubleshooting.md)：英文版故障排查文档
- [docs/maintainer-icons.md](docs/maintainer-icons.md)：英文版维护者图标与素材说明
- [CONTRIBUTING.md](CONTRIBUTING.md)：协作、提问和提交 PR 的方式

## 🔒 隐私

- API Key 保存在浏览器本地存储中
- 最近浏览页面的元数据仅保存在本地，用于跨页面比较
- 只有在你主动发起总结、追问、翻译或解释时，相关内容才会发送到你配置的模型 API

详细说明见 [PRIVACY.md](PRIVACY.md)。

## 📄 许可证

MIT License

完整许可证见 [LICENSE](LICENSE)。

## 🙋 反馈

- 当前默认支持智谱模型；如需接入其他模型，可继续扩展提供商配置
- Bug 反馈优先通过仓库 Issues 处理
- 使用问题、想法讨论和开放式交流优先通过仓库 Discussions 处理
- 关注更新或非正式反馈：
- X：@alondotsh
- 微信公众号：alondotsh
- 仓库发布后，可将这里替换为具体的 GitHub Issues / Discussions 链接
