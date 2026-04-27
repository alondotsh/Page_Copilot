// Side panel logic - improved v4 (streaming + persisted history + system prompt)

console.log('[Page Copilot] Side panel script loaded (v4)');

// Lightweight Markdown renderer
function renderMarkdown(text) {
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  let html = escapeHtml(text);

  // 1. Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'text';
    return `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span class="code-lang">${language}</span>
          <button class="copy-btn">Copy Code</button>
        </div>
        <pre><code class="language-${language}">${code.trim()}</code></pre>
      </div>
    `;
  });

  // 2. Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 3. Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // 4. Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 5. Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 6. Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    if (match.includes('<ul>')) return match;
    return '<ol>' + match.replace(/<ul>|<\/ul>/g, '') + '</ol>';
  });

  // 7. Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // 8. Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // 9. Paragraph handling
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/\n/g, '<br>');

  // Cleanup
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p><div/g, '<div');
  html = html.replace(/<\/div><\/p>/g, '</div>');
  html = html.replace(/<p><br><\/p>/g, '');

  return html;
}

// Model configuration
const MODEL_CONFIG = {
  claude: {
    name: 'Anthropic Claude',
    defaultUrl: 'https://api.anthropic.com',
    models: {
      chat: [
        { value: '', label: 'Default (use API default model)' },
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (recommended)' },
        { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (most capable)' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (fastest)' }
      ],
      translate: [
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (recommended, fast)' },
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (higher quality)' },
        { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (most capable)' }
      ]
    }
  },
  glm: {
    name: 'Zhipu GLM',
    defaultUrl: 'https://open.bigmodel.cn/api/anthropic',
    models: {
      chat: [
        { value: 'glm-4.7', label: 'GLM-4.7 (recommended)' },
        { value: '', label: 'Default (use API default model)' }
      ],
      translate: [
        { value: 'glm-4.7', label: 'GLM-4.7' }
      ]
    }
  }
};

// Global state
let conversationHistory = [];
let lastSummarySource = null;
let lastTranscriptDownload = null;
let currentProvider = 'claude';  // Currently selected provider
let config = {
  apiKey: '',
  apiUrl: '',
  model: '',
  translateModel: '',
  translateBatchSize: 30,
  systemPrompt: '',
  contextPageCount: 10,
  retentionHours: 48
};

// Per-provider configuration store
let providerConfigs = {
  claude: {
    apiKey: '',
    apiUrl: 'https://api.anthropic.com',
    model: '',
    translateModel: 'claude-3-5-haiku-20241022',
    translateBatchSize: 30,
    systemPrompt: '',
    contextPageCount: 10,
    retentionHours: 48
  },
  glm: {
    apiKey: '',
    apiUrl: 'https://open.bigmodel.cn/api/anthropic',
    model: 'glm-4.7',
    translateModel: 'glm-4.7',
    translateBatchSize: 30,
    systemPrompt: '',
    contextPageCount: 10,
    retentionHours: 48
  }
};

// DOM elements
const elements = {
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  apiProvider: document.getElementById('apiProvider'),
  apiKey: document.getElementById('apiKey'),
  apiUrl: document.getElementById('apiUrl'),
  model: document.getElementById('model'),
  translateModel: document.getElementById('translateModel'),
  translateBatchSize: document.getElementById('translateBatchSize'),
  systemPrompt: document.getElementById('systemPrompt'),
  contextPageCount: document.getElementById('contextPageCount'),
  retentionHours: document.getElementById('retentionHours'),
  saveSettings: document.getElementById('saveSettings'),
  apiStatus: document.getElementById('apiStatus'),

  summarizeBtn: document.getElementById('summarizeBtn'),
  translateBtn: document.getElementById('translateBtn'),
  explainBtn: document.getElementById('explainBtn'),
  historyBtn: document.getElementById('historyBtn'),
  translatePageBtn: document.getElementById('translatePageBtn'),

  historyPanel: document.getElementById('historyPanel'),
  historyList: document.getElementById('historyList'),
  closeHistoryBtn: document.getElementById('closeHistoryBtn'),

  messages: document.getElementById('messages'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  clearBtn: document.getElementById('clearBtn')
};

// Initialize
async function init() {
  console.log('[Page Copilot] Initializing side panel...');
  await loadConfig();
  await loadHistory(); // Load stored history
  updateModelOptions();  // Refresh model options
  bindEvents();
  updateUIState();
  console.log('[Page Copilot] Side panel initialized');
}

// Update model select options
function updateModelOptions() {
  const providerConfig = MODEL_CONFIG[currentProvider];

  // Update chat model options
  elements.model.innerHTML = providerConfig.models.chat
    .map(m => `<option value="${m.value}">${m.label}</option>`)
    .join('');

  // Update translation model options
  elements.translateModel.innerHTML = providerConfig.models.translate
    .map(m => `<option value="${m.value}">${m.label}</option>`)
    .join('');
}

// Switch provider
function switchProvider(provider) {
  // Save the current provider configuration
  providerConfigs[currentProvider] = { ...config };

  // Switch to the new provider
  currentProvider = provider;
  const newConfig = providerConfigs[provider];

  // Refresh config
  config = { ...newConfig };

  // Refresh UI
  elements.apiProvider.value = provider;
  elements.apiKey.value = config.apiKey || '';
  elements.apiUrl.value = config.apiUrl || MODEL_CONFIG[provider].defaultUrl;
  elements.model.value = config.model || '';
  elements.translateModel.value = config.translateModel || '';
  elements.translateBatchSize.value = config.translateBatchSize?.toString() || '30';
  elements.systemPrompt.value = config.systemPrompt || '';
  elements.contextPageCount.value = config.contextPageCount?.toString() || '10';
  elements.retentionHours.value = config.retentionHours?.toString() || '48';

  // Refresh model options
  updateModelOptions();

  // Re-apply selected models
  elements.model.value = config.model || '';
  elements.translateModel.value = config.translateModel || '';

  console.log('[Page Copilot] Switched provider:', provider);
}

// Load configuration
async function loadConfig() {
  try {
    const result = await chrome.storage.local.get([
      'currentProvider',
      'claudeConfig',
      'glmConfig'
    ]);

    // Load current provider
    currentProvider = result.currentProvider || 'claude';

    // Load per-provider configuration
    if (result.claudeConfig) {
      providerConfigs.claude = { ...providerConfigs.claude, ...result.claudeConfig };
    }
    if (result.glmConfig) {
      providerConfigs.glm = { ...providerConfigs.glm, ...result.glmConfig };
    }

    // Use the active provider configuration
    config = { ...providerConfigs[currentProvider] };

    // Refresh UI
    elements.apiProvider.value = currentProvider;
    elements.apiKey.value = config.apiKey || '';
    elements.apiUrl.value = config.apiUrl || MODEL_CONFIG[currentProvider].defaultUrl;
    elements.model.value = config.model || '';
    elements.translateModel.value = config.translateModel || '';
    elements.translateBatchSize.value = config.translateBatchSize?.toString() || '30';
    elements.systemPrompt.value = config.systemPrompt || '';
    elements.contextPageCount.value = config.contextPageCount?.toString() || '10';
    elements.retentionHours.value = config.retentionHours?.toString() || '48';

    updateAPIStatus();
  } catch (error) {
    console.error('[Page Copilot] Failed to load config:', error);
  }
}

// Save configuration
async function saveConfig() {
  const provider = elements.apiProvider.value;

  // Build configuration object
  const configToSave = {
    apiKey: elements.apiKey.value.trim(),
    apiUrl: elements.apiUrl.value.trim() || MODEL_CONFIG[provider].defaultUrl,
    model: elements.model.value,
    translateModel: elements.translateModel.value || MODEL_CONFIG[provider].models.translate[0].value,
    translateBatchSize: parseInt(elements.translateBatchSize.value) || 30,
    systemPrompt: elements.systemPrompt.value.trim(),
    contextPageCount: parseInt(elements.contextPageCount.value) || 10,
    retentionHours: parseInt(elements.retentionHours.value) || 48
  };

  // Update the active provider configuration
  providerConfigs[provider] = configToSave;
  config = configToSave;
  currentProvider = provider;

  try {
    await chrome.storage.local.set({
      currentProvider: provider,
      claudeConfig: providerConfigs.claude,
      glmConfig: providerConfigs.glm
    });

    addSystemMessage(`✅ Settings saved (${MODEL_CONFIG[provider].name})`);
    updateAPIStatus();
    elements.settingsPanel.classList.add('hidden');
  } catch (error) {
    addSystemMessage('❌ Failed to save settings: ' + error.message, 'error');
  }
}

// Load stored history with retention filtering
async function loadHistory() {
  try {
    const result = await chrome.storage.local.get(['conversationHistory', 'lastSummarySource']);
    lastSummarySource = result.lastSummarySource || null;

    if (result.conversationHistory && Array.isArray(result.conversationHistory)) {
      const history = result.conversationHistory;

      // Retention filtering for expired messages
      const retentionMs = (config.retentionHours || 48) * 60 * 60 * 1000;
      const cutoff = retentionMs > 0 ? Date.now() - retentionMs : 0;

      conversationHistory = history.filter(msg => {
        // A retention value of 0 means never clear automatically
        if (retentionMs === 0) return true;
        // Check the message timestamp
        return msg.timestamp && msg.timestamp > cutoff;
      });

      // Persist the trimmed history if expired messages were removed
      if (conversationHistory.length !== history.length) {
        const cleanedCount = history.length - conversationHistory.length;
        console.log(`[Page Copilot] Cleaned ${cleanedCount} expired messages`);
        await chrome.storage.local.set({ conversationHistory });
      }

      // Render saved messages
      conversationHistory.forEach(msg => {
        addMessage(msg.content, msg.role, false); // false means do not save again because the message was loaded from storage
      });
      // Scroll to the bottom
      setTimeout(() => {
        elements.messages.parentElement.scrollTop = elements.messages.parentElement.scrollHeight;
      }, 100);
    }
  } catch (error) {
    console.error('Failed to load conversation history:', error);
  }
}

// Save conversation history
async function saveHistory() {
  try {
    // Keep only the latest 20 messages to avoid storage bloat
    const historyToSave = conversationHistory.slice(-20);
    await chrome.storage.local.set({ conversationHistory: historyToSave });
  } catch (error) {
    console.error('Failed to save conversation history:', error);
  }
}

/**
 * Persist metadata about the source used for the latest summary.
 * @param {object|null} source Source metadata for the latest summary.
 */
async function saveLastSummarySource(source) {
  lastSummarySource = source;
  await chrome.storage.local.set({ lastSummarySource: source });
}

/**
 * Build source context for follow-up questions about the latest summary.
 * @returns {string} Source context for the model.
 */
function buildLastSummarySourceContext() {
  if (!lastSummarySource) return '';

  const sourceType = lastSummarySource.contentType === 'videoTranscript'
    ? 'video transcript'
    : 'visible page text';

  return `[Latest summary source]
The latest summary was generated from ${sourceType}.
Source name: ${lastSummarySource.sourceName}
Language: ${lastSummarySource.language || 'unknown'}
Title: ${lastSummarySource.title}
URL: ${lastSummarySource.url}
Text length: ${lastSummarySource.textLength} characters
Excerpt from the source: ${lastSummarySource.excerpt}

If the user asks what the latest summary was based on, answer using this source metadata. Do not infer the source from the recently viewed page summary when this metadata is available.`;
}

// Update API status indicator
function updateAPIStatus() {
  if (config.apiKey) {
    elements.apiStatus.classList.add('connected');
    elements.apiStatus.classList.remove('error');
  } else {
    elements.apiStatus.classList.remove('connected');
    elements.apiStatus.classList.remove('error');
  }
}

// Bind events
function bindEvents() {
  elements.settingsBtn.addEventListener('click', () => {
    elements.settingsPanel.classList.toggle('hidden');
  });

  // Provider switching
  elements.apiProvider.addEventListener('change', (e) => {
    switchProvider(e.target.value);
  });

  elements.saveSettings.addEventListener('click', saveConfig);

  elements.summarizeBtn.addEventListener('click', handleSummarize);
  elements.translateBtn.addEventListener('click', handleTranslate);
  elements.explainBtn.addEventListener('click', handleExplain);
  elements.historyBtn.addEventListener('click', toggleHistoryPanel);
  elements.closeHistoryBtn.addEventListener('click', () => elements.historyPanel.classList.add('hidden'));
  elements.translatePageBtn.addEventListener('click', handleTranslatePage);

  elements.sendBtn.addEventListener('click', handleSend);
  elements.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  elements.clearBtn.addEventListener('click', handleClear);

  // Copy-code interaction
  elements.messages.addEventListener('click', (e) => {
    if (e.target.classList.contains('copy-btn')) {
      const btn = e.target;
      const wrapper = btn.closest('.code-block-wrapper');
      const code = wrapper.querySelector('code').innerText;

      navigator.clipboard.writeText(code).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = '#4ade80';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.color = '';
        }, 2000);
      });
    }
  });
}

