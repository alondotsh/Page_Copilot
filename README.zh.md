[English](./README.md)

# 📄 Page Copilot by Alon

Page Copilot by Alon 是一个用 AI 对比网页和视频内容的 Chrome 扩展。

它聚焦三类核心任务：

- 引用最近浏览的页面，做跨页面比较、归纳和判断
- 总结当前页面，并基于页面内容继续追问
- 在字幕可读时，通过 YouTube 和 Bilibili 字幕理解视频内容

扩展开源、本地优先，采用 Manifest V3，可通过已测试的提供商预设或自定义兼容接口接入你自己的模型 API Key。

## ✨ 功能

- **跨页面比较**：引用最近访问的页面，对比文章、产品、观点或方案
- **页面总结与追问**：快速提取当前页面内容，继续围绕该页面多轮对话
- **视频字幕总结**：在 YouTube 或 Bilibili 视频页存在字幕时，优先总结字幕内容；B 站账号可读取到的 AI 字幕也会纳入支持，并提供带时间轴的字幕下载入口
- **选中即翻译 / 解释**：对局部文本做即时翻译和解释
- **浮动工具栏**：选中文本后直接复制、翻译、提问或导出 PDF
- **自带模型 API**：可使用已测试的提供商预设，也可以手动填写 OpenAI-compatible 或 Anthropic-compatible 自定义接口

## 🚀 快速开始

### 前置要求

- Google Chrome 浏览器
- 可用的模型 API Key

### 安装

#### 方式一：开发者模式

1. 克隆仓库

```bash
git clone https://github.com/alondotsh/Page_Copilot.git
cd Page_Copilot
```

2. 打开 `chrome://extensions/`
3. 开启右上角的“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择当前项目目录

#### 方式二：Chrome Web Store

从 Chrome Web Store 安装已发布版本：

https://chromewebstore.google.com/detail/page-copilot-by-alon/adbompcgkenehcjfpacopbdadcoomppa

说明：Chrome Web Store 版本可能会因为商店审核晚于本仓库源码。

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
├── PRIVACY.md
├── LICENSE
├── README.md
└── README.zh.md
```

- `assets/`：扩展运行时资源
- `docs/`：详细使用与开发文档

## 🛠️ 技术说明

- **Chrome Extension APIs**：`sidePanel`、`contextMenus`、`storage`、`scripting`、`tabs`
- **模型调用**：兼容 Anthropic Messages 风格接口和 OpenAI-compatible 接口
- **已内置提供商**：智谱 GLM、xAI Grok、Custom OpenAI-compatible、Custom Anthropic-compatible
- **提供商测试状态**：GLM 和 Grok 是当前已测试的预设。其他提供商通常可以通过自定义兼容接口配置。
- **新增提供商**：确认可测试后可以增加新的 provider preset。如果你希望增加某个提供商，欢迎通过 issue 提供提供商名称、API base URL、模型 ID、兼容格式和可复现测试结果。如果愿意提供临时测试 API Key，请私下联系；不要在公开 issue 中粘贴 API Key。
- **Markdown 渲染**：自定义轻量渲染器，无外部依赖，兼容扩展 CSP

## 📚 文档

- [docs/troubleshooting.md](docs/troubleshooting.md)：英文版故障排查文档
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

- 内置提供商预设只保留当前可测试的提供商；也可以手动配置自定义兼容接口
- Bug 反馈、使用问题和功能建议：https://github.com/alondotsh/Page_Copilot/issues
- 关注更新或非正式反馈：
- X：@alondotsh
- 微信公众号：alondotsh
