// Background Service Worker - streaming support and page visit history

console.log('[Page Copilot] Background service worker started');

// ==================== 页面访问记录功能 ====================

const MAX_PAGE_HISTORY = 100; // 最多存储100个页面
let lastActiveTab = null; // 记录上一个活动的标签页

// 记录页面访问（只记录标题和URL，不抓取内容）
async function recordPageVisit(tab) {
  if (!tab || !tab.url || !tab.title) return;

  // 忽略特殊页面
  if (tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url === 'about:blank') {
    return;
  }

  try {
    const result = await chrome.storage.session.get(['pageHistory']);
    let pageHistory = result.pageHistory || [];

    // 提取域名
    let domain = '';
    try {
      domain = new URL(tab.url).hostname;
    } catch (e) {
      domain = tab.url;
    }

    // 检查是否已存在相同URL的记录
    const existingIndex = pageHistory.findIndex(p => p.url === tab.url);
    if (existingIndex !== -1) {
      // 移除旧记录
      pageHistory.splice(existingIndex, 1);
    }

    // 添加新记录到开头（只记录元信息，不抓取内容）
    pageHistory.unshift({
      url: tab.url,
      title: tab.title,
      domain: domain,
      tabId: tab.id,  // 保存 tabId 用于后续按需抓取
      visitTime: Date.now()
    });

    // 保留最近100条
    if (pageHistory.length > MAX_PAGE_HISTORY) {
      pageHistory = pageHistory.slice(0, MAX_PAGE_HISTORY);
    }

    await chrome.storage.session.set({ pageHistory });
    console.log('[Page Copilot] Recorded page:', tab.title.substring(0, 30) + '...');
  } catch (error) {
    console.error('[Page Copilot] Failed to record page visit:', error);
  }
}

// 监听标签页激活 - 记录"离开"的页面，而不是"进入"的页面
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    // 先记录上一个页面（用户刚"看过"的页面）
    if (lastActiveTab) {
      await recordPageVisit(lastActiveTab);
    }

    // 更新当前活动标签页
    const currentTab = await chrome.tabs.get(activeInfo.tabId);
    lastActiveTab = currentTab;
  } catch (error) {
    console.error('[Page Copilot] Failed to get tab information:', error);
  }
});

// 监听标签页更新（页面加载完成）- 更新 lastActiveTab 的信息
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    // 更新当前标签页信息（标题可能在加载完成后才有）
    lastActiveTab = tab;
  }
});

// ==================== 扩展安装 ====================

// 扩展安装时
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Page Copilot] Extension installed');

  chrome.contextMenus.create({
    id: 'translateText',
    title: '🌐 Translate Selected Text',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'explainText',
    title: '💡 Explain Selected Text',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'summarizePage',
    title: '📄 Summarize Current Page',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'translatePage',
    title: '🌍 Translate Entire Page',
    contexts: ['page']
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // 翻译整个页面直接在页面上执行，不需要打开侧边栏
  if (info.menuItemId === 'translatePage') {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'translatePage' });
    } catch (error) {
      // Content script 未注入，先注入再重试
      console.log('[Page Copilot] Injecting content script...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['floating-toolbar.css']
        });
        await new Promise(resolve => setTimeout(resolve, 100));
        await chrome.tabs.sendMessage(tab.id, { action: 'translatePage' });
      } catch (retryErr) {
        console.error('[Page Copilot] Failed to translate the page:', retryErr);
      }
    }
    return;
  }

  chrome.sidePanel.open({ tabId: tab.id }).catch(err => console.error(err));
  setTimeout(() => {
    chrome.runtime.sendMessage({
      action: 'contextMenuAction',
      menuItemId: info.menuItemId,
      selectionText: info.selectionText,
      tabId: tab.id
    }).catch(() => { }); // 忽略发送失败（可能侧边栏还没准备好）
  }, 500);
});

// 处理扩展图标点击
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(err => console.error(err));
});