// Update UI state
function updateUIState() {
  const hasApiKey = !!config.apiKey;
  elements.summarizeBtn.disabled = !hasApiKey;
  elements.translateBtn.disabled = !hasApiKey;
  elements.explainBtn.disabled = !hasApiKey;
  elements.sendBtn.disabled = !hasApiKey;

  if (!hasApiKey) {
    elements.settingsPanel.classList.remove('hidden');
    addSystemMessage('⚠️ Please configure your API key in Settings first', 'error');
  }
}

// Get the current tab for side-panel actions
async function getCurrentTab() {
  // Get active tabs across windows
  const tabs = await chrome.tabs.query({ active: true });

  // Filter out special pages and keep regular webpages only
  const normalTabs = tabs.filter(tab =>
    tab.url &&
    !tab.url.startsWith('chrome://') &&
    !tab.url.startsWith('chrome-extension://') &&
    !tab.url.startsWith('about:')
  );

  console.log('[Page Copilot] Active tabs found:', normalTabs.map(t => t.title));

  // If there is only one matching tab, return it directly
  if (normalTabs.length === 1) {
    return normalTabs[0];
  }

  // If there are multiple matches, prefer the last focused window
  if (normalTabs.length > 1) {
    const [lastFocused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (lastFocused && !lastFocused.url.startsWith('chrome')) {
      return lastFocused;
    }
    // Otherwise return the first match
    return normalTabs[0];
  }

  return null;
}

// Get page content
async function getPageContent() {
  const tab = await getCurrentTab();
  const isSupportedVideoPage = isSupportedVideoUrl(tab?.url || '');
  const videoTranscript = await getVideoTranscriptContent(tab);
  if (videoTranscript) {
    return videoTranscript;
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' }, (response) => {
      const pageContent = response?.data;
      if (pageContent && isSupportedVideoPage) {
        pageContent.videoTranscriptStatus = 'unavailable';
      }
      resolve(pageContent);
    });
  });
}

