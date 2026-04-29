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
    apiFormat: 'anthropic',
    defaultUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5',
    defaultTranslateModel: 'claude-haiku-4-5',
    models: {
      chat: [
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (recommended, fast)' },
        { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (stronger)' },
        { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 (most capable)' }
      ],
      translate: [
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (recommended, fast)' },
        { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (higher quality)' },
        { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 (most capable)' }
      ]
    }
  },
  glm: {
    name: 'Zhipu GLM',
    apiFormat: 'anthropic',
    defaultUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModel: 'glm-4.7',
    defaultTranslateModel: 'glm-4.7',
    models: {
      chat: [
        { value: 'glm-4.7', label: 'GLM-4.7 (recommended)' },
        { value: 'glm-4.7-flash', label: 'GLM-4.7 Flash (fast)' }
      ],
      translate: [
        { value: 'glm-4.7', label: 'GLM-4.7' },
        { value: 'glm-4.7-flash', label: 'GLM-4.7 Flash (fast)' }
      ]
    }
  },
  openai: {
    name: 'OpenAI',
    apiFormat: 'openai',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4-mini',
    defaultTranslateModel: 'gpt-5.4-mini',
    models: {
      chat: [
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (recommended)' },
        { value: 'gpt-5-mini', label: 'GPT-5 Mini (lower cost)' },
        { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano (lowest cost)' },
        { value: 'gpt-5.5', label: 'GPT-5.5 (stronger)' }
      ],
      translate: [
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (recommended)' },
        { value: 'gpt-5-mini', label: 'GPT-5 Mini (lower cost)' },
        { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano (lowest cost)' }
      ]
    }
  },
  gemini: {
    name: 'Google Gemini',
    apiFormat: 'openai',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    defaultTranslateModel: 'gemini-2.5-flash',
    models: {
      chat: [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
        { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (lowest cost)' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
      ],
      translate: [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
        { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (lower cost)' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
      ]
    }
  },
  grok: {
    name: 'xAI Grok',
    apiFormat: 'openai',
    defaultUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-1-fast-non-reasoning',
    defaultTranslateModel: 'grok-4-1-fast-non-reasoning',
    models: {
      chat: [
        { value: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast Non-Reasoning (recommended, best value)' },
        { value: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast Reasoning' }
      ],
      translate: [
        { value: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast Non-Reasoning (recommended, best value)' },
        { value: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast Reasoning' }
      ]
    }
  },
  deepseek: {
    name: 'DeepSeek',
    apiFormat: 'openai',
    defaultUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    defaultTranslateModel: 'deepseek-v4-flash',
    models: {
      chat: [
        { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (recommended)' },
        { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }
      ],
      translate: [
        { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (recommended)' },
        { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }
      ]
    }
  },
  qwen: {
    name: 'Alibaba Qwen',
    apiFormat: 'openai',
    defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.6-plus',
    defaultTranslateModel: 'qwen3.6-plus',
    models: {
      chat: [
        { value: 'qwen3.6-plus', label: 'Qwen3.6 Plus (recommended)' },
        { value: 'qwen3.6-turbo', label: 'Qwen3.6 Turbo (fast)' },
        { value: 'qwen-max', label: 'Qwen Max' }
      ],
      translate: [
        { value: 'qwen3.6-plus', label: 'Qwen3.6 Plus (recommended)' },
        { value: 'qwen3.6-turbo', label: 'Qwen3.6 Turbo (fast)' },
        { value: 'qwen-max', label: 'Qwen Max' }
      ]
    }
  },
  kimi: {
    name: 'Moonshot Kimi',
    apiFormat: 'openai',
    defaultUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.6',
    defaultTranslateModel: 'kimi-k2.6',
    models: {
      chat: [
        { value: 'kimi-k2.6', label: 'Kimi K2.6 (recommended)' },
        { value: 'kimi-k2.5', label: 'Kimi K2.5' }
      ],
      translate: [
        { value: 'kimi-k2.6', label: 'Kimi K2.6 (recommended)' },
        { value: 'kimi-k2.5', label: 'Kimi K2.5' }
      ]
    }
  },
  openrouter: {
    name: 'OpenRouter',
    apiFormat: 'openai',
    defaultUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-5.4-mini',
    defaultTranslateModel: 'openai/gpt-5.4-mini',
    models: {
      chat: [
        { value: 'openai/gpt-5.4-mini', label: 'OpenAI GPT-5.4 Mini (recommended)' },
        { value: 'openai/gpt-5-mini', label: 'OpenAI GPT-5 Mini' },
        { value: 'openai/gpt-5.4-nano', label: 'OpenAI GPT-5.4 Nano' },
        { value: 'openai/gpt-5.5', label: 'OpenAI GPT-5.5' }
      ],
      translate: [
        { value: 'openai/gpt-5.4-mini', label: 'OpenAI GPT-5.4 Mini (recommended)' },
        { value: 'openai/gpt-5-mini', label: 'OpenAI GPT-5 Mini' },
        { value: 'openai/gpt-5.4-nano', label: 'OpenAI GPT-5.4 Nano' },
        { value: 'openai/gpt-5.5', label: 'OpenAI GPT-5.5' }
      ]
    }
  },
  siliconflow: {
    name: 'SiliconFlow',
    apiFormat: 'openai',
    defaultUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Flash',
    defaultTranslateModel: 'deepseek-ai/DeepSeek-V4-Flash',
    models: {
      chat: [
        { value: 'deepseek-ai/DeepSeek-V4-Flash', label: 'DeepSeek V4 Flash (recommended)' },
        { value: 'deepseek-ai/DeepSeek-V4-Pro', label: 'DeepSeek V4 Pro' },
        { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
        { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5 72B Instruct' }
      ],
      translate: [
        { value: 'deepseek-ai/DeepSeek-V4-Flash', label: 'DeepSeek V4 Flash (recommended)' },
        { value: 'deepseek-ai/DeepSeek-V4-Pro', label: 'DeepSeek V4 Pro' },
        { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
        { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5 72B Instruct' }
      ]
    }
  },
  minimax: {
    name: 'MiniMax',
    apiFormat: 'openai',
    defaultUrl: 'https://api.minimax.io/v1',
    defaultModel: 'minimax-m2.7',
    defaultTranslateModel: 'minimax-m2.7',
    models: {
      chat: [
        { value: 'minimax-m2.7', label: 'MiniMax M2.7 (recommended)' },
        { value: 'minimax-m2.7-highspeed', label: 'MiniMax M2.7 Highspeed' },
        { value: 'minimax-m2.5', label: 'MiniMax M2.5' }
      ],
      translate: [
        { value: 'minimax-m2.7', label: 'MiniMax M2.7 (recommended)' },
        { value: 'minimax-m2.7-highspeed', label: 'MiniMax M2.7 Highspeed' },
        { value: 'minimax-m2.5', label: 'MiniMax M2.5' }
      ]
    }
  },
  mimo: {
    name: 'Xiaomi MiMo',
    apiFormat: 'openai',
    defaultUrl: '',
    defaultModel: 'mimo-v2-flash',
    defaultTranslateModel: 'mimo-v2-flash',
    models: {
      chat: [
        { value: 'mimo-v2-flash', label: 'MiMo V2 Flash (recommended)' },
        { value: 'mimo-v2.5-pro-flash', label: 'MiMo V2.5 Pro Flash' }
      ],
      translate: [
        { value: 'mimo-v2-flash', label: 'MiMo V2 Flash (recommended)' },
        { value: 'mimo-v2.5-pro-flash', label: 'MiMo V2.5 Pro Flash' }
      ]
    }
  },
  customOpenAI: {
    name: 'Custom OpenAI-compatible',
    apiFormat: 'openai',
    defaultUrl: '',
    defaultModel: '',
    defaultTranslateModel: '',
    models: {
      chat: [
        { value: '', label: 'Type your model name' }
      ],
      translate: [
        { value: '', label: 'Type your model name' }
      ]
    }
  },
  customAnthropic: {
    name: 'Custom Anthropic-compatible',
    apiFormat: 'anthropic',
    defaultUrl: '',
    defaultModel: '',
    defaultTranslateModel: '',
    models: {
      chat: [
        { value: '', label: 'Type your model name' }
      ],
      translate: [
        { value: '', label: 'Type your model name' }
      ]
    }
  }
};

const PROVIDER_GROUPS = [
  {
    label: 'Global providers',
    providers: ['grok']
  },
  {
    label: 'China providers',
    providers: ['glm']
  },
  {
    label: 'Custom',
    providers: ['customOpenAI', 'customAnthropic']
  }
];

const DEFAULT_PROVIDER = 'glm';
const VISIBLE_PROVIDERS = new Set(PROVIDER_GROUPS.flatMap(group => group.providers));

// Global state
let conversationHistory = [];
let lastSummarySource = null;
let lastTranscriptDownload = null;
let lastVideoTranscriptDiagnostic = null;
let currentProvider = DEFAULT_PROVIDER;  // Currently selected provider
let isPageTranslationEnabled = false;
let translationStateRequestId = 0;
let modelInputFocusValue = '';
let translateModelInputFocusValue = '';
let config = {
  apiKey: '',
  apiUrl: '',
  apiFormat: 'anthropic',
  model: '',
  translateModel: '',
  translateBatchSize: 30,
  systemPrompt: '',
  contextPageCount: 10,
  retentionHours: 48
};

let globalSettings = {
  translateBatchSize: 30,
  systemPrompt: '',
  contextPageCount: 10,
  retentionHours: 48
};

/**
 * Merge active provider configuration with global settings for runtime use.
 * @param {object} providerConfig Provider-specific settings.
 * @returns {object} Runtime configuration.
 */
function buildRuntimeConfig(providerConfig) {
  return {
    ...providerConfig,
    ...globalSettings
  };
}

/**
 * Build the default persisted settings for a provider preset.
 * @param {string} provider Provider id.
 * @returns {object} Default provider settings.
 */
function buildDefaultProviderConfig(provider) {
  const providerSpec = MODEL_CONFIG[provider] || MODEL_CONFIG[DEFAULT_PROVIDER];
  return {
    apiKey: '',
    apiUrl: providerSpec.defaultUrl,
    apiFormat: providerSpec.apiFormat,
    model: providerSpec.defaultModel,
    translateModel: providerSpec.defaultTranslateModel
  };
}

/**
 * Check whether a provider should be exposed in the settings UI.
 * @param {string} provider Provider id.
 * @returns {boolean} Whether the provider is visible.
 */
function isVisibleProvider(provider) {
  return VISIBLE_PROVIDERS.has(provider) && !!MODEL_CONFIG[provider];
}

// Per-provider configuration store
let providerConfigs = Object.fromEntries(
  Object.keys(MODEL_CONFIG).map((provider) => [provider, buildDefaultProviderConfig(provider)])
);
let providerDraftConfigs = cloneProviderConfigs(providerConfigs);

/**
 * Clone per-provider configuration objects.
 * @param {object} source Provider configuration map.
 * @returns {object} Cloned provider configuration map.
 */
function cloneProviderConfigs(source) {
  return Object.fromEntries(
    Object.entries(source).map(([provider, providerConfig]) => [provider, { ...providerConfig }])
  );
}

const LEGACY_MODEL_MIGRATIONS = {
  'claude-3-5-haiku-20241022': 'claude-haiku-4-5',
  'glm-4.5-air': 'glm-4.7-flash',
  'grok-4.20': 'grok-4-1-fast-non-reasoning',
  'grok-4.20-reasoning': 'grok-4-1-fast-reasoning',
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-flash',
  'qwen-plus': 'qwen3.6-plus',
  'qwen-turbo': 'qwen3.6-plus',
  'MiniMax-Text-01': 'minimax-m2.7',
  'deepseek-ai/DeepSeek-V3': 'deepseek-ai/DeepSeek-V4-Flash',
  'openai/gpt-4.1-mini': 'openai/gpt-5.4-mini',
  'moonshot-v1-32k': 'kimi-k2.6',
  'moonshot-v1-128k': 'kimi-k2.6'
};

/**
 * Migrate legacy saved model ids to current presets.
 * @param {object} providerConfig Saved provider configuration.
 * @returns {{config: object, changed: boolean}} Migrated config and change flag.
 */
function migrateProviderConfig(providerConfig) {
  const migratedConfig = { ...providerConfig };
  let changed = false;

  ['model', 'translateModel'].forEach((field) => {
    const nextModel = LEGACY_MODEL_MIGRATIONS[migratedConfig[field]];
    if (nextModel) {
      migratedConfig[field] = nextModel;
      changed = true;
    }
  });

  return { config: migratedConfig, changed };
}

// DOM elements
const elements = {
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  apiProvider: document.getElementById('apiProvider'),
  customProviderHint: document.getElementById('customProviderHint'),
  apiKey: document.getElementById('apiKey'),
  toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
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
  updateProviderOptions();
  await loadConfig();
  await loadHistory(); // Load stored history
  updateModelOptions();  // Refresh model options
  bindEvents();
  updateUIState();
  await syncTranslatePageButtonState();
  console.log('[Page Copilot] Side panel initialized');
}

/**
 * Populate the provider selector from the provider registry.
 */
function updateProviderOptions() {
  elements.apiProvider.innerHTML = PROVIDER_GROUPS
    .map((group) => {
      const options = group.providers
        .filter(isVisibleProvider)
        .map((provider) => `<option value="${provider}">${MODEL_CONFIG[provider].name}</option>`)
        .join('');
      return `<optgroup label="${group.label}">${options}</optgroup>`;
    })
    .join('');
}

// Update model select options
function updateModelOptions() {
  const providerConfig = MODEL_CONFIG[currentProvider];

  // Update chat model suggestions while still allowing custom model names
  document.getElementById('modelOptions').innerHTML = providerConfig.models.chat
    .map(m => `<option value="${m.value}">${m.label}</option>`)
    .join('');

  // Update translation model suggestions while still allowing custom model names
  document.getElementById('translateModelOptions').innerHTML = providerConfig.models.translate
    .map(m => `<option value="${m.value}">${m.label}</option>`)
    .join('');
}

/**
 * Update helper text that only applies to custom providers.
 */
function updateCustomProviderHint() {
  const isCustomProvider = currentProvider === 'customOpenAI' || currentProvider === 'customAnthropic';
  elements.customProviderHint.classList.toggle('hidden', !isCustomProvider);
}

/**
 * Switch the active provider and persist the provider choice only.
 * @param {string} provider Provider id.
 */
async function switchProvider(provider) {
  if (!isVisibleProvider(provider)) return;

  // Keep unsaved edits in memory only so switching back does not lose form state.
  providerDraftConfigs[currentProvider] = {
    apiKey: elements.apiKey.value.trim(),
    apiUrl: elements.apiUrl.value.trim() || MODEL_CONFIG[currentProvider].defaultUrl,
    apiFormat: MODEL_CONFIG[currentProvider].apiFormat,
    model: elements.model.value.trim() || MODEL_CONFIG[currentProvider].defaultModel,
    translateModel: elements.translateModel.value.trim() || MODEL_CONFIG[currentProvider].defaultTranslateModel
  };

  // Switch to the new provider
  currentProvider = provider;
  try {
    await chrome.storage.local.set({ currentProvider: provider });
  } catch (error) {
    console.warn('[Page Copilot] Failed to persist provider selection:', error);
  }

  const { config: newConfig } = migrateProviderConfig(
    providerDraftConfigs[provider] || providerConfigs[provider] || buildDefaultProviderConfig(provider)
  );
  providerDraftConfigs[provider] = newConfig;

  // Refresh config
  config = buildRuntimeConfig(newConfig);

  // Refresh UI
  elements.apiProvider.value = provider;
  elements.apiKey.value = config.apiKey || '';
  elements.apiUrl.value = config.apiUrl || MODEL_CONFIG[provider].defaultUrl;
  elements.model.value = config.model || MODEL_CONFIG[provider].defaultModel || '';
  elements.translateModel.value = config.translateModel || MODEL_CONFIG[provider].defaultTranslateModel || '';
  elements.translateBatchSize.value = globalSettings.translateBatchSize?.toString() || '30';
  elements.systemPrompt.value = globalSettings.systemPrompt || '';
  elements.contextPageCount.value = globalSettings.contextPageCount?.toString() || '10';
  elements.retentionHours.value = globalSettings.retentionHours?.toString() || '48';

  // Refresh model options
  updateModelOptions();

  // Re-apply selected models
  elements.model.value = config.model || '';
  elements.translateModel.value = config.translateModel || '';
  updateCustomProviderHint();

  console.log('[Page Copilot] Switched provider:', provider);
}

// Load configuration
async function loadConfig() {
  try {
    const result = await chrome.storage.local.get([
      'currentProvider',
      'providerConfigs',
      'globalSettings',
      'claudeConfig',
      'glmConfig'
    ]);

    // Load current provider
    currentProvider = isVisibleProvider(result.currentProvider) ? result.currentProvider : DEFAULT_PROVIDER;
    let configChanged = false;

    if (result.globalSettings) {
      globalSettings = { ...globalSettings, ...result.globalSettings };
    } else {
      const legacyGlobalSource = result.providerConfigs?.[currentProvider]
        || result.claudeConfig
        || result.glmConfig
        || {};
      globalSettings = {
        translateBatchSize: parseInt(legacyGlobalSource.translateBatchSize, 10) || globalSettings.translateBatchSize,
        systemPrompt: legacyGlobalSource.systemPrompt || globalSettings.systemPrompt,
        contextPageCount: parseInt(legacyGlobalSource.contextPageCount, 10) || globalSettings.contextPageCount,
        retentionHours: parseInt(legacyGlobalSource.retentionHours, 10) || globalSettings.retentionHours
      };
      configChanged = true;
    }

    if (result.providerConfigs) {
      Object.entries(result.providerConfigs).forEach(([provider, storedConfig]) => {
        if (MODEL_CONFIG[provider]) {
          const { config: migratedConfig, changed } = migrateProviderConfig(storedConfig);
          if (changed) configChanged = true;
          providerConfigs[provider] = {
            ...providerConfigs[provider],
            ...migratedConfig,
            apiFormat: MODEL_CONFIG[provider].apiFormat
          };
        }
      });
    }

    // Load legacy per-provider configuration
    if (result.claudeConfig) {
      const { config: migratedConfig, changed } = migrateProviderConfig(result.claudeConfig);
      if (changed || !result.providerConfigs?.claude) configChanged = true;
      providerConfigs.claude = { ...providerConfigs.claude, ...migratedConfig, apiFormat: 'anthropic' };
    }
    if (result.glmConfig) {
      const { config: migratedConfig, changed } = migrateProviderConfig(result.glmConfig);
      if (changed || !result.providerConfigs?.glm) configChanged = true;
      providerConfigs.glm = { ...providerConfigs.glm, ...migratedConfig, apiFormat: 'anthropic' };
    }

    if (configChanged) {
      await chrome.storage.local.set({
        providerConfigs,
        globalSettings,
        claudeConfig: providerConfigs.claude,
        glmConfig: providerConfigs.glm
      });
    }

    providerDraftConfigs = cloneProviderConfigs(providerConfigs);

    // Use the active provider configuration
    config = buildRuntimeConfig(providerConfigs[currentProvider]);

    // Refresh UI
    elements.apiProvider.value = currentProvider;
    elements.apiKey.value = config.apiKey || '';
    elements.apiUrl.value = config.apiUrl || MODEL_CONFIG[currentProvider].defaultUrl;
    elements.model.value = config.model || MODEL_CONFIG[currentProvider].defaultModel || '';
    elements.translateModel.value = config.translateModel || MODEL_CONFIG[currentProvider].defaultTranslateModel || '';
    elements.translateBatchSize.value = globalSettings.translateBatchSize?.toString() || '30';
    elements.systemPrompt.value = globalSettings.systemPrompt || '';
    elements.contextPageCount.value = globalSettings.contextPageCount?.toString() || '10';
    elements.retentionHours.value = globalSettings.retentionHours?.toString() || '48';
    updateCustomProviderHint();

    updateAPIStatus();
  } catch (error) {
    console.error('[Page Copilot] Failed to load config:', error);
  }
}

// Save configuration
async function saveConfig() {
  const provider = elements.apiProvider.value;
  const providerSpec = MODEL_CONFIG[provider];
  const apiUrl = elements.apiUrl.value.trim() || providerSpec.defaultUrl;
  const model = elements.model.value.trim() || providerSpec.defaultModel;
  const translateModel = elements.translateModel.value.trim() || providerSpec.defaultTranslateModel;

  if (!apiUrl) {
    addSystemMessage('❌ Please enter an API URL for this provider', 'error');
    return;
  }

  if (!model || !translateModel) {
    addSystemMessage('❌ Please enter both chat and translation model names for this provider', 'error');
    return;
  }

  // Build configuration object
  const configToSave = {
    apiKey: elements.apiKey.value.trim(),
    apiUrl,
    apiFormat: providerSpec.apiFormat,
    model,
    translateModel
  };

  globalSettings = {
    translateBatchSize: parseInt(elements.translateBatchSize.value) || 30,
    systemPrompt: elements.systemPrompt.value.trim(),
    contextPageCount: parseInt(elements.contextPageCount.value) || 10,
    retentionHours: parseInt(elements.retentionHours.value) || 48
  };

  // Update the active provider configuration
  providerConfigs[provider] = configToSave;
  providerDraftConfigs[provider] = { ...configToSave };
  config = buildRuntimeConfig(configToSave);
  currentProvider = provider;

  try {
    await chrome.storage.local.set({
      currentProvider: provider,
      providerConfigs,
      globalSettings,
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
    void switchProvider(e.target.value);
  });

  elements.saveSettings.addEventListener('click', saveConfig);
  elements.toggleApiKeyVisibility.addEventListener('click', toggleApiKeyVisibility);

  elements.summarizeBtn.addEventListener('click', handleSummarize);
  elements.translateBtn.addEventListener('click', handleTranslate);
  elements.explainBtn.addEventListener('click', handleExplain);
  elements.historyBtn.addEventListener('click', toggleHistoryPanel);
  elements.closeHistoryBtn.addEventListener('click', () => elements.historyPanel.classList.add('hidden'));
  elements.translatePageBtn.addEventListener('click', handleTranslatePage);

  elements.model.addEventListener('focus', () => {
    modelInputFocusValue = elements.model.value;
    elements.model.value = '';
  });

  elements.model.addEventListener('blur', () => {
    if (!elements.model.value.trim()) {
      elements.model.value = modelInputFocusValue;
    }
  });

  elements.translateModel.addEventListener('focus', () => {
    translateModelInputFocusValue = elements.translateModel.value;
    elements.translateModel.value = '';
  });

  elements.translateModel.addEventListener('blur', () => {
    if (!elements.translateModel.value.trim()) {
      elements.translateModel.value = translateModelInputFocusValue;
    }
  });

  chrome.tabs.onActivated.addListener(() => {
    syncTranslatePageButtonState();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.active) return;

    if (changeInfo.url || changeInfo.status === 'loading') {
      updateTranslatePageButtonState(false);
      return;
    }

    if (changeInfo.status === 'complete') {
      syncTranslatePageButtonState();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      syncTranslatePageButtonState();
    }
  });

  elements.sendBtn.addEventListener('click', handleSend);
  elements.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  elements.clearBtn.addEventListener('click', handleClear);

  // Copy interactions
  elements.messages.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const messageCopyBtn = target.closest('.copy-message-btn');
    if (messageCopyBtn) {
      const btn = messageCopyBtn;
      const messageDiv = btn.closest('.message.assistant');
      const renderedText = messageDiv?.querySelector('.message-content')?.innerText;
      const text = renderedText || messageDiv?.dataset.copyText || '';

      navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.classList.remove('copied');
        }, 1600);
      });
      return;
    }

    if (target.classList.contains('copy-btn')) {
      const btn = target;
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

/**
 * Add a copy button to an assistant message.
 * @param {HTMLElement} messageDiv Assistant message container.
 * @param {string} text Text copied by the button.
 */
function addAssistantCopyButton(messageDiv, text = '') {
  if (!messageDiv.classList.contains('assistant')) return;
  if (messageDiv.querySelector('.copy-message-btn')) return;

  messageDiv.dataset.copyText = text;
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-message-btn';
  button.innerHTML = `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h6A1.5 1.5 0 0 1 16 3.5v6A1.5 1.5 0 0 1 14.5 11h-6A1.5 1.5 0 0 1 7 9.5v-6Z"></path>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H6v3.5A2.5 2.5 0 0 0 8.5 12H12v.5A1.5 1.5 0 0 1 10.5 14h-5A1.5 1.5 0 0 1 4 12.5v-5Z"></path>
    </svg>
  `;
  button.title = 'Copy response';
  button.setAttribute('aria-label', 'Copy response');
  actions.appendChild(button);
  messageDiv.appendChild(actions);
}

/**
 * Update the text copied by an assistant message copy button.
 * @param {HTMLElement} messageDiv Assistant message container.
 * @param {string} text Latest assistant response text.
 */
function updateAssistantCopyText(messageDiv, text) {
  if (!messageDiv.classList.contains('assistant')) return;
  messageDiv.dataset.copyText = text || '';
}

/**
 * Toggle API key visibility in the settings form.
 */
function toggleApiKeyVisibility() {
  const shouldShow = elements.apiKey.type === 'password';
  elements.apiKey.type = shouldShow ? 'text' : 'password';
  elements.toggleApiKeyVisibility.textContent = shouldShow ? '🙈' : '👁';
  elements.toggleApiKeyVisibility.title = shouldShow ? 'Hide API key' : 'Show API key';
  elements.toggleApiKeyVisibility.setAttribute('aria-label', shouldShow ? 'Hide API key' : 'Show API key');
}

// Update UI state
function updateUIState() {
  const hasApiKey = !!config.apiKey;
  elements.summarizeBtn.disabled = !hasApiKey;
  elements.translateBtn.disabled = !hasApiKey;
  elements.explainBtn.disabled = !hasApiKey;
  elements.translatePageBtn.disabled = !hasApiKey;
  elements.sendBtn.disabled = !hasApiKey;
  updateTranslatePageButtonState(false);

  if (!hasApiKey) {
    elements.settingsPanel.classList.remove('hidden');
    addSystemMessage('⚠️ Please configure your API key in Settings first', 'error');
  }
}

/**
 * Update the full-page translation button to reflect page translation state.
 * @param {boolean} enabled Whether full-page translation is currently active.
 */
function updateTranslatePageButtonState(enabled) {
  isPageTranslationEnabled = enabled;
  elements.translatePageBtn.textContent = enabled ? '✅ Page Translated' : '🌍 Translate Entire Page';
  elements.translatePageBtn.title = enabled ? 'Click again to restore the original page' : 'Translate the current page';
}

/**
 * Query the content script for the current page's real translation state.
 * @param {chrome.tabs.Tab} tab Current browser tab.
 * @returns {Promise<boolean>} Whether the page is currently translated.
 */
async function queryPageTranslationState(tab) {
  if (!tab?.id) return false;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageTranslationState' });
    return !!response?.success && !!response.enabled;
  } catch (error) {
    return false;
  }
}

/**
 * Sync the full-page translation button with the active page.
 */
async function syncTranslatePageButtonState() {
  const requestId = ++translationStateRequestId;

  if (!config.apiKey) {
    updateTranslatePageButtonState(false);
    return;
  }

  const tab = await getCurrentTab();
  const enabled = await queryPageTranslationState(tab);

  if (requestId === translationStateRequestId) {
    updateTranslatePageButtonState(enabled);
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

/**
 * Inject the latest extension scripts into a tab when an existing page missed them.
 * @param {number} tabId Current tab id.
 * @returns {Promise<void>}
 */
async function injectPageScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['video-transcript.js', 'content.js']
  });
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['floating-toolbar.css']
  });
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Get page content
async function getPageContent() {
  const tab = await getCurrentTab();
  if (!tab?.id) return null;

  const isSupportedVideoPage = isSupportedVideoUrl(tab?.url || '');
  lastVideoTranscriptDiagnostic = null;
  const videoTranscript = await getVideoTranscriptContent(tab);
  if (videoTranscript) {
    return videoTranscript;
  }

  const readPageContent = () => new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response?.data || null);
    });
  });

  try {
    const pageContent = await readPageContent();
    if (pageContent && isSupportedVideoPage) {
      pageContent.videoTranscriptStatus = 'unavailable';
      pageContent.videoTranscriptDiagnostic = lastVideoTranscriptDiagnostic;
    }
    return pageContent;
  } catch (error) {
    console.log('[Page Copilot] Content script unavailable, injecting latest scripts...', error);
  }

  try {
    await injectPageScripts(tab.id);
    const pageContent = await readPageContent();
    if (pageContent && isSupportedVideoPage) {
      pageContent.videoTranscriptStatus = 'unavailable';
      pageContent.videoTranscriptDiagnostic = lastVideoTranscriptDiagnostic;
    }
    return pageContent;
  } catch (error) {
    console.warn('[Page Copilot] Failed to read page content after script injection:', error);
    return null;
  }
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
 * Pick the most actionable transcript diagnostic from multiple injection worlds.
 * @param {object[]} diagnostics Diagnostics collected from transcript extraction.
 * @returns {object|null} Best diagnostic for the user to report.
 */
function selectBestTranscriptDiagnostic(diagnostics) {
  const priority = [
    'caption fetch failed',
    'caption parse failed',
    'caption url empty',
    'no caption tracks',
    'no player response',
    'extractor exception'
  ];

  return [...diagnostics].sort((a, b) => {
    const aIndex = priority.indexOf(a.reason);
    const bIndex = priority.indexOf(b.reason);
    return (aIndex === -1 ? priority.length : aIndex) - (bIndex === -1 ? priority.length : bIndex);
  })[0] || null;
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
  const injectionWorlds = hostname.includes('youtube.com') ? ['MAIN', 'ISOLATED'] : ['ISOLATED'];
  const diagnostics = [];

  for (const injectionWorld of injectionWorlds) {
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

      if (result?.result?.contentType === 'videoTranscript') {
        return result.result;
      }

      if (result?.result?.transcriptUnavailable) {
        diagnostics.push({ ...result.result, world: injectionWorld });
      }
    } catch (error) {
      console.warn(`[Page Copilot] Failed to read video transcript in ${injectionWorld} world:`, error);
      diagnostics.push({
        platform: hostname.includes('youtube.com') ? 'YouTube' : 'Bilibili',
        reason: 'extractor exception',
        details: { message: error.message },
        world: injectionWorld
      });
    }
  }

  lastVideoTranscriptDiagnostic = selectBestTranscriptDiagnostic(diagnostics);
  return null;
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
  if (type === 'assistant') {
    addAssistantCopyButton(messageDiv, content);
  }
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

/**
 * Format safe transcript extraction diagnostics for user-side debugging.
 * @param {object|null} diagnostic Structured transcript diagnostic.
 * @returns {string} Human-readable diagnostic line.
 */
function formatTranscriptDiagnostic(diagnostic) {
  if (!diagnostic) return '';

  const details = diagnostic.details || {};
  const detailParts = [];

  if (diagnostic.world) detailParts.push(`world=${diagnostic.world}`);
  if (details.language) detailParts.push(`language=${details.language}`);
  if (typeof details.hasVideoId === 'boolean') detailParts.push(`hasVideoId=${details.hasVideoId}`);
  if (typeof details.hasInnertubeApiKey === 'boolean') detailParts.push(`hasApiKey=${details.hasInnertubeApiKey}`);
  if (typeof details.hasInitialData === 'boolean') detailParts.push(`hasInitialData=${details.hasInitialData}`);
  if (typeof details.captionTrackCount === 'number') detailParts.push(`captionTracks=${details.captionTrackCount}`);
  if (Array.isArray(details.failures) && details.failures.length) {
    detailParts.push(`failures=${details.failures.join(' | ')}`);
  }
  if (Array.isArray(details.parseFailures) && details.parseFailures.length) {
    detailParts.push(`parse=${details.parseFailures.join(' | ')}`);
  }
  if (details.message) detailParts.push(`message=${details.message}`);

  const suffix = detailParts.length ? ` (${detailParts.join('; ')})` : '';
  return `Diagnostic: ${diagnostic.platform || 'video'} / ${diagnostic.reason || 'unknown'}${suffix}`;
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
  addAssistantCopyButton(messageDiv);
  elements.messages.appendChild(messageDiv);

  callClaudeStream(
    finalPrompt,
    (chunk) => {
      currentResponse += chunk;
      contentDiv.innerHTML = renderMarkdown(currentResponse);
      updateAssistantCopyText(messageDiv, currentResponse);
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
    addSystemMessage('❌ Unable to read this page. Please refresh the page and try again.', 'error');
    setButtonsDisabled(false);
    return;
  }
  if (pageContent.videoTranscriptStatus === 'unavailable') {
    const diagnosticText = formatTranscriptDiagnostic(pageContent.videoTranscriptDiagnostic);
    addSystemMessage(
      `⚠️ Captions were not readable from this video page. Falling back to visible page text.${diagnosticText ? `\n${diagnosticText}` : ''}`,
      'error'
    );
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
  addAssistantCopyButton(messageDiv);
  elements.messages.appendChild(messageDiv);

  callClaudeStream(
    prompt,
    (chunk) => {
      currentResponse += chunk;
      contentDiv.innerHTML = renderMarkdown(currentResponse);
      updateAssistantCopyText(messageDiv, currentResponse);
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
  addAssistantCopyButton(messageDiv);
  elements.messages.appendChild(messageDiv);

  callClaudeStream(
    prompt,
    (chunk) => {
      currentResponse += chunk;
      contentDiv.innerHTML = renderMarkdown(currentResponse);
      updateAssistantCopyText(messageDiv, currentResponse);
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
  await syncTranslatePageButtonState();

  const tab = await getCurrentTab();
  if (!tab) {
    addSystemMessage('❌ Unable to access the current page', 'error');
    return;
  }

  const applyTranslatePageResult = (response) => {
    if (!response?.success) {
      addSystemMessage(`❌ Translation failed: ${response?.error || 'unknown error'}`, 'error');
      return;
    }

    if (response.mode === 'enabled') {
      updateTranslatePageButtonState(true);
      addSystemMessage('✅ Page translation enabled. Scroll the webpage to translate more content.');
      return;
    }

    if (response.mode === 'restored') {
      updateTranslatePageButtonState(false);
      addSystemMessage('🔄 Restored the original page content.');
      return;
    }

    if (response.mode === 'empty') {
      updateTranslatePageButtonState(false);
      addSystemMessage('⚠️ No translatable content was found on this page', 'error');
      return;
    }

    updateTranslatePageButtonState(false);
  };

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'translatePage' });
    applyTranslatePageResult(response);
  } catch (error) {
    // If this fails, the content script may be missing; inject it and retry
    console.log('[Page Copilot] Content script missing, attempting injection...');
    try {
      await injectPageScripts(tab.id);
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'translatePage' });
      applyTranslatePageResult(response);
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
  addAssistantCopyButton(messageDiv);
  elements.messages.appendChild(messageDiv);

  callClaudeStream(
    prompt,
    (chunk) => {
      currentResponse += chunk;
      contentDiv.innerHTML = renderMarkdown(currentResponse);
      updateAssistantCopyText(messageDiv, currentResponse);
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