// 处理来自 content.js 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Page Copilot] Background received message:', request.action);

  switch (request.action) {
    case 'translate':
      // 翻译功能：打开侧边栏并触发翻译
      chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: 'contextMenuAction',
            menuItemId: 'translateText',
            selectionText: request.text,
            tabId: sender.tab.id
          }).catch(() => {});
        }, 500);
      });
      sendResponse({ success: true });
      break;

    case 'openSidePanelWithText':
      // AI提问功能：打开侧边栏并传递选中文本
      if (!sender.tab || !sender.tab.id) {
        console.error('[Page Copilot] sender.tab is missing');
        sendResponse({ success: false, error: 'Unable to access tab information' });
        break;
      }
      chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: 'askWithText',
            text: request.text,
            tabId: sender.tab.id
          }).catch(() => {});
        }, 500);
        sendResponse({ success: true });
      }).catch((err) => {
        console.error('[Page Copilot] Failed to open the side panel:', err);
        sendResponse({ success: false, error: err.message });
      });
      break;

    case 'translateText':
      // 页面翻译功能：代理 API 调用（避免 content script 的 CSP 限制）
      (async () => {
        try {
          const { text, config } = request;
          console.log('[Page Copilot] Proxy translation request:', config.apiUrl);

          const response = await fetch(`${config.apiUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: config.model,
              max_tokens: 4096,
              messages: [{
                role: 'user',
                content: `Translate the text below into Simplified Chinese. If the source text is already Chinese, translate it into English. Return only the translation without any explanation or prefix.

${text}`
              }]
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[Page Copilot] Translation API error:', response.status, errorText);
            sendResponse({ success: false, error: `API error: ${response.status}` });
            return;
          }

          const data = await response.json();
          const translatedText = data.content[0].text;
          console.log('[Page Copilot] Translation succeeded');
          sendResponse({ success: true, translatedText });
        } catch (error) {
          console.error('[Page Copilot] Translation request failed:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      break;

    case 'fetchTextResource':
      // Fetch cross-origin text resources that content scripts cannot read due to CORS.
      (async () => {
        try {
          const resourceUrl = new URL(request.url);
          if (!['http:', 'https:'].includes(resourceUrl.protocol)) {
            sendResponse({ success: false, error: 'Unsupported resource URL protocol' });
            return;
          }

          const response = await fetch(resourceUrl.toString(), {
            method: 'GET',
            credentials: 'include'
          });
          const body = await response.text();

          if (!response.ok) {
            sendResponse({ success: false, error: `HTTP ${response.status}`, status: response.status, body });
            return;
          }

          sendResponse({
            success: true,
            body,
            status: response.status,
            contentType: response.headers.get('content-type') || ''
          });
        } catch (error) {
          console.error('[Page Copilot] Failed to fetch text resource:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }

  return true; // 保持消息通道开放
});

// 处理流式连接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'claude-stream') {
    port.onMessage.addListener(async (msg) => {
      if (msg.action === 'streamClaude') {
        try {
          await streamClaudeAPI(msg.messages, msg.config, port);
        } catch (error) {
          port.postMessage({ type: 'error', error: error.message });
        }
      }
    });
  } else if (port.name === 'translate-stream') {
    let isPortConnected = true;
    let abortController = new AbortController();

    port.onDisconnect.addListener(() => {
      isPortConnected = false;
      abortController.abort();
      console.log('[Page Copilot] Translation port disconnected');
    });

    port.onMessage.addListener(async (msg) => {
      if (msg.action === 'streamTranslate') {
        try {
          await streamTranslateAPI(msg.texts, msg.config, port, abortController.signal, () => isPortConnected);
        } catch (error) {
          if (isPortConnected && error.name !== 'AbortError') {
            try {
              port.postMessage({ type: 'error', error: error.message });
            } catch (e) {
              // 端口已关闭，忽略
            }
          }
        }
      }
    });
  }
});

// 流式调用 Claude API
async function streamClaudeAPI(messages, config, port) {
  const { apiKey, apiUrl, model, systemPrompt } = config;

  if (!apiKey) {
    throw new Error('Please configure an API key first');
  }

  const requestBody = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: messages,
    stream: true // 开启流式
  };

  // 如果有系统提示词，添加到请求中
  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  console.log('[Page Copilot] Starting streaming request:', { model: requestBody.model });

  const response = await fetch(`${apiUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后一个可能不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'content_block_delta' && data.delta.text) {
              port.postMessage({ type: 'chunk', content: data.delta.text });
            }
          } catch (e) {
            console.warn('Failed to parse stream data:', e);
          }
        }
      }
    }
    port.postMessage({ type: 'done' });
  } catch (error) {
    console.error('Stream read error:', error);
    port.postMessage({ type: 'error', error: error.message });
  }
}