/**
 * Check whether the current URL is a video page with supported captions.
 * @param {string} url Current tab URL.
 * @returns {boolean} Whether transcript extraction should be attempted.
 */
function isSupportedVideoUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    return (hostname.includes('youtube.com') && parsedUrl.pathname === '/watch')
      || (hostname.includes('bilibili.com') && /^\/video\//.test(parsedUrl.pathname));
  } catch (error) {
    return false;
  }
}

/**
 * Inject the transcript extractor into the active tab and read available captions.
 * @param {chrome.tabs.Tab} tab Current browser tab.
 * @returns {Promise<object|null>} Transcript content object, or null when unavailable.
 */
async function getVideoTranscriptContent(tab) {
  if (!tab?.id || !isSupportedVideoUrl(tab.url || '')) {
    return null;
  }

  const hostname = new URL(tab.url).hostname;
  const injectionWorld = hostname.includes('youtube.com') ? 'MAIN' : 'ISOLATED';

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['video-transcript.js'],
      world: injectionWorld
    });

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.PageCopilotTranscript?.extractVideoTranscriptContent?.() || null,
      world: injectionWorld
    });

    return result?.result || null;
  } catch (error) {
    console.warn('[Page Copilot] Failed to read video transcript directly:', error);
    return null;
  }
}

