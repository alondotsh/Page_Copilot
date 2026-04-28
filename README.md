[Chinese](./README.zh.md)

# 📄 Page Copilot by Alon

Page Copilot by Alon is a Chrome extension for comparing webpages and videos across tabs with AI.

It focuses on three core workflows:
- Reference recently visited pages to compare articles, products, viewpoints, or decisions
- Summarize the current page and continue asking follow-up questions grounded in its content
- Understand YouTube and Bilibili videos through readable transcripts when captions are available

The extension is open-source, local-first, built on Manifest V3, and currently supports Claude and Zhipu GLM with your own API key. More providers can be added over time.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)
![Bring Your Model](https://img.shields.io/badge/Model-Bring%20Your%20Own-0f766e)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

## ✨ Features

- **Cross-page comparison**: compare recently visited articles, products, viewpoints, or options
- **Page summaries and follow-up Q&A**: extract the key ideas from the current page and keep asking grounded questions
- **Video transcript summaries**: summarize YouTube captions and Bilibili subtitles, including readable AI subtitles when the page/account exposes them, with a timed-transcript download option
- **Translate / explain selected text**: work on a specific passage without leaving the page
- **Floating toolbar**: copy, translate, ask, or export selected text to PDF directly from the webpage
- **Bring your own model API**: configure Claude or Zhipu GLM with your own API key; more providers can be added over time

## 🚀 Quick Start

### Requirements

- Google Chrome
- A valid model API key

### Installation

#### Option 1: Developer Mode

1. Clone the repository

```bash
git clone https://github.com/alondotsh/Page_Copilot.git
cd Page_Copilot
```

2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this project directory

#### Option 2: Chrome Web Store

Install the published extension from the Chrome Web Store:

https://chromewebstore.google.com/detail/page-copilot-by-alon/adbompcgkenehcjfpacopbdadcoomppa

Note: the Chrome Web Store version may lag behind the source code in this repository because store updates require review.

### Configuration

1. Click the extension icon to open the side panel
2. Open **Settings**
3. Enter your API key, API URL, and preferred model
4. Save your settings

## 📁 Repository Layout

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

- `assets/`: runtime resources for the extension
- `docs/`: detailed usage and maintenance documentation

## 🛠️ Technical Notes

- **Chrome Extension APIs**: `sidePanel`, `contextMenus`, `storage`, `scripting`, `tabs`
- **Model calls**: compatible with Anthropic Messages-style endpoints
- **Built-in providers**: Claude and GLM
- **Markdown rendering**: lightweight custom renderer with no external dependency, compatible with extension CSP

## 📚 Documentation

- [docs/troubleshooting.md](docs/troubleshooting.md): troubleshooting common issues
- [CONTRIBUTING.md](CONTRIBUTING.md): contribution workflow and PR guidance

## 🔒 Privacy

- API keys are stored locally in the browser
- Metadata for recently viewed pages stays local and is used only for cross-page comparison features
- Page content or selected text is sent to your configured model API only when you explicitly trigger summarization, follow-up Q&A, translation, or explanation

See [PRIVACY.md](PRIVACY.md) for details.

## 📄 License

MIT License

See [LICENSE](LICENSE) for the full license text.

## 🙋 Feedback

- Claude and GLM are configured by default, and you can extend the provider list if needed
- Bug reports, usage questions, and feature requests: https://github.com/alondotsh/Page_Copilot/issues
- For updates or informal feedback:
- X: @alondotsh
- WeChat Official Account: alondotsh