// 批量流式翻译 API
// texts: [{id, text}] 格式
// abortSignal: 用于取消请求
// isConnected: 检查端口是否仍连接的函数
async function streamTranslateAPI(texts, config, port, abortSignal, isConnected) {
  const { apiKey, apiUrl, model } = config;

  if (!apiKey) {
    throw new Error('Please configure an API key first');
  }

  // 构建批量翻译的 prompt
  // 格式：让 AI 按 [ID]: 翻译结果 的格式返回，每个翻译完成后换行
  const textList = texts.map(t => `[${t.id}]: ${t.text}`).join('\n\n');

  const prompt = `Translate the following paragraphs into Simplified Chinese. If a paragraph is already Chinese, translate it into English.

Requirements:
1. Output each paragraph as soon as it is translated, using the format: [paragraph-id]: translated text
2. Put each translated result on its own line, with a blank line between paragraphs
3. Return only the translated text without extra explanation
4. Preserve the original paragraph ID

Paragraphs to translate:
${textList}`;

  console.log('[Page Copilot] Batch translation request, paragraph count:', texts.length);

  const requestBody = {
    model: model || 'claude-3-5-haiku-20241022',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: prompt
    }],
    stream: true
  };

  const response = await fetch(`${apiUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody),
    signal: abortSignal  // 支持取消请求
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';  // 累积完整响应
  let lastProcessedIndex = 0;  // 上次处理到的位置

  // 安全发送消息（检查端口是否仍连接）
  const safeSend = (msg) => {
    if (isConnected && isConnected()) {
      try {
        port.postMessage(msg);
        return true;
      } catch (e) {
        console.log('[Page Copilot] Failed to send a message, the port may already be closed');
        return false;
      }
    }
    return false;
  };

  try {
    while (true) {
      // 检查是否已断开连接
      if (isConnected && !isConnected()) {
        console.log('[Page Copilot] Port disconnected, stopping translation');
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        console.log('[Page Copilot] Stream read completed, fullText length:', fullText.length);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'content_block_delta' && data.delta?.text) {
              fullText += data.delta.text;

              // 尝试解析已完成的翻译
              // 查找格式：[pN]: 翻译内容\n\n 或 [pN]: 翻译内容（后面是下一个[pN]）
              const pattern = /\[p(\d+)\]:\s*([\s\S]*?)(?=\n\n\[p|\n\[p|$)/g;
              let match;

              while ((match = pattern.exec(fullText)) !== null) {
                const matchEnd = match.index + match[0].length;
                // 只处理新发现的完整翻译
                if (match.index >= lastProcessedIndex && match[2].trim()) {
                  const id = `p${match[1]}`;
                  const translatedText = match[2].trim();

                  // 检查是否是完整的翻译（后面有换行或到达文本末尾）
                  const isComplete = fullText.length > matchEnd &&
                    (fullText[matchEnd] === '\n' || fullText.substring(matchEnd).startsWith('[p'));

                  if (isComplete || done) {
                    console.log('[Page Copilot] Translation completed:', id, translatedText.substring(0, 30) + '...');
                    safeSend({ type: 'translation', id, text: translatedText });
                    lastProcessedIndex = matchEnd;
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Failed to parse stream data:', e);
          }
        }
      }
    }

    // 最后处理剩余的翻译
    console.log('[Page Copilot] Final pass over fullText:', fullText.substring(0, 200) + '...');
    const pattern = /\[p(\d+)\]:\s*([\s\S]*?)(?=\n\n\[p|\n\[p|$)/g;
    let match;
    let matchCount = 0;
    while ((match = pattern.exec(fullText)) !== null) {
      matchCount++;
      if (match.index >= lastProcessedIndex && match[2].trim()) {
        const id = `p${match[1]}`;
        const translatedText = match[2].trim();
        console.log('[Page Copilot] Translation completed (final pass):', id, translatedText.substring(0, 30) + '...');
        safeSend({ type: 'translation', id, text: translatedText });
      }
    }
    console.log('[Page Copilot] Regex match count:', matchCount, 'lastProcessedIndex:', lastProcessedIndex);

    safeSend({ type: 'done' });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[Page Copilot] Translation request cancelled');
    } else {
      console.error('Streaming translation error:', error);
      safeSend({ type: 'error', error: error.message });
    }
  }
}