// Get selected text
async function getSelectedText() {
  const tab = await getCurrentTab();
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString().trim()
    });
    return results[0]?.result || '';
  } catch (error) {
    return '';
  }
}

// Get page browsing history
async function getPageHistory() {
  try {
    const result = await chrome.storage.session.get(['pageHistory']);
    return result.pageHistory || [];
  } catch (error) {
    console.error('[Page Copilot] Failed to load page history:', error);
    return [];
  }
}

// Toggle the history panel
async function toggleHistoryPanel() {
  if (elements.historyPanel.classList.contains('hidden')) {
    await showHistoryPanel();
  } else {
    elements.historyPanel.classList.add('hidden');
  }
}

// Show the history panel
async function showHistoryPanel() {
  const pageHistory = await getPageHistory();
  const currentTab = await getCurrentTab();

  // Format relative time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;

    return `${Math.floor(diffHours / 24)} day(s) ago`;
  };

  // Build the page list with the current page first
  let pages = [];
  if (currentTab && currentTab.url && !currentTab.url.startsWith('chrome')) {
    pages.push({
      url: currentTab.url,
      title: currentTab.title || 'Current page',
      domain: new URL(currentTab.url).hostname,
      visitTime: Date.now(),
      isCurrent: true
    });

    // Add historical pages except the current one
    const otherPages = pageHistory.filter(p => p.url !== currentTab.url).slice(0, config.contextPageCount - 1);
    pages = pages.concat(otherPages.map(p => ({ ...p, isCurrent: false })));
  } else {
    pages = pageHistory.slice(0, config.contextPageCount).map(p => ({ ...p, isCurrent: false }));
  }

  // Render the list
  if (pages.length === 0) {
    elements.historyList.innerHTML = '<div class="history-empty">No browsing history yet.<br>Recently viewed pages will appear here.</div>';
  } else {
    elements.historyList.innerHTML = pages.map((page, index) => {
      const num = index + 1;
      const currentClass = page.isCurrent ? 'current' : '';
      const label = page.isCurrent ? 'Current' : num;
      return `
        <div class="history-item ${currentClass}" data-index="${num}" data-url="${page.url}" data-title="${page.title}">
          <div class="history-number">${label}</div>
          <div class="history-info">
            <div class="history-title">${page.title}</div>
            <div class="history-meta">
              <span class="history-domain">${page.domain}</span>
              <span class="history-time">${formatTime(page.visitTime)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind click handlers
    elements.historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = item.dataset.index;
        const title = item.dataset.title;
        // Insert a page reference into the input box
        const currentValue = elements.userInput.value;
        const reference = `[Page ${index}]`;
        if (currentValue) {
          elements.userInput.value = currentValue + ' ' + reference;
        } else {
          elements.userInput.value = reference + ' ';
        }
        elements.userInput.focus();
        // Close the panel
        elements.historyPanel.classList.add('hidden');
        addSystemMessage(`Referenced: ${title.substring(0, 30)}...`);
      });
    });
  }

  elements.historyPanel.classList.remove('hidden');
}

// Fetch page content on demand
async function fetchPageContent(url) {
  try {
    // Find the tab that matches this URL
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => t.url === url);

    if (!tab) {
      return null; // The tab has already been closed
    }

    // Execute a script to capture content
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const article = document.querySelector('article') || document.querySelector('main') || document.body;
        const text = article.innerText || article.textContent || '';
        return text.substring(0, 3000).trim();
      }
    });

    return results[0]?.result || null;
  } catch (error) {
    console.warn('[Page Copilot] Failed to fetch page content:', error.message);
    return null;
  }
}

// Build page-context prompt text using on-demand fetches
async function buildPageContext() {
  if (config.contextPageCount <= 0) {
    return '';
  }

  const pageHistory = await getPageHistory();

  // Get the current active tab
  const currentTab = await getCurrentTab();

  // Ensure the current page is listed first
  let recentPages = [];
  if (currentTab && currentTab.url && !currentTab.url.startsWith('chrome')) {
    // Current page metadata
    const currentPage = {
      url: currentTab.url,
      title: currentTab.title || 'Current page',
      domain: new URL(currentTab.url).hostname,
      visitTime: Date.now()
    };
    recentPages.push(currentPage);

    // Add historical pages except the current page to avoid duplicates
    const otherPages = pageHistory.filter(p => p.url !== currentTab.url);
    recentPages = recentPages.concat(otherPages.slice(0, config.contextPageCount - 1));
  } else {
    recentPages = pageHistory.slice(0, config.contextPageCount);
  }

  if (recentPages.length === 0) {
    return '';
  }

  // Format relative time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;

    return `${Math.floor(diffHours / 24)} day(s) ago`;
  };

  // Fetch all page content in parallel
  console.log('[Page Copilot] Fetching page content...');
  console.log('[Page Copilot] Current page:', currentTab?.title, currentTab?.url);
  console.log('[Page Copilot] Page list:', recentPages.map(p => p.title));
  const contentPromises = recentPages.map(page => fetchPageContent(page.url));
  const contents = await Promise.all(contentPromises);

  // Build the page list with content summaries
  const pageDetails = recentPages.map((page, index) => {
    const isCurrentPage = index === 0 && currentTab && page.url === currentTab.url;
    const pageLabel = isCurrentPage ? '[Current Page]' : `[Page ${index + 1}]`;
    let detail = `${pageLabel} [${formatTime(page.visitTime)}] ${page.title}\nSource: ${page.domain}`;
    const content = contents[index];
    if (content) {
      // Use the first 500 characters as the summary
      const summary = content.substring(0, 500).replace(/\s+/g, ' ').trim();
      detail += `\nContent summary: ${summary}${content.length > 500 ? '...' : ''}`;
    } else {
      detail += '\n(Tab already closed, content unavailable)';
    }
    return detail;
  }).join('\n\n');

  console.log('[Page Copilot] Page content fetch complete');
  return `\n\n[Recently viewed pages]\n${pageDetails}\n\nThe user may refer to these pages in follow-up questions, for example "that one from a minute ago", "the first page", "that article", or "compare them". You can answer directly based on these page summaries.`;
}

// Stream responses from the Claude-compatible API
async function callClaudeStream(userMessage, onChunk, onDone, onError) {
  if (!config.apiKey) {
    onError('Please configure your API key first');
    return;
  }

  const customInstructionText = (config.systemPrompt || '').trim();
  const finalUserMessage = customInstructionText
    ? `[Custom instructions - higher priority]\n${customInstructionText}\n\nPlease follow the custom instructions above for this reply.\n\n[User request]\n${userMessage}`
    : userMessage;

  const messages = [
    ...conversationHistory,
    { role: 'user', content: finalUserMessage }
  ];

  // Build the system prompt with page context
  const pageContext = await buildPageContext();
  const latestSummarySourceContext = buildLastSummarySourceContext();
  const enhancedConfig = {
    ...config,
    systemPrompt: [customInstructionText, latestSummarySourceContext, pageContext.trim()].filter(Boolean).join('\n\n')
  };

  const port = chrome.runtime.connect({ name: 'claude-stream' });

  port.postMessage({
    action: 'streamClaude',
    messages: messages,
    config: enhancedConfig
  });

  port.onMessage.addListener((msg) => {
    if (msg.type === 'chunk') {
      onChunk(msg.content);
    } else if (msg.type === 'done') {
      onDone();
      port.disconnect();
    } else if (msg.type === 'error') {
      onError(msg.error);
      port.disconnect();
    }
  });
}

// Add a message to the UI
function addMessage(content, type = 'assistant', save = true) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  if (type === 'assistant') {
    contentDiv.innerHTML = renderMarkdown(content);
  } else {
    contentDiv.innerHTML = content.replace(/\n/g, '<br>');
  }

  messageDiv.appendChild(contentDiv);
  elements.messages.appendChild(messageDiv);
  elements.messages.parentElement.scrollTop = elements.messages.parentElement.scrollHeight;

  if (save) {
    conversationHistory.push({
      role: type,
      content: content,
      timestamp: Date.now()  // Add timestamp
    });
    saveHistory();
  }

  return contentDiv; // Return contentDiv so it can be updated during streaming
}

// Add a system message
function addSystemMessage(content, type = 'system') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
  elements.messages.appendChild(messageDiv);
  elements.messages.parentElement.scrollTop = elements.messages.parentElement.scrollHeight;
}

/**
 * Download the latest detected transcript using a readable timed subtitle body.
 */
function downloadLastTranscript() {
  if (!lastTranscriptDownload?.body) {
    addSystemMessage('❌ No transcript is available to download', 'error');
    return;
  }

  const blob = new Blob([lastTranscriptDownload.body], {
    type: lastTranscriptDownload.mimeType || 'text/plain;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = lastTranscriptDownload.fileName || 'transcript';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Show a contextual message when a downloadable transcript is available.
 * @param {object} pageContent Extracted page or transcript content.
 */
function addTranscriptDetectedMessage(pageContent) {
  const sourceName = pageContent.sourceName || 'Video transcript';
  const language = pageContent.language || 'unknown language';
  const textLength = Number(pageContent.textLength || 0).toLocaleString();

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message system';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content transcript-detected';

  const label = document.createElement('span');
  label.textContent = `${sourceName} detected: ${language}, ${textLength} characters.`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inline-action-btn';
  button.textContent = 'Download transcript';
  button.addEventListener('click', downloadLastTranscript);

  contentDiv.append(label, button);
  messageDiv.appendChild(contentDiv);
  elements.messages.appendChild(messageDiv);
  elements.messages.parentElement.scrollTop = elements.messages.parentElement.scrollHeight;
}

// Handle sending messages (streaming)
async function handleSend() {
  const userMessage = elements.userInput.value.trim();
  if (!userMessage) return;

  const selectedText = await getSelectedText();
  let finalPrompt = userMessage;
  let contextAdded = false;

  if (selectedText) {
    const lowerUserMessage = userMessage.toLowerCase();
    const selectionIntentKeywords = ['selected', 'selection', 'translate', 'explain'];
    const selectionIntentPatterns = [/\u9009\u4e2d/u, /\u8fd9\u6bb5/u, /\u8fd9\u53e5/u, /\u7ffb\u8bd1/u, /\u89e3\u91ca/u];
    const isAboutSelection = selectionIntentKeywords.some((keyword) => lowerUserMessage.includes(keyword))
      || selectionIntentPatterns.some((pattern) => pattern.test(userMessage));
    if (isAboutSelection) {
      finalPrompt = `[Selected text]\n${selectedText}\n\n===User question===\n${userMessage}`;
      contextAdded = true;
    }
  }

  addMessage(userMessage, 'user');
  if (contextAdded) addSystemMessage('✂️ Included the selected text automatically');
  elements.userInput.value = '';

  setButtonsDisabled(true);

  // Create an empty assistant message for streaming output
  let currentResponse = '';
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = '<span class="cursor">|</span>'; // Cursor effect
  messageDiv.appendChild(contentDiv);
  elements.messages.appendChild(messageDiv);

  callClaudeStream(
    finalPrompt,
    (chunk) => {
      currentResponse += chunk;
      contentDiv.innerHTML = renderMarkdown(currentResponse);
      elements.messages.parentElement.scrollTop = elements.messages.parentElement.scrollHeight;
    },
    () => {
      // Complete
      conversationHistory.push({ role: 'assistant', content: currentResponse, timestamp: Date.now() });
      saveHistory();
      setButtonsDisabled(false);
    },
    (error) => {
      contentDiv.innerHTML += `<br><span style="color:red">❌ Error: ${error}</span>`;
      setButtonsDisabled(false);
    }
  );
}

// Handle page summarization (streaming)
async function handleSummarize() {
  setButtonsDisabled(true);
  addSystemMessage('📄 Extracting page content...');

  const pageContent = await getPageContent();
  if (!pageContent || !pageContent.text) {
    addSystemMessage('❌ Unable to retrieve page content', 'error');
    setButtonsDisabled(false);
    return;
  }
  if (pageContent.videoTranscriptStatus === 'unavailable') {
    addSystemMessage('⚠️ Captions were not readable from this video page. Falling back to visible page text.', 'error');
  }
  lastTranscriptDownload = pageContent.contentType === 'videoTranscript'
    ? pageContent.download || null
    : null;

  let text = pageContent.text;
  if (text.length > 10000) text = text.substring(0, 10000) + '\n\n[Content too long, truncated...]';
  const contentLabel = pageContent.contentType === 'videoTranscript'
    ? `${pageContent.sourceName || 'video transcript'}`
    : 'webpage';
  const prompt = `Please summarize the following ${contentLabel}.\n\nPage title: ${pageContent.title}\n\nContent:\n${text}\n\nSummarize the main ideas, key details, and notable takeaways. Respect any higher-priority custom instructions for the response language. If no language preference is provided, respond in English.`;
  await saveLastSummarySource({
    contentType: pageContent.contentType || 'pageText',
    sourceName: pageContent.sourceName || 'Visible page text',
    language: pageContent.language || '',
    title: pageContent.title,
    url: pageContent.url,
    textLength: pageContent.textLength,
    excerpt: pageContent.excerpt,
    timestamp: Date.now()
  });

  if (pageContent.contentType === 'videoTranscript' && lastTranscriptDownload) {
    addTranscriptDetectedMessage(pageContent);
  }

  addMessage(pageContent.contentType === 'videoTranscript' ? '📄 Summarize video transcript' : '📄 Summarize this page', 'user');

  let currentResponse = '';
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = '...';
  messageDiv.appendChild(contentDiv);
  elements.messages.appendChild(messageDiv);

  callClaudeStream(
    prompt,
    (chunk) => {
      currentResponse += chunk;
      contentDiv.innerHTML = renderMarkdown(currentResponse);
      elements.messages.parentElement.scrollTop = elements.messages.parentElement.scrollHeight;
    },
    () => {
      conversationHistory.push({ role: 'assistant', content: currentResponse, timestamp: Date.now() });
      saveHistory();
      setButtonsDisabled(false);
    },
    (error) => {
      contentDiv.innerHTML += `<br><span style="color:red">❌ Error: ${error}</span>`;
      setButtonsDisabled(false);
    }
  );
}

// Handle translation (streaming)
async function handleTranslate() {
  const selectedText = await getSelectedText();
  if (!selectedText) {
    addSystemMessage('⚠️ Please select the text you want to translate first', 'error');
    return;
  }

  const prompt = `Translate the following text. If the original text is in Chinese, translate it into English. Otherwise, translate it into Simplified Chinese.\n\n${selectedText}`;
  addMessage(`🌐 Translate: ${selectedText.substring(0, 100)}...`, 'user');

  setButtonsDisabled(true);
  let currentResponse = '';
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = '...';
  messageDiv.appendChild(contentDiv);
  elements.messages.appendChild(messageDiv);

  callClaudeStream(
    prompt,
    (chunk) => {
      currentResponse += chunk;
      contentDiv.innerHTML = renderMarkdown(currentResponse);
      elements.messages.parentElement.scrollTop = elements.messages.parentElement.scrollHeight;
    },
    () => {
      conversationHistory.push({ role: 'assistant', content: currentResponse, timestamp: Date.now() });
      saveHistory();
      setButtonsDisabled(false);
    },
    (error) => {
      contentDiv.innerHTML += `<br><span style="color:red">❌ Error: ${error}</span>`;
      setButtonsDisabled(false);
    }
  );
}

// Handle full-page translation
async function handleTranslatePage() {
  const tab = await getCurrentTab();
  if (!tab) {
    addSystemMessage('❌ Unable to access the current page', 'error');
    return;
  }

  try {
    // Try sending the message first
    await chrome.tabs.sendMessage(tab.id, { action: 'translatePage' });
    addSystemMessage('🌍 Translating the page now. Check the webpage for progress.');
  } catch (error) {
    // If this fails, the content script may be missing; inject it and retry
    console.log('[Page Copilot] Content script missing, attempting injection...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['floating-toolbar.css']
      });
      // Wait for the script to load
      await new Promise(resolve => setTimeout(resolve, 100));
      // Retry the message
      await chrome.tabs.sendMessage(tab.id, { action: 'translatePage' });
      addSystemMessage('🌍 Translating the page now. Check the webpage for progress.');
    } catch (retryError) {
      console.error('[Page Copilot] Translation failed:', retryError);
      addSystemMessage('❌ Translation failed. Refresh the page and try again.', 'error');
    }
  }
}

// Handle explanation requests (streaming)
async function handleExplain() {
  const selectedText = await getSelectedText();
  if (!selectedText) {
    addSystemMessage('⚠️ Please select the text you want explained first', 'error');
    return;
  }

  const prompt = `Explain the following content clearly. Respect any higher-priority custom instructions for the response language. If no language preference is provided, respond in English.\n\n${selectedText}`;
  addMessage(`💡 Explain: ${selectedText.substring(0, 100)}...`, 'user');

  setButtonsDisabled(true);
  let currentResponse = '';
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = '...';
  messageDiv.appendChild(contentDiv);
  elements.messages.appendChild(messageDiv);

  callClaudeStream(
    prompt,
    (chunk) => {
      currentResponse += chunk;
      contentDiv.innerHTML = renderMarkdown(currentResponse);
      elements.messages.parentElement.scrollTop = elements.messages.parentElement.scrollHeight;
    },
    () => {
      conversationHistory.push({ role: 'assistant', content: currentResponse, timestamp: Date.now() });
      saveHistory();
      setButtonsDisabled(false);
    },
    (error) => {
      contentDiv.innerHTML += `<br><span style="color:red">❌ Error: ${error}</span>`;
      setButtonsDisabled(false);
    }
  );
}

// Clear the conversation
function handleClear() {
  if (confirm('Clear the conversation history?')) {
    elements.messages.innerHTML = `
      <div class="message assistant">
        <div class="message-content">
          Conversation cleared. Ask anything to start again.
        </div>
      </div>
    `;
    conversationHistory = [];
    lastSummarySource = null;
    lastTranscriptDownload = null;
    saveHistory(); // Clear persisted storage
    chrome.storage.local.remove('lastSummarySource');
  }
}

// Enable or disable buttons
function setButtonsDisabled(disabled) {
  elements.summarizeBtn.disabled = disabled;
  elements.translateBtn.disabled = disabled;
  elements.explainBtn.disabled = disabled;
  elements.sendBtn.disabled = disabled;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'contextMenuAction') {
    switch (request.menuItemId) {
      case 'translateText': handleTranslate(); break;
      case 'explainText': handleExplain(); break;
      case 'summarizePage': handleSummarize(); break;
    }
  } else if (request.action === 'askWithText') {
    // Handle AI ask actions from the floating toolbar
    const text = request.text;
    if (text) {
      // Insert the selected text into the input box
      elements.userInput.value = `Please analyze the following text:\n\n${text}`;
      // Focus the input box
      elements.userInput.focus();
      // You can also auto-send here by uncommenting the next line
      // handleChat();
    }
  }
});

// Start
init();
