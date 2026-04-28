// Content Script - page content extraction and floating toolbar
console.log('[Page Copilot] Content script loaded');

// ==================== 全局变量 ====================
let floatingToolbar = null;
let currentSelection = null;
let hideToolbarTimer = null;

// 拖拽状态
let isDragging = false;
let dragStarted = false;
let dragStartX = 0;
let dragStartY = 0;
let toolbarStartX = 0;
let toolbarStartY = 0;
let suppressToolbarClickUntil = 0;
let suppressSelectionToolbarUntil = 0;

const DRAG_THRESHOLD_PX = 5;
const DRAG_END_SUPPRESS_MS = 150;
const TOOLBAR_VIEWPORT_PADDING = 8;

// ==================== 页面内容提取 ====================
async function extractPageContent() {
  const videoTranscript = await window.PageCopilotTranscript?.extractVideoTranscriptContent();
  if (videoTranscript) return videoTranscript;

  const excludeSelectors = [
    'script',
    'style',
    'noscript',
    'iframe',
    'nav',
    'header',
    'footer',
    '.advertisement',
    '.ad',
    '#comments'
  ];

  const clone = document.body.cloneNode(true);

  excludeSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  let text = clone.innerText || clone.textContent || '';

  text = text
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return {
    title: document.title,
    url: window.location.href,
    text: text,
    textLength: text.length,
    excerpt: text.substring(0, 500) + (text.length > 500 ? '...' : '')
  };
}

// ==================== 获取选中文本 ====================
function getSelectedText() {
  return window.getSelection().toString().trim();
}

/**
 * Toggle global selection lock while dragging the floating toolbar.
 * @param {boolean} disabled Whether page text selection should be disabled.
 */
function setDraggingSelectionLock(disabled) {
  document.documentElement.classList.toggle('ai-toolbar-no-select', disabled);
}

/**
 * Clamp toolbar coordinates to the current visible viewport.
 * Toolbar uses absolute positioning, so viewport bounds must include scroll offsets.
 * @param {number} left Desired absolute left.
 * @param {number} top Desired absolute top.
 * @param {HTMLElement} toolbar Toolbar element.
 * @returns {{left: number, top: number}} Clamped absolute coordinates.
 */
function clampToolbarPosition(left, top, toolbar) {
  const toolbarRect = toolbar.getBoundingClientRect();
  const maxLeft = window.scrollX + window.innerWidth - toolbarRect.width - TOOLBAR_VIEWPORT_PADDING;
  const maxTop = window.scrollY + window.innerHeight - toolbarRect.height - TOOLBAR_VIEWPORT_PADDING;
  const minLeft = window.scrollX + TOOLBAR_VIEWPORT_PADDING;
  const minTop = window.scrollY + TOOLBAR_VIEWPORT_PADDING;

  return {
    left: Math.max(minLeft, Math.min(left, maxLeft)),
    top: Math.max(minTop, Math.min(top, maxTop))
  };
}

/**
 * Read toolbar absolute coordinates from inline style or current layout.
 * @param {HTMLElement} toolbar Toolbar element.
 * @returns {{left: number, top: number}} Absolute document coordinates.
 */
function getToolbarDocumentPosition(toolbar) {
  const inlineLeft = Number.parseFloat(toolbar.style.left);
  const inlineTop = Number.parseFloat(toolbar.style.top);

  if (!Number.isNaN(inlineLeft) && !Number.isNaN(inlineTop)) {
    return { left: inlineLeft, top: inlineTop };
  }

  const rect = toolbar.getBoundingClientRect();
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY
  };
}

