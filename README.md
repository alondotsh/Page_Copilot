[Chinese](./README.zh.md)

# 📄 Page Copilot by Alon

Page Copilot by Alon is a Chrome extension for webpage reading, summarization, and cross-page research.

It focuses on two core workflows:
- Summarize the current page and continue asking follow-up questions grounded in its content
- Reference recently visited pages to compare articles, products, viewpoints, or decisions

The extension is built on Manifest V3 and supports bring-your-own model APIs, so you are not locked into a single browser or model ecosystem.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)
![Bring Your Model](https://img.shields.io/badge/Model-Bring%20Your%20Own-0f766e)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

## ✨ Features

- **Page summaries and follow-up Q&A**: extract the key ideas from the current page and keep asking grounded questions
- **Cross-page comparison**: compare recently visited articles, products, viewpoints, or options
- **Translate / explain selected text**: work on a specific passage without leaving the page
- **Floating toolbar**: copy, translate, ask, or export selected text to PDF directly from the webpage
- **Bring your own model API**: configure different providers or compatible endpoints

## 🚀 Quick Start

### Requirements

- Google Chrome
- A valid model API key

### Installation

1. Clone the repository

```bash
git clone <your-repo-url>
cd Page_Copilot
```

2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this project directory

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
├── chrome-web-store/
├── PRIVACY.md
├── LICENSE
├── README.md
└── README.zh.md
```

- `assets/`: runtime resources for the extension
- `docs/`: detailed usage and maintenance documentation
- `chrome-web-store/`: Chrome Web Store screenshots, promo assets, and listing copy

## 🛠️ Technical Notes

- **Chrome Extension APIs**: `sidePanel`, `contextMenus`, `storage`, `scripting`, `tabs`
- **Model calls**: compatible with Anthropic Messages-style endpoints
- **Built-in providers**: Claude and GLM
- **Markdown rendering**: lightweight custom renderer with no external dependency, compatible with extension CSP

## 📚 Documentation

- [docs/troubleshooting.md](docs/troubleshooting.md): troubleshooting common issues
- [docs/maintainer-icons.md](docs/maintainer-icons.md): maintainer notes for icons and promo assets
- [chrome-web-store/STORE_LISTING.md](chrome-web-store/STORE_LISTING.md): Chrome Web Store listing copy
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
- Use repository Issues for bug reports
- Use Discussions for usage questions, ideas, and open-ended product feedback
- Replace these placeholders with the final Issues / Discussions links after the repository is published
