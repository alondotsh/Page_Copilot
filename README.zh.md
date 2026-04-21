[English](./README.md)

# 📄 Page Copilot by Alon

Page Copilot by Alon 是一个面向网页阅读、总结和跨页面研究的 Chrome 扩展。

它聚焦两类核心任务：

- 总结当前页面，并基于页面内容继续追问
- 引用最近浏览的页面，做跨页面比较、归纳和判断

扩展采用 Manifest V3，支持自带模型 API，不绑定单一浏览器或模型生态。

## ✨ 功能

- **页面总结与追问**：快速提取当前页面内容，继续围绕该页面多轮对话
- **跨页面比较**：引用最近访问的页面，对比文章、产品、观点或方案
- **选中即翻译 / 解释**：对局部文本做即时翻译和解释
- **浮动工具栏**：选中文本后直接复制、翻译、提问或导出 PDF
- **自带模型 API**：可配置不同模型提供商和兼容接口

## 🚀 快速开始

### 前置要求

- Google Chrome 浏览器
- 可用的模型 API Key

### 安装

1. 克隆仓库

```bash
git clone <your-repo-url>
cd Page_Copilot
```

2. 打开 `chrome://extensions/`
3. 开启右上角的“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择当前项目目录

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
- [chrome-web-store/STORE_LISTING.md](chrome-web-store/STORE_LISTING.md)：Chrome 商店上架文案
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
- 仓库发布后，可将这里替换为具体的 GitHub Issues / Discussions 链接