// ==================== 创建浮动工具栏 ====================
function createFloatingToolbar() {
  if (floatingToolbar) {
    return floatingToolbar;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'ai-floating-toolbar';
  toolbar.innerHTML = `
    <button data-action="copy" title="Copy selected text">
      📋 Copy
    </button>
    <button data-action="translate" title="Translate selected text">
      🌐 Translate
    </button>
    <button data-action="ask" title="Ask AI about this selection">
      💬 Ask AI
    </button>
    <button data-action="pdf" title="Export to PDF">
      📄 PDF
    </button>
  `;

  // 拖拽开始
  toolbar.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStarted = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const toolbarPosition = getToolbarDocumentPosition(toolbar);
    toolbarStartX = toolbarPosition.left;
    toolbarStartY = toolbarPosition.top;
    e.stopPropagation();
  });

  // 处理按钮点击
  toolbar.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    if (Date.now() < suppressToolbarClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const action = button.dataset.action;
    const selectedText = currentSelection || getSelectedText();

    // 添加加载状态
    button.classList.add('loading');

    try {
      switch (action) {
        case 'copy':
          await handleCopy(selectedText);
          break;
        case 'translate':
          await handleTranslate(selectedText);
          break;
        case 'ask':
          await handleAsk(selectedText);
          break;
        case 'pdf':
          await handlePdf();
          break;
      }
    } catch (error) {
      console.error('[Page Copilot] Toolbar action failed:', error);
      showToast('❌ Action failed: ' + error.message);
    } finally {
      button.classList.remove('loading');
    }
  });

  document.body.appendChild(toolbar);
  floatingToolbar = toolbar;

  // 全局拖拽事件（只绑定一次）
  if (!toolbar.dataset.dragInitialized) {
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    toolbar.dataset.dragInitialized = 'true';
  }

  return toolbar;
}

// ==================== 显示浮动工具栏 ====================
function showFloatingToolbar(selection) {
  if (!selection || selection.toString().trim().length === 0) {
    hideFloatingToolbar();
    return;
  }

  currentSelection = selection.toString().trim();
  const toolbar = createFloatingToolbar();

  // 获取选区的位置
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();

  let top = rect.top + window.scrollY - toolbarRect.height - TOOLBAR_VIEWPORT_PADDING;
  if (rect.top <= toolbarRect.height + TOOLBAR_VIEWPORT_PADDING) {
    top = rect.bottom + window.scrollY + TOOLBAR_VIEWPORT_PADDING;
  }

  const left = rect.left + window.scrollX + (rect.width / 2) - (toolbarRect.width / 2);
  const clampedPosition = clampToolbarPosition(left, top, toolbar);

  toolbar.style.top = `${clampedPosition.top}px`;
  toolbar.style.left = `${clampedPosition.left}px`;
  toolbar.classList.remove('dragging');
  setDraggingSelectionLock(false);
  isDragging = false;
  dragStarted = false;

  // 显示工具栏
  setTimeout(() => {
    toolbar.classList.add('show');
  }, 10);

  // 清除之前的隐藏定时器
  if (hideToolbarTimer) {
    clearTimeout(hideToolbarTimer);
    hideToolbarTimer = null;
  }
}

// ==================== 隐藏浮动工具栏 ====================
function hideFloatingToolbar(immediate = false) {
  if (!floatingToolbar) return;

  const hide = () => {
    floatingToolbar.classList.remove('show');
    currentSelection = null;
  };

  if (immediate) {
    hide();
  } else {
    // 延迟隐藏，避免点击工具栏时误触
    hideToolbarTimer = setTimeout(hide, 200);
  }
}

// ==================== 拖拽处理函数 ====================
function handleDragMove(e) {
  if (!isDragging || !floatingToolbar) return;

  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;

  // 移动超过 5px 才算真正开始拖拽
  if (!dragStarted && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
    dragStarted = true;
    floatingToolbar.classList.add('dragging');
    setDraggingSelectionLock(true);
  }

  if (!dragStarted) return;

  let newLeft = toolbarStartX + dx;
  let newTop = toolbarStartY + dy;
  const clampedPosition = clampToolbarPosition(newLeft, newTop, floatingToolbar);

  floatingToolbar.style.left = `${clampedPosition.left}px`;
  floatingToolbar.style.top = `${clampedPosition.top}px`;

  e.stopPropagation();
  e.preventDefault();
}

function handleDragEnd(e) {
  if (!isDragging) return;

  isDragging = false;
  setDraggingSelectionLock(false);

  if (floatingToolbar) {
    floatingToolbar.classList.remove('dragging');
  }

  if (dragStarted) {
    suppressToolbarClickUntil = Date.now() + DRAG_END_SUPPRESS_MS;
    suppressSelectionToolbarUntil = Date.now() + DRAG_END_SUPPRESS_MS;
  }

  dragStarted = false;

  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
}

// ==================== Toast 提示 ====================
function showToast(message, duration = 2000) {
  // 移除已存在的 toast
  const existingToast = document.querySelector('.ai-floating-toolbar-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'ai-floating-toolbar-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==================== 功能处理函数 ====================

// 1. 复制功能
async function handleCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('✅ Copied to clipboard');
    hideFloatingToolbar(true);
  } catch (error) {
    throw new Error('Copy failed');
  }
}

// 2. 翻译功能
async function handleTranslate(text) {
  try {
    // 发送消息到 background.js 触发翻译
    chrome.runtime.sendMessage({
      action: 'translate',
      text: text
    });
    showToast('🌐 Translating...');
    hideFloatingToolbar(true);
  } catch (error) {
    throw new Error('Translation failed');
  }
}

// 3. AI 提问功能
async function handleAsk(text) {
  try {
    // 发送消息到 background.js 打开侧边栏并传递文本
    const response = await chrome.runtime.sendMessage({
      action: 'openSidePanelWithText',
      text: text
    });
    if (response && response.success) {
      showToast('💬 Opening the AI assistant...');
      hideFloatingToolbar(true);
    } else {
      const errorMsg = response?.error || 'Unknown error';
      console.error('[Page Copilot] Failed to open the side panel:', errorMsg);
      showToast('❌ Failed to open the side panel: ' + errorMsg);
    }
  } catch (error) {
    console.error('[Page Copilot] handleAsk error:', error);
    showToast('❌ Failed to open the side panel');
  }
}

// 4. PDF 导出功能 - 直接在 content.js 中处理，避免弹窗被阻止
async function handlePdf() {
  try {
    const text = currentSelection || getSelectedText();

    if (!text) {
      // 没有选中文本，导出整个页面
      window.print();
      hideFloatingToolbar(true);
      return;
    }

    const sourceUrl = window.location.href;
    const exportTime = new Date().toLocaleString('en-US');

    // 转义 HTML 特殊字符
    const escapeHtml = (str) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const safeText = escapeHtml(text);
    const safeUrl = escapeHtml(sourceUrl);

    // 构建 HTML
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Page Copilot - Export PDF</title>
<style>
body {
  font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", Arial, sans-serif;
  max-width: 700px;
  margin: 50px auto;
  padding: 30px;
  line-height: 1.8;
  color: #333;
  background: white;
}
h1 {
  color: #5a67d8;
  border-bottom: 3px solid #5a67d8;
  padding-bottom: 15px;
  margin-bottom: 30px;
  font-size: 22px;
  font-weight: 600;
}
.content {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 15px;
  line-height: 2;
  color: #222;
  margin-bottom: 50px;
}
.footer {
  margin-top: 50px;
  padding-top: 15px;
  border-top: 1px solid #ccc;
  font-size: 11px;
  color: #888;
}
@media print {
  body { margin: 0; padding: 20px; max-width: 100%; }
}
</style>
</head>
<body>
<h1>Page Copilot - Selected Content</h1>
<div class="content">${safeText}</div>
<div class="footer">
<div>Exported at: ${exportTime}</div>
<div>Source page: ${safeUrl}</div>
</div>
</body>
</html>`;

    // 直接用 window.open 打开（在用户点击事件中，不会被阻止）
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      showToast('❌ Popup blocked. Please allow popups for this site.');
      return;
    }

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    showToast('📄 A new window has opened. Use Print or Save as PDF there.');
    hideFloatingToolbar(true);
  } catch (error) {
    console.error('[Page Copilot] PDF export failed:', error);
    throw new Error('PDF export failed');
  }
}

// ==================== 事件监听 ====================

// 监听鼠标松开事件（文本选择）
document.addEventListener('mouseup', (e) => {
  if (Date.now() < suppressSelectionToolbarUntil) {
    return;
  }

  // 延迟执行，确保选区已更新
  setTimeout(() => {
    if (Date.now() < suppressSelectionToolbarUntil) {
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && selectedText.length > 0) {
      // 检查是否点击在工具栏上
      if (!floatingToolbar || !floatingToolbar.contains(e.target)) {
        showFloatingToolbar(selection);
      }
    } else {
      hideFloatingToolbar();
    }
  }, 10);
});

// 监听点击事件（点击其他地方隐藏工具栏）
document.addEventListener('mousedown', (e) => {
  if (floatingToolbar && !floatingToolbar.contains(e.target)) {
    hideFloatingToolbar();
  }
});

// 监听滚动事件（滚动时隐藏工具栏）
document.addEventListener('scroll', () => {
  hideFloatingToolbar();
});

// 监听窗口大小变化
window.addEventListener('resize', () => {
  hideFloatingToolbar();
});

// ==================== 消息监听（来自 background/sidepanel） ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Page Copilot] Received message:', request.action);

  try {
    switch (request.action) {
      case 'getPageContent':
        extractPageContent()
          .then((content) => {
            console.log('[Page Copilot] Page content extracted:', content.textLength, 'characters');
            sendResponse({ success: true, data: content });
          })
          .catch((error) => {
            console.error('[Page Copilot] Page content extraction failed:', error);
            sendResponse({ success: false, error: error.message });
          });
        break;

      case 'getSelectedText':
        const selectedText = getSelectedText();
        console.log('[Page Copilot] Selected text length:', selectedText.length, 'characters');
        sendResponse({ success: true, data: selectedText });
        break;

      case 'showToast':
        // 显示 Toast 提示（来自 background.js）
        showToast(request.message, request.duration || 3000);
        sendResponse({ success: true });
        break;

      case 'highlightText':
        // TODO: 实现文本高亮功能
        sendResponse({ success: true });
        break;

      case 'translatePage':
        startPageTranslation()
          .then((result) => sendResponse({ success: true, ...result }))
          .catch((error) => {
            console.error('[Page Copilot] Page translation failed:', error);
            sendResponse({ success: false, error: error.message });
          });
        break;

      case 'getPageTranslationState':
        sendResponse({
          success: true,
          enabled: isTranslationEnabled,
          url: window.location.href
        });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[Page Copilot] Content script error:', error);
    sendResponse({ success: false, error: error.message });
  }

  return true; // 保持消息通道开放
});

console.log('[Page Copilot] Floating toolbar initialized');

// ==================== 整页翻译功能（懒加载模式） ====================

let isTranslationEnabled = false;  // 翻译功能是否开启
let translationObserver = null;    // IntersectionObserver 监听滚动
let pendingElements = [];          // 等待翻译的元素队列
let pendingElementsSet = new Set(); // 快速查找待翻译元素
let isTranslating = false;         // 是否正在翻译中
let translationConfig = null;      // 缓存配置
let translationStats = { completed: 0, total: 0 };  // 统计信息
let translatedElementsSet = new Set(); // 已翻译的元素（避免重复）
let allTranslatableElements = [];  // 所有可翻译的元素
let translationInFlightCount = 0;
let translationTextCache = new Map();
let translationCompletionShown = false;
let translationRetryCounts = new WeakMap();
let translationSkippedCount = 0;
let translationPageUrl = window.location.href;

const TRANSLATION_MAX_CONCURRENT_BATCHES = 2;
const TRANSLATION_MAX_BATCH_CHARS = 6000;
const TRANSLATION_PREFETCH_MARGIN = '2000px 0px';

// 需要翻译的元素选择器（只选主要内容，避免碎片化）
const TRANSLATABLE_SELECTORS = 'p, li, dd, dt, td, th, h1, h2, h3, h4, h5, h6, blockquote, figcaption, article > div, .article-content, .post-content, .entry-content, main p, [role="main"] p';

// 排除的元素选择器
const EXCLUDE_SELECTORS = 'script, style, noscript, iframe, code, pre, .ai-translation, .ai-floating-toolbar, input, textarea, select, nav, header, footer, aside, .sidebar, .menu, .nav, .advertisement, .ad, .comment, .comments';

/**
 * Reset page translation when a single-page app changes URL without reloading.
 */
function resetTranslationOnUrlChange() {
  if (window.location.href === translationPageUrl) return;

  translationPageUrl = window.location.href;
  if (isTranslationEnabled) {
    stopPageTranslation();
  }
}

/**
 * Install lightweight URL-change hooks for SPA navigation.
 */
function installTranslationNavigationHooks() {
  if (window.__pageCopilotTranslationNavigationHooksInstalled) return;
  window.__pageCopilotTranslationNavigationHooksInstalled = true;

  const wrapHistoryMethod = (methodName) => {
    const originalMethod = history[methodName];
    history[methodName] = function wrappedHistoryMethod(...args) {
      const result = originalMethod.apply(this, args);
      setTimeout(resetTranslationOnUrlChange, 0);
      return result;
    };
  };

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
  window.addEventListener('popstate', resetTranslationOnUrlChange);
  window.addEventListener('hashchange', resetTranslationOnUrlChange);
}

installTranslationNavigationHooks();

/**
 * Build the fallback translation configuration for a provider.
 * @param {string} provider Active provider id.
 * @returns {{apiUrl: string, model: string, batchSize: number}} Default translation settings.
 */
function getDefaultTranslationConfig(provider) {
  if (provider === 'glm') {
    return {
      apiUrl: 'https://open.bigmodel.cn/api/anthropic',
      model: 'glm-4.7',
      batchSize: 30
    };
  }

  return {
    apiUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-20241022',
    batchSize: 30
  };
}

/**
 * Read the active provider configuration used by full-page translation.
 * @returns {Promise<{apiKey: string, apiUrl: string, model: string, batchSize: number}>} Translation configuration.
 */
async function getTranslationConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'currentProvider',
      'claudeConfig',
      'glmConfig',
      'apiKey',
      'apiUrl',
      'translateModel',
      'translateBatchSize'
    ], (result) => {
      const provider = result.currentProvider || 'claude';
      const providerConfig = provider === 'glm' ? result.glmConfig : result.claudeConfig;
      const defaults = getDefaultTranslationConfig(provider);

      resolve({
        apiKey: providerConfig?.apiKey || result.apiKey || '',
        apiUrl: providerConfig?.apiUrl || result.apiUrl || defaults.apiUrl,
        model: providerConfig?.translateModel || result.translateModel || defaults.model,
        batchSize: parseInt(providerConfig?.translateBatchSize || result.translateBatchSize, 10) || defaults.batchSize
      });
    });
  });
}

// 获取模型显示名称
function getModelDisplayName(modelId) {
  const modelNames = {
    'claude-3-5-haiku-20241022': 'Haiku',
    'claude-sonnet-4-20250514': 'Sonnet 4',
    'claude-opus-4-20250514': 'Opus 4',
    'glm-4.7': 'GLM-4.7',
    'glm-4.5-air': 'GLM-4.5 Air'
  };
  return modelNames[modelId] || modelId;
}

// 批量翻译 API（通过 background.js 代理，流式返回）
// texts: [{id, text}] 格式
// onTranslation: (id, translatedText) => void 回调
async function translateTextsStream(texts, config, onTranslation) {
  if (!config.apiKey) {
    throw new Error('Please configure an API key in the extension settings first');
  }

  console.log('[Page Copilot] Starting batch streaming translation request, paragraph count:', texts.length);

  return new Promise((resolve, reject) => {
    // 建立长连接进行流式通信
    const port = chrome.runtime.connect({ name: 'translate-stream' });

    port.onMessage.addListener((msg) => {
      if (msg.type === 'translation') {
        // 收到一个翻译结果
        onTranslation(msg.id, msg.text);
      } else if (msg.type === 'done') {
        console.log('[Page Copilot] Batch translation completed');
        port.disconnect();
        resolve();
      } else if (msg.type === 'error') {
        console.error('[Page Copilot] Translation error:', msg.error);
        port.disconnect();
        reject(new Error(msg.error));
      }
    });

    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      }
    });

    // 发送翻译请求
    port.postMessage({
      action: 'streamTranslate',
      texts: texts,
      config: config
    });
  });
}

/**
 * Normalize visible text before batching, deduping, and caching translations.
 * @param {string} text Raw visible text.
 * @returns {string} Normalized text.
 */
function normalizeTranslationText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Check whether text is meaningful enough to translate.
 * @param {string} text Normalized text.
 * @returns {boolean} Whether the text should be translated.
 */
function isMeaningfulTranslationText(text) {
  if (!text || text.length < 5) return false;
  return !/^[\d\s\.,\-\+\*\/\=\%\$\#\@\!\?\:\;\(\)\[\]\{\}]+$/.test(text);
}

/**
 * Read normalized text from a translatable element.
 * @param {Element} element Candidate element.
 * @returns {string} Normalized visible text.
 */
function getElementTranslationText(element) {
  return normalizeTranslationText(element.innerText);
}

/**
 * Check basic element eligibility before the leaf-node filter is applied.
 * @param {Element} element Candidate element.
 * @returns {boolean} Whether the element is eligible for translation.
 */
function isEligibleTranslationElement(element) {
  if (element.classList.contains('ai-translated') || element.classList.contains('ai-translation')) {
    return false;
  }

  if (element.closest(EXCLUDE_SELECTORS)) {
    return false;
  }

  return isMeaningfulTranslationText(getElementTranslationText(element));
}

/**
 * Check whether an element contains a nested translatable text block.
 * @param {Element} element Candidate parent element.
 * @returns {boolean} Whether a child should be translated instead.
 */
function hasNestedTranslatableElement(element) {
  return Array.from(element.querySelectorAll(TRANSLATABLE_SELECTORS))
    .some((child) => child !== element && isEligibleTranslationElement(child));
}

/**
 * Check whether an element should be translated.
 * @param {Element} element Candidate element.
 * @returns {boolean} Whether the element should be translated.
 */
function shouldTranslate(element) {
  return isEligibleTranslationElement(element) && !hasNestedTranslatableElement(element);
}

// 插入翻译结果（行内显示，类似沉浸式翻译）
function insertTranslation(element, translatedText) {
  // 标记原文已翻译
  element.classList.add('ai-translated');

  // 创建行内译文元素
  const translationSpan = document.createElement('span');
  translationSpan.className = 'ai-translation';
  translationSpan.textContent = translatedText;

  // 添加到原文元素内部末尾
  element.appendChild(document.createElement('br'));
  element.appendChild(translationSpan);
}

/**
 * Mark a translated element and refresh visible progress.
 * @param {Element} element Translated element.
 * @param {string} translatedText Translation text.
 * @param {string} modelName Model display name.
 * @param {number} batchSize Configured paragraph batch size.
 */
function applyTranslationResult(element, translatedText, modelName, batchSize) {
  if (!isTranslationEnabled) return;
  if (!element || !translatedText || translatedElementsSet.has(element)) return;

  insertTranslation(element, translatedText);
  translatedElementsSet.add(element);
  translationStats.completed++;
}

// 开始整页翻译（懒加载模式）
async function startPageTranslation() {
  console.log('[Page Copilot] startPageTranslation called');

  if (isTranslationEnabled) {
    // 已开启翻译，关闭并移除
    console.log('[Page Copilot] Disabling translation mode');
    stopPageTranslation();
    return { mode: 'restored', enabled: false };
  }

  const config = await getTranslationConfig();
  console.log('[Page Copilot] Translation config:', { hasApiKey: !!config.apiKey, apiUrl: config.apiUrl, model: config.model });

  if (!config.apiKey) {
    showToast('❌ Please configure an API key in the extension settings first');
    return { mode: 'error', enabled: false, error: 'Please configure an API key first' };
  }

  // 缓存配置
  translationConfig = config;

  // 获取所有可翻译的元素
  const allElements = Array.from(document.querySelectorAll(TRANSLATABLE_SELECTORS));
  console.log('[Page Copilot] Total candidate elements found:', allElements.length);

  allTranslatableElements = allElements.filter(el => shouldTranslate(el));
  console.log('[Page Copilot] Translatable elements after filtering:', allTranslatableElements.length);

  if (allTranslatableElements.length === 0) {
    showToast('⚠️ No translatable content was found on this page');
    return { mode: 'empty', enabled: false, error: 'No translatable content was found on this page' };
  }

  // 初始化统计
  translationStats = { completed: 0, total: allTranslatableElements.length };
  translatedElementsSet.clear();
  pendingElements = [];
  pendingElementsSet.clear();
  isTranslating = false;
  translationInFlightCount = 0;
  translationTextCache.clear();
  translationCompletionShown = false;
  translationRetryCounts = new WeakMap();
  translationSkippedCount = 0;

  // 开启翻译模式
  isTranslationEnabled = true;

  const modelName = getModelDisplayName(config.model);
  console.log(`[Page Copilot] Lazy translation enabled for ${allTranslatableElements.length} paragraphs, model: ${modelName}`);

  // 创建 IntersectionObserver 监听元素进入视口
  setupTranslationObserver();

  showToast('✅ Page translation enabled. Scroll down to translate more.');
  return { mode: 'enabled', enabled: true };
}

// 停止翻译并清理
function stopPageTranslation() {
  isTranslationEnabled = false;

  // 停止观察
  if (translationObserver) {
    translationObserver.disconnect();
    translationObserver = null;
  }

  // 移除所有翻译
  removeTranslations();

  // 重置状态
  pendingElements = [];
  pendingElementsSet.clear();
  isTranslating = false;
  translationInFlightCount = 0;
  translationCompletionShown = false;
  translationRetryCounts = new WeakMap();
  translationSkippedCount = 0;
  translatedElementsSet.clear();
  allTranslatableElements = [];
  translationStats = { completed: 0, total: 0 };
  translationConfig = null;
}

// 设置 IntersectionObserver
function setupTranslationObserver() {
  if (translationObserver) {
    translationObserver.disconnect();
  }

  // 创建观察器，当元素进入视口时触发
  translationObserver = new IntersectionObserver((entries) => {
    if (!isTranslationEnabled) return;

    let hasNewElements = false;

    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;

        // 检查是否已翻译或正在队列中（使用 Set 快速查找）
        if (!translatedElementsSet.has(element) && !pendingElementsSet.has(element)) {
          pendingElements.push(element);
          pendingElementsSet.add(element);
          hasNewElements = true;
          // 元素加入队列后停止观察，避免重复触发
          translationObserver.unobserve(element);
        }
      }
    });

    // 只有有新元素时才触发翻译处理
    if (hasNewElements) {
      processTranslationQueue();
    }
  }, {
    rootMargin: TRANSLATION_PREFETCH_MARGIN,
    threshold: 0.1
  });

  // 观察所有可翻译的元素
  allTranslatableElements.forEach(el => {
    translationObserver.observe(el);
  });

  console.log('[Page Copilot] IntersectionObserver is watching', allTranslatableElements.length, 'elements');
}

/**
 * Collect the next translation batch using paragraph and character budgets.
 * @param {object} config Translation configuration.
 * @param {string} modelName Model display name.
 * @returns {{elementMap: Map<string, Element>, texts: {id: string, text: string}[], batchSize: number}} Batch payload.
 */
function collectNextTranslationBatch(config, modelName) {
  const batchSize = config.batchSize || 30;
  const elementMap = new Map();
  const texts = [];
  let charCount = 0;

  while (pendingElements.length > 0 && texts.length < batchSize) {
    const element = pendingElements.shift();
    pendingElementsSet.delete(element);

    if (!element || translatedElementsSet.has(element)) continue;

    const text = getElementTranslationText(element);
    if (!isMeaningfulTranslationText(text)) continue;

    const cachedTranslation = translationTextCache.get(text);
    if (cachedTranslation) {
      applyTranslationResult(element, cachedTranslation, modelName, batchSize);
      continue;
    }

    if (texts.length > 0 && charCount + text.length > TRANSLATION_MAX_BATCH_CHARS) {
      pendingElements.unshift(element);
      pendingElementsSet.add(element);
      break;
    }

    const id = `p${texts.length}`;
    elementMap.set(id, element);
    texts.push({ id, text });
    charCount += text.length;
  }

  return { elementMap, texts, batchSize };
}

/**
 * Check whether the current translation run has completed.
 */
function maybeFinishTranslation() {
  if (
    translationStats.completed >= translationStats.total
    && isTranslationEnabled
    && translationInFlightCount === 0
    && pendingElements.length === 0
    && !translationCompletionShown
  ) {
    translationCompletionShown = true;
    const skippedText = translationSkippedCount > 0 ? ` (${translationSkippedCount} skipped)` : '';
    showToast(`✅ Translation complete. ${translationStats.completed} paragraphs processed${skippedText}.`);
  }
}

/**
 * Requeue a missing translation once, then mark it as processed to avoid
 * permanently stalled progress when a model omits an item from its response.
 * @param {Element} element Element whose translation did not arrive.
 * @param {string} reason Reason used for debug logging.
 * @param {string} modelName Model display name.
 * @param {number} batchSize Configured paragraph batch size.
 */
function retryOrSkipTranslationElement(element, reason, modelName, batchSize) {
  if (!isTranslationEnabled || !element || translatedElementsSet.has(element)) return;

  const retryCount = translationRetryCounts.get(element) || 0;
  if (retryCount < 1) {
    translationRetryCounts.set(element, retryCount + 1);
    if (!pendingElementsSet.has(element)) {
      pendingElements.push(element);
      pendingElementsSet.add(element);
    }
    console.warn('[Page Copilot] Requeued missing translation:', reason);
    return;
  }

  translatedElementsSet.add(element);
  translationSkippedCount++;
  translationStats.completed++;
  console.warn('[Page Copilot] Skipped untranslated element after retry:', reason);
}

/**
 * Translate one batch and update queue state after it finishes.
 * @param {{elementMap: Map<string, Element>, texts: {id: string, text: string}[], batchSize: number}} batch Batch payload.
 * @param {object} config Translation configuration.
 * @param {string} modelName Model display name.
 */
async function runTranslationBatch(batch, config, modelName) {
  translationInFlightCount++;
  isTranslating = translationInFlightCount > 0;
  const deliveredIds = new Set();

  try {
    console.log(`[Page Copilot] Translating ${batch.texts.length} paragraphs`);
    await translateTextsStream(batch.texts, config, (id, translatedText) => {
      const element = batch.elementMap.get(id);
      const sourceText = batch.texts.find((item) => item.id === id)?.text || '';

      if (sourceText && translatedText) {
        translationTextCache.set(sourceText, translatedText);
      }

      if (translatedText) {
        deliveredIds.add(id);
      }
      applyTranslationResult(element, translatedText, modelName, batch.batchSize);
    });

    batch.texts.forEach((item) => {
      if (!deliveredIds.has(item.id)) {
        retryOrSkipTranslationElement(
          batch.elementMap.get(item.id),
          `missing response for ${item.id}`,
          modelName,
          batch.batchSize
        );
      }
    });
  } catch (error) {
    console.error('[Page Copilot] Translation batch failed:', error);
    batch.texts.forEach((item) => {
      retryOrSkipTranslationElement(
        batch.elementMap.get(item.id),
        error.message || 'batch failed',
        modelName,
        batch.batchSize
      );
    });
  } finally {
    translationInFlightCount = Math.max(0, translationInFlightCount - 1);
    isTranslating = translationInFlightCount > 0;
    processTranslationQueue();
    maybeFinishTranslation();
  }
}

// 处理翻译队列
function processTranslationQueue() {
  if (pendingElements.length === 0 || !isTranslationEnabled || !translationConfig) {
    maybeFinishTranslation();
    return;
  }

  const config = translationConfig;
  const modelName = getModelDisplayName(config.model);

  while (
    translationInFlightCount < TRANSLATION_MAX_CONCURRENT_BATCHES
    && pendingElements.length > 0
    && isTranslationEnabled
  ) {
    const batch = collectNextTranslationBatch(config, modelName);
    if (batch.texts.length === 0) break;
    runTranslationBatch(batch, config, modelName);
  }

  maybeFinishTranslation();
}

// 移除翻译
function removeTranslations() {
  // 移除所有翻译元素
  document.querySelectorAll('.ai-translation').forEach(el => el.remove());

  // 移除已翻译标记
  document.querySelectorAll('.ai-translated').forEach(el => {
    el.classList.remove('ai-translated');
  });

  showToast('🔄 Restored the original page content');
}
