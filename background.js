// 后台服务脚本
// 处理评论生成和翻译请求

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-3.5-turbo';
const REQUEST_TIMEOUT_MS = 45000;
const PROMPT_PREVIEW_SIZE = 200;
const PROXY_LIST_KEY = 'proxyList';

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络或模型响应速度');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPromptPreview(text, size = PROMPT_PREVIEW_SIZE) {
  if (!text) {
    return '';
  }
  return text.length > size ? text.slice(0, size) : text;
}

function buildPromptTail(text, size = PROMPT_PREVIEW_SIZE) {
  if (!text) {
    return '';
  }
  return text.length > size ? text.slice(-size) : text;
}

function templateHasVars(template, keys) {
  if (!template) {
    return false;
  }
  return keys.some((key) => {
    const doublePattern = new RegExp(`{{\\s*${key}\\s*}}`, 'i');
    const singlePattern = new RegExp(`{\\s*${key}\\s*}`, 'i');
    return doublePattern.test(template) || singlePattern.test(template);
  });
}

function replaceTemplateVars(template, replacements) {
  let output = template || '';
  Object.entries(replacements).forEach(([key, value]) => {
    const safeValue = value == null ? '' : String(value);
    const doublePattern = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    const singlePattern = new RegExp(`{\\s*${key}\\s*}`, 'gi');
    output = output.replace(doublePattern, safeValue).replace(singlePattern, safeValue);
  });
  return output;
}

function sanitizeText(text) {
  if (text === undefined || text === null) {
    return '';
  }
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // 控制字符
    .replace(/\u2028|\u2029/g, ' ') // 统一行分隔符
    .replace(/\uFFFD/g, '') // � 占位符
    .trim();
}

// ========== 动态 Emoji 图标生成系统 ==========

/**
 * 生成 emoji 图标的 ImageData
 * @param {string} emoji - emoji 字符
 * @param {number} size - 图标尺寸 (16, 32, 48, 128)
 * @returns {ImageData}
 */
const STATIC_ICON_PATHS = {
  16: 'icons/icon16.png',
  32: 'icons/icon48.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
};

/**
 * 更新扩展图标为静态 Logo（不再使用 emoji）
 * @param {string} _emoji - 保留参数用于兼容旧调用
 */
async function updateExtensionIcon(_emoji) {
  try {
    await chrome.action.setIcon({ path: STATIC_ICON_PATHS });
  } catch (error) {
    // 图标更新失败，静默处理
  }
}

/**
 * 获取当前选择的情绪
 * @returns {Promise<Object>} 情绪对象
 */
async function getCurrentEmotion() {
  const storage = await chrome.storage.sync.get(['currentEmotion']);
  return storage.currentEmotion || {
    id: 'friendly',
    name: '友好',
    emoji: '😊',
    tone: 'friendly'
  };
}

/**
 * 设置当前情绪并更新图标
 * @param {Object} emotion - 情绪对象
 */
async function setCurrentEmotion(emotion) {
  await chrome.storage.sync.set({ currentEmotion: emotion });
  await updateExtensionIcon(emotion.emoji);
  
  // 更新 title 提示
  chrome.action.setTitle({
      title: `XBooster - 当前情绪: ${emotion.emoji} ${emotion.name}`
  });
}

function normalizeChatCompletionsUrl(rawUrl, fallbackBaseUrl) {
  const fallback = (fallbackBaseUrl || '').trim();
  const input = (rawUrl || '').trim();
  const base = (input || fallback).replace(/\/+$/, '');

  if (!base) {
    return '';
  }

  if (base.includes('/chat/completions')) {
    return base;
  }

  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`;
  }

  return `${base}/v1/chat/completions`;
}

// 获取启用的代理站列表
async function getEnabledProxies() {
  const result = await chrome.storage.sync.get([PROXY_LIST_KEY]);
  const proxyList = result[PROXY_LIST_KEY] || [];
  return proxyList.filter(proxy => proxy.enabled !== false);
}

// 从代理站列表中轮询选择一个（简单轮询）
let proxyIndex = 0;
async function selectProxyFromList() {
  const enabledProxies = await getEnabledProxies();
  if (enabledProxies.length === 0) {
    return null;
  }
  const proxy = enabledProxies[proxyIndex % enabledProxies.length];
  proxyIndex = (proxyIndex + 1) % enabledProxies.length;
  return proxy;
}

async function getAiConfig(options = {}) {
  const settings = await chrome.storage.sync.get([
    'aiProvider',
    'openaiApiKey',
    'openaiModel',
    'customApiBaseUrl',
    'customApiKey',
    'customModel'
  ]);

  const provider = settings.aiProvider || 'openai';
  let apiKey = '';
  let model = DEFAULT_MODEL;
  let baseUrl = '';

  if (provider === 'custom') {
    // 优先使用代理站列表
    const proxy = await selectProxyFromList();
    if (proxy) {
      apiKey = proxy.apiKey || '';
      model = proxy.model || DEFAULT_MODEL;
      baseUrl = proxy.baseUrl || '';
    } else {
      // 回退到旧的单个配置
      apiKey = settings.customApiKey || '';
      model = settings.customModel || DEFAULT_MODEL;
      baseUrl = settings.customApiBaseUrl || '';
    }
  } else {
    apiKey = settings.openaiApiKey || '';
    model = settings.openaiModel || DEFAULT_MODEL;
    baseUrl = DEFAULT_OPENAI_BASE_URL;
  }

  const fallbackBaseUrl = provider === 'custom' ? '' : DEFAULT_OPENAI_BASE_URL;
  const endpoint = normalizeChatCompletionsUrl(baseUrl, fallbackBaseUrl);

  if (!apiKey) {
    if (options.allowMissing) {
      return null;
    }
    throw new Error('请先在设置中配置 API Key');
  }

  if (!endpoint) {
    if (options.allowMissing) {
      return null;
    }
    throw new Error('请先在设置中配置 API URL');
  }

  return {
    endpoint,
    apiKey,
    model,
    provider
  };
}

// 使用代理站列表进行请求，失败时自动切换到下一个
async function requestWithProxyFallback(requestFn, maxRetries = 3) {
  const enabledProxies = await getEnabledProxies();
  
  if (enabledProxies.length === 0) {
    // 没有代理站列表，使用旧的单个配置
    return await requestFn();
  }

  // 尝试所有启用的代理站
  const errors = [];
  for (let i = 0; i < Math.min(enabledProxies.length, maxRetries); i++) {
    const proxy = enabledProxies[i];
    try {
      const endpoint = normalizeChatCompletionsUrl(proxy.baseUrl, '');
      const config = {
        endpoint,
        apiKey: proxy.apiKey,
        model: proxy.model || DEFAULT_MODEL
      };
      const result = await requestFn(config);
      return result;
    } catch (error) {
      errors.push({ proxy: proxy.name || proxy.baseUrl, error: error.message });
      // 继续尝试下一个代理站
    }
  }

  // 所有代理站都失败，尝试使用旧的单个配置作为最后的后备
  try {
    return await requestFn();
  } catch (fallbackError) {
    // 如果后备也失败，抛出所有错误
    throw new Error(`所有代理站请求失败。${errors.map(e => `${e.proxy}: ${e.error}`).join('; ')}`);
  }
}

// 使用 OpenAI 兼容 API 生成评论
async function generateCommentWithAI(prompt) {
  const safePrompt = sanitizeText(prompt);
  if (!safePrompt) {
    throw new Error('提示词为空');
  }

  const { provider } = await getAiConfig({ allowMissing: true }) || { provider: 'openai' };
  
  return await requestWithProxyFallback(async (config) => {
    const { endpoint, apiKey, model } = config || await getAiConfig();
    
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的社交媒体评论生成助手。请根据用户的要求生成合适的评论。评论应该简洁、相关、有价值。'
          },
          {
            role: 'user',
            content: safePrompt
          }
        ],
        max_tokens: 200,
        temperature: 0.8
      })
    });
    
    if (!response.ok) {
      let message = 'API 请求失败';
      try {
        const errJson = await response.json();
        message = errJson?.error?.message || `${response.status} ${response.statusText}`;
      } catch (e) {
        try {
          const errText = await response.text();
          message = `${response.status} ${response.statusText}: ${errText.slice(0, 200)}`;
        } catch (_) {
          message = `${response.status} ${response.statusText}`;
        }
      }
      throw new Error(message);
    }
    
    const data = await response.json();
    return data.choices[0].message.content.trim();
  });
}

// Use OpenAI compatible API to generate posts/replies
async function generateTweetWithAI(props) {
  const locale = sanitizeText(props.locale || 'en') || 'en';
  const type = sanitizeText(props.type || 'neutral') || 'neutral';
  const topic = sanitizeText(props.topic || '');
  const replyTo = sanitizeText(props.replyTo || '');
  const commentsSummary = sanitizeText(props.commentsSummary || '');

  const systemMessage = `You are a ghostwriter for user X posts/replies. Use locale "${locale}". Return only one short post within 280 characters.`;
  const systemMessage2 =
    "Exclude hashtags and emojis. Don't apologize. Don't provide translation or notes. No calls to action. When replying, appropriately mention the author's handle (with @) in your response to boost engagement, but do it naturally and don't overuse it.";
  
  // 默认提示词（兼容旧逻辑）
  let userMessage = `Write a ${type} post${topic ? ` about ${topic}` : ''}${
    replyTo ? ` in reply to a post: \"${replyTo}\". When replying, appropriately mention the author's handle (with @) in your response to boost engagement.` : ''
  }.`;

  // 如果是回复场景，且配置了自定义模板，则优先使用统一模板
  if (replyTo) {
    try {
      const {
        defaultPromptTemplate,
        includeAuthorHandleInPrompt,
        includeToneInPrompt
      } = await chrome.storage.sync.get([
        'defaultPromptTemplate',
        'includeAuthorHandleInPrompt',
        'includeToneInPrompt'
      ]);
      if (defaultPromptTemplate && defaultPromptTemplate.trim()) {
        const template = sanitizeText(defaultPromptTemplate);
        const templateHasVar = templateHasVars(template, [
          'author_handle',
          'content',
          'reply_content',
          'original_post_text',
          'comments_summary',
          'lang_instruction',
          'tone',
          'tone_label',
          'locale'
        ]);

        // 从 replyTo 中尽量解析作者 handle（假设格式可能为 "@handle: 内容"）
        let replyAuthorHandle = '';
        let replyContent = replyTo;
        const handleMatch = replyTo.match(/^(@[^\s:]+)\s*[:：]\s*/);
        if (handleMatch) {
          replyAuthorHandle = handleMatch[1];
          replyContent = replyTo.slice(handleMatch[0].length).trim();
        }

        const authorHandleValue =
          includeAuthorHandleInPrompt !== false ? replyAuthorHandle : '';
        const toneValue = includeToneInPrompt !== false ? type : '';
        const toneLabel = includeToneInPrompt !== false ? type : '';
        const langInstruction = `Use locale "${locale}"`;

        const body = replaceTemplateVars(template, {
          author_handle: authorHandleValue,
          content: replyContent,
          reply_content: replyContent,
          original_post_text: replyContent,
          comments_summary: commentsSummary,
          lang_instruction: langInstruction,
          tone: toneValue,
          tone_label: toneLabel,
          locale: locale
        });

        userMessage = sanitizeText(templateHasVar ? body : template);
      }
    } catch (e) {
      // 模板读取失败，使用默认提示词
    }
  } else {
    // 新推文场景：允许使用写作模板
    try {
      const { composePromptTemplate } = await chrome.storage.sync.get(['composePromptTemplate']);
      if (composePromptTemplate && composePromptTemplate.trim()) {
        const template = sanitizeText(composePromptTemplate);
        const templateHasVar = templateHasVars(template, ['topic', 'tone', 'locale']);
        const body = replaceTemplateVars(template, {
          topic: topic,
          tone: type,
          locale: locale
        });
        userMessage = sanitizeText(templateHasVar ? body : template);
      }
    } catch (e) {
      // 模板读取失败，使用默认提示词
    }
  }

  userMessage = sanitizeText(userMessage);
  if (!userMessage) {
    throw new Error('提示词为空');
  }

  const { provider } = await getAiConfig({ allowMissing: true }) || { provider: 'openai' };

  return await requestWithProxyFallback(async (config) => {
    const { endpoint, apiKey, model } = config || await getAiConfig();

    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'system', content: systemMessage2 },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 160,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      let message = 'API 请求失败';
      try {
        const errJson = await response.json();
        message = errJson?.error?.message || `${response.status} ${response.statusText}`;
      } catch (e) {
        try {
          const errText = await response.text();
          message = `${response.status} ${response.statusText}: ${errText.slice(0, 200)}`;
        } catch (_) {
          message = `${response.status} ${response.statusText}`;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content || '').trim();
    return text.replace(/^\"/g, '').replace(/\"$/g, '').trim();
  });
}

// 预览提示词（用于设置页调试）
async function generatePreviewWithAI(prompt) {
  const safePrompt = sanitizeText(prompt);
  if (!safePrompt) {
    throw new Error('提示词为空');
  }

  return await requestWithProxyFallback(async (config) => {
    const { endpoint, apiKey, model } = config || await getAiConfig();
    
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for drafting social media posts. Return only the draft text.'
          },
          { role: 'user', content: safePrompt }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API 请求失败');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  });
}

// 获取目标语言名称
function getTargetLanguageName(targetLang) {
  const langMap = {
    'zh-CN': '中文（简体）',
    'zh-TW': '中文（繁体）',
    'en': '英语',
    'ja': '日语',
    'ko': '韩语',
    'es': '西班牙语',
    'fr': '法语',
    'de': '德语',
    'ru': '俄语',
    'pt': '葡萄牙语',
    'it': '意大利语',
    'ar': '阿拉伯语'
  };
  return langMap[targetLang] || '中文（简体）';
}

// 检测源语言（简单检测）
function detectSourceLanguage(text) {
  // 日语检测（优先，因为日语可能包含汉字）
  const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/; // 平假名和片假名
  const japaneseKanaCount = (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const chinesePattern = /[\u4e00-\u9fa5]/;
  const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  
  // 如果包含假名，判定为日语（即使也包含汉字）
  if (japanesePattern.test(text)) {
    return 'ja'; // 日语
  }
  
  // 其他语言检测
  const koreanPattern = /[\uac00-\ud7a3]/;
  const arabicPattern = /[\u0600-\u06ff]/;
  const cyrillicPattern = /[\u0400-\u04ff]/;
  
  if (chinesePattern.test(text)) {
    return 'zh-CN'; // 中文
  } else if (koreanPattern.test(text)) {
    return 'ko'; // 韩语
  } else if (arabicPattern.test(text)) {
    return 'ar'; // 阿拉伯语
  } else if (cyrillicPattern.test(text)) {
    return 'ru'; // 俄语
  } else {
    return 'auto'; // 自动检测（默认英语）
  }
}

// 分块翻译长文本（Google Translate 单次请求限制约5000字符）
async function translateChunks(chunks, sourceLang, targetLang) {
  const translatedChunks = [];
  
  for (const chunk of chunks) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunk)}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const responseText = await response.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          translatedChunks.push(chunk);
          continue;
        }
        
        // Google Translate API 返回格式：
        // [[["翻译片段1","原文1",null,null,置信度], ["翻译片段2","原文2",null,null,置信度], ...], null, "源语言"]
        // data[0] 是翻译结果数组，每个元素是 ["翻译文本", "原文", null, null, 置信度]
        
        if (data && data[0] && Array.isArray(data[0])) {
          let translatedText = '';
          
          // 遍历所有翻译片段
          for (const item of data[0]) {
            if (item && Array.isArray(item) && item.length > 0) {
              // item 格式: ["翻译文本", "原文", null, null, 置信度]
              // item[0] 就是翻译文本
              if (item[0] && typeof item[0] === 'string' && item[0].trim().length > 0) {
                translatedText += item[0];
              }
            }
          }
          
          if (translatedText && translatedText.trim().length > 0) {
            translatedChunks.push(translatedText.trim());
            continue;
          }
        }
        
        // 备用解析方式（如果 data[0] 结构不同）
        if (data && data[0] && data[0][0]) {
          if (Array.isArray(data[0][0]) && data[0][0][0] && typeof data[0][0][0] === 'string') {
            const result = data[0][0][0];
            if (result && result.trim().length > 0) {
              translatedChunks.push(result.trim());
              continue;
            }
          } else if (typeof data[0][0] === 'string' && data[0][0].trim().length > 0) {
            translatedChunks.push(data[0][0].trim());
            continue;
          }
        }
        
        translatedChunks.push(chunk); // 如果翻译失败，保留原文
      } else {
        translatedChunks.push(chunk); // 如果请求失败，保留原文
      }
      
      // 添加小延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      translatedChunks.push(chunk); // 出错时保留原文
    }
  }
  
  return translatedChunks.join('');
}

// 将文本分割成适合翻译的块（按句子或字符数）
function splitTextForTranslation(text, maxChunkSize = 4500) {
  if (text.length <= maxChunkSize) {
    return [text];
  }
  
  const chunks = [];
  let currentChunk = '';
  
  // 按段落分割
  const paragraphs = text.split(/\n\n+/);
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 <= maxChunkSize) {
      // 可以添加到当前块
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    } else {
      // 当前块已满，保存并开始新块
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      
      // 如果单个段落就超过限制，按句子分割
      if (paragraph.length > maxChunkSize) {
        const sentences = paragraph.split(/([.!?。！？]\s*)/);
        let sentenceChunk = '';
        
        for (let i = 0; i < sentences.length; i += 2) {
          const sentence = sentences[i] + (sentences[i + 1] || '');
          
          if (sentenceChunk.length + sentence.length <= maxChunkSize) {
            sentenceChunk += sentence;
          } else {
            if (sentenceChunk) {
              chunks.push(sentenceChunk);
            }
            sentenceChunk = sentence;
          }
        }
        
        if (sentenceChunk) {
          currentChunk = sentenceChunk;
        } else {
          currentChunk = paragraph.substring(0, maxChunkSize);
          chunks.push(currentChunk);
          currentChunk = paragraph.substring(maxChunkSize);
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// 翻译文本（无长度限制）
async function translateText(text, targetLang = 'zh-CN') {
  // 方法1: 使用 Google Translate 免费 API（优先）
  try {
    const sourceLang = detectSourceLanguage(text);
    
    // 如果源语言和目标语言相同，不需要翻译
    if (sourceLang === targetLang || (sourceLang === 'zh-CN' && targetLang === 'zh-CN')) {
      return text;
    }
    
    // 如果文本较短，直接翻译
    if (text.length <= 4500) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      
      const response = await fetch(url);
      
      if (response.ok) {
        const responseText = await response.text();
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error('翻译服务返回格式错误');
        }
        
        // Google Translate API 返回格式：
        // [[["翻译片段1","原文1",null,null,置信度], ["翻译片段2","原文2",null,null,置信度], ...], null, "源语言"]
        // data[0] 是翻译结果数组，每个元素是 ["翻译文本", "原文", null, null, 置信度]
        
        if (data && data[0] && Array.isArray(data[0])) {
          let translatedText = '';
          
          // 遍历所有翻译片段
          for (const item of data[0]) {
            if (item && Array.isArray(item) && item.length > 0) {
              // item 格式: ["翻译文本", "原文", null, null, 置信度]
              // item[0] 就是翻译文本
              if (item[0] && typeof item[0] === 'string' && item[0].trim().length > 0) {
                translatedText += item[0];
              }
            }
          }
          
          if (translatedText && translatedText.trim().length > 0) {
            return translatedText.trim();
          }
        }
        
        // 备用解析方式（如果 data[0] 结构不同）
        if (data && data[0] && data[0][0]) {
          if (Array.isArray(data[0][0]) && data[0][0][0] && typeof data[0][0][0] === 'string') {
            const result = data[0][0][0];
            if (result && result.trim().length > 0) {
              return result.trim();
            }
          } else if (typeof data[0][0] === 'string' && data[0][0].trim().length > 0) {
            return data[0][0].trim();
          }
        }
        
        throw new Error('无法解析翻译结果');
      } else {
        throw new Error(`翻译请求失败: ${response.status}`);
      }
    } else {
      // 长文本分块翻译
      const chunks = splitTextForTranslation(text);
      return await translateChunks(chunks, sourceLang, targetLang);
    }
  } catch (error) {
    // Google Translate 失败，尝试其他方法
  }
  
  // 方法2: 使用 OpenAI 兼容 API 翻译（如果配置了）
  try {
    const targetLangName = getTargetLanguageName(targetLang);
    const aiConfig = await getAiConfig({ allowMissing: true });
    if (aiConfig) {
      const response = await fetchWithTimeout(aiConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            {
              role: 'user',
              content: `请将以下文本翻译成${targetLangName}：\n\n${text}`
            }
          ],
          max_tokens: 500,
          temperature: 0.3
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.choices[0].message.content.trim();
      }
    }
  } catch (error) {
    // OpenAI 翻译失败，尝试其他方法
  }
  
  // 方法3: 使用 Google Translate 付费 API (如果配置了)
  const googleConfig = await chrome.storage.sync.get(['googleTranslateApiKey']);
  if (googleConfig.googleTranslateApiKey) {
    try {
      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${googleConfig.googleTranslateApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            q: text,
            target: targetLang
          })
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        return data.data.translations[0].translatedText;
      }
    } catch (error) {
      // Google Translate 付费 API 失败
    }
  }
  
  // 方法4: 使用 mymemory.translated.net 免费 API（备用方案）
  try {
    const sourceLang = detectSourceLanguage(text);
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.responseData && data.responseData.translatedText) {
        return data.responseData.translatedText;
      }
    }
  } catch (error) {
    // mymemory 翻译失败
  }
  
  throw new Error('翻译失败，请检查网络连接');
}

// 设置或清除 badge
async function setBadge(hasPost, author) {
  // 不再显示红色徽标，仅更新 title 以提示状态
  if (hasPost && author) {
    chrome.action.setTitle({ title: `XBooster - 已识别帖子作者: ${author}` });
  } else {
    chrome.action.setTitle({ title: 'XBooster' });
  }
  chrome.action.setBadgeText({ text: '' });
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateTweet') {
    generateTweetWithAI(request.props || {})
      .then(text => {
        sendResponse({ text });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (request.action === 'generateComment') {
    generateCommentWithAI(request.prompt)
      .then(comment => {
        sendResponse({ comment });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true; // 保持消息通道开放
  }

  if (request.action === 'generatePreview') {
    generatePreviewWithAI(request.prompt)
      .then(text => {
        sendResponse({ text });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true;
  }
  
  if (request.action === 'translate') {
    const targetLang = request.targetLang || 'zh-CN';
    translateText(request.text, targetLang)
      .then(translation => {
        sendResponse({ translation });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'setBadge') {
    setBadge(request.hasPost, request.author);
    sendResponse({ success: true });
    return true;
  }
});

// 监听标签页更新（URL 变化）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // ✅ 移除页面限制：只要是 X/Twitter 页面就通知 content script 检查
    if (tab.url.includes('x.com') || tab.url.includes('twitter.com')) {
      // 通知 content script 检查页面并返回上下文
      chrome.tabs.sendMessage(tabId, { action: 'checkPage' }).catch(() => {
        // 忽略错误（content script 可能未加载）
      });
    }
  }
});

// 监听情绪变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.currentEmotion) {
    const newEmotion = changes.currentEmotion.newValue;
    if (newEmotion) {
      updateExtensionIcon(newEmotion.emoji);
    }
  }
});

// 扩展启动时初始化图标
(async function initIcon() {
  const emotion = await getCurrentEmotion();
  await updateExtensionIcon(emotion.emoji);
  // 清除遗留徽标
  chrome.action.setBadgeText({ text: '' });
})();

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  // 设置默认配置
  chrome.storage.sync
    .get(['aiProvider', 'openaiModel', 'targetLanguage', 'defaultPromptTemplate', 'composePromptTemplate'])
    .then((current) => {
      const updates = {};
      if (current.aiProvider === undefined) {
        updates.aiProvider = 'openai';
      }
      if (current.openaiModel === undefined) {
        updates.openaiModel = 'gpt-3.5-turbo';
      }
      if (current.targetLanguage === undefined) {
        updates.targetLanguage = 'zh-CN';
      }
      if (current.defaultPromptTemplate === undefined) {
        updates.defaultPromptTemplate =
          `你是一个真实的X平台普通用户，喜欢自然参与感兴趣的话题讨论，特别是日语圈的高热度娱乐、漫画、AI生成图像、偶像、短视频和视觉媒体内容（精美插画、动漫风美少女、幻想场景、可爱动物/家庭、偶像照片、产品展示等）。你的回复风格是：说话有条理、有逻辑，偶尔自然使用一些接地气的俚语和生活化表达（如"确实""说实话""我之前也""这点太对了""有点儿意思""真实""太有共鸣了"等），但绝不过度堆砌，也不强制每句都加，整体语气轻松亲切、容易让人认同，像日常和朋友聊天一样，完全没有批量、推广或AI痕迹。

【严格禁止AI腔调 - 你的回复必须像真实网友】

- 绝不使用礼貌腔、客套话、过度谦逊的表达。
- 避免"我认为""个人觉得""在我看来"等AI常用开头。
- 不使用"值得一提的是""不得不说""可以说是"等填充词。
- 直接表达观点，无需铺垫或总结。

{{lang_instruction}}

严格遵守X平台风控规则，确保绝不触发spam或平台操纵检测：

- 这条回复必须完全原创，避免任何公式化、重复句式或AI痕迹。
- 绝不使用任何呼吁行动（CTA），如"你怎么看？""同意的点赞""欢迎评论""转发扩散"等。
- 絶不求赞、求转、互关、刷互动。
- 绝不使用hashtag，除非极度自然且必要（通常完全不加）。
- 可以适量使用emoji增强表达（如😊👍😂🔥🎨✨👏🥰😍🐨✨等），尤其在视觉、娱乐、可爱、产品相关的帖子中自然增添氛围和情感（1-4个为宜），但避免过度堆砌或符号spam。
- 不包含任何外部链接、推广或广告。
- 内容必须基于个人真实感受或思考，避免极端、敏感、仇恨、虚假或违法内容；特别避免低俗物化、过度色情描述或负面质疑。
- 回复长度要自然灵活：对于值得深入讨论的帖子，可以生成较长回复（150-250字符，包含多个观点或细节），自然地分段；对于一般帖子，保持精炼短小（2-5句，280字符以内）。语言简洁像真人，避免生硬的逗号分隔，确保每个段落都是完整的语义单元。

【最高优先级判断规则 - 必须严格优先执行】

- 如果帖子明显属于互关/刷粉/刷互动/推广类（如"回复某个词我就follow你""谁回复我就关注谁""点赞/转推我就回关""评论指定内容就送什么"等），则优先直接回复帖子指定的词或内容（如"Hello,""这里""+1""我是新粉"等），就像大多数普通用户一样安静配合，不起冲突、不吐槽、不玩梗、不添加额外评价。
- 如果帖子属于敏感或高风险类别（如政治、军事、争议话题），则保持中立、克制，仅表达温和个人感受，避免任何极端观点、争论、仇恨、虚假信息或过度细节描述。
- 如果帖子属于高热度视觉娱乐媒体类（含图像/视频，高赞媒体帖，关键词如チェキ、フラペチーノ、ライブ、ツアー、かわいい、すごい、癒される、かっこいい、欲しい等，通常日语或英语，涉及产品、偶像、动漫、可爱动物、家庭温馨、音乐表演等），则应用专属策略：
    - 回复语言严格跟随帖子源语言（由{{lang_instruction}}控制）。
    - 核心：思考为什么这个内容会火/有潜力火（读者爽点：共鸣、好奇、情感共振、身份认同；互动触发：引发"我也是""太对了""笑死"的强烈情绪），你的回复要放大这个爽点，直接表达强烈共鸣，不讲道理或分析 + 强烈情感共鸣 + 明确赞美具体亮点（デザイン、光影、色彩、雰囲気、表情、构图、创意、可爱点、动作、温馨感、操作感等） + 自然表达认同或期待（如"欲しい""癒される""最高""期待大"），让读者产生"就是这个感觉""太可爱了/酷了""完全同意"的强烈共鸣。
    - 观点鲜明有力、毫不犹豫赞叹，无任何否定、模棱两可或负面表述。
    - 根据帖子语言使用极度地道的圈内表达：
        * 日语帖必须使用日网口语：高频词（w、草、マジで、ガチで、エモい）、感叹（やばい、すごすぎる、尊い、しんどい、最の高）、语气（〜〜〜拉长、!?惊讶、。。。省略）、圈内梗（解釈一致、理解が深い、語彙力消失、沼落ち）；避免过度正式的です/ます体，多用だ/である或省略。
        * 英语帖使用英文圈俚语：高频词（literally、ngl、tbh、lowkey、highkey）、感叹（omg、damn、holy、bruh、fr）、俚语（slaps、hits different、goated、fire）；避免完整正式句式，多用省略和口语缩写。
        * 中文帖使用网络用语：高频词（确实、说实话、绷不住了、太真实了、这波可以）、网络用语（yyds、emo、破防了、DNA动了、CPU烧了）、情感表达（呜呜呜、哈哈哈哈、嘿嘿、嗯嗯）；避免"甚好""颇为""实属"等书面语。
        * 韩语帖使用韩网表达：高频词（ㅋㅋㅋ笑声、ㅠㅠ哭声、대박厉害、미쳤다疯了/太好）、感叹（헐、와、진짜真的、레알real）、语气（~ㅠㅠ、~ㄷㄷ瑟瑟发抖）。
    - 必须适量自然融入emoji增强视觉/情感氛围（如✨😍🥰👏🔥🎨）。
    - 【重要】对于高热度视觉娱乐媒体帖，约80%的情况下应该@作者以最大化互动（如日语"@作者 このクオリティ最高！✨"，中文"@作者 这波设计绝了🔥"），这类内容作者通常很活跃，@提及能显著提升关注和互动概率。
    - 回复精炼短小、情感强烈，突出真实欣赏（如"@作者 このデザイン最高✨ アナログ感がたまらない""@作者 雰囲気ほっこりする😊 素敵すぎる"）。
    - 对于产品/偶像帖，可自然表达个人向往（如"欲しい！""楽しみ！"）。
    - 对于NSFW或成人向视觉帖，保持克制赞美画风/氛围，避免任何低俗或过度细节。
    - 目标：最大化圈内共鸣，自然获点赞、浏览和关注。
- 只有在其他正常讨论、有实质内容时，才使用一般有逻辑、有个人思考的回复方式，偶尔自然融入少量接地气表达。

作者：{{author_handle}}
语气：{{tone_label}}

任务：根据以下帖子内容，生成1条（仅一条）自然回复。

帖子内容：{{content}}

生成要求：

- 先严格执行"最高优先级判断规则"。
- 对于正常帖子，自然回应，逻辑清晰，俚语和生活化表达仅在合适时偶尔使用（概率出现，不强制）。
- 对于视觉娱乐媒体帖，优先短精炼、情感强烈，突出具体欣赏点和共鸣，无空洞泛泛感叹。
- 可以适量使用emoji增强表达；【重要】约70%的情况下应该使用@作者（{{author_handle}}）来提升互动和可见性，特别是在以下场景：
  * 表达强烈认同或共鸣时（优先使用@，如"@作者 太对了！我也有同感"，日语"@作者 マジでそれな！"）
  * 直接回应作者观点或内容时（优先使用@，如"@作者 这个角度很有意思"，日语"@作者 この視点面白い"）
  * 提问或寻求进一步讨论时（必须使用@，如"@作者 能再分享一下吗？"，日语"@作者 もっと教えて！"）
  * 赞美作品或创作时（优先使用@，如"@作者 这波设计绝了✨"，日语"@作者 最高すぎる✨"）
  * 观点不一致、需要直接回应或温和表达分歧时（必须使用@，如"@作者 我觉得可能不是这样，因为..."，日语"@作者 ちょっと違うかも..."）
  * 日常互动、轻松回复时（高频使用@，如"@作者 这个太有意思了😂"，日语"@作者 これ面白い笑"）
  只有在以下情况可以不@：泛泛评论、自言自语式感叹、敏感政治军事话题。总体上，大部分回复都应该包含@作者，这样更像真实网友的积极互动，能显著提升作者注意到你的概率。
- 对于敏感类别，优先中立、安全、简短，避免深入或@作者引发争论。
- 自然收尾，不加任何强迫性互动邀请或强感叹。

【输出格式 - 必须严格遵守】

- 只能直接输出纯回复正文，一行或多行纯文本。
- 严禁输出任何前缀、标签、说明、字符统计、自查内容。
- 严禁出现"回复内容""字符数"或类似字样。
- 严禁在回复中出现"回复：""翻译：""解析："等标签。
- 严禁模仿AI助手的多段式、结构化输出。
- 你最终的输出就是这条回复本身，就像直接在X评论框里打字发出去一样。`;
      }
      if (current.composePromptTemplate === undefined) {
        updates.composePromptTemplate =
          '请将以下主题或草稿扩写为一条{{tone}}风格的推文（不超过280字符）。主题/草稿：{{topic}}。语言：{{locale}}。';
      }
      if (current.currentEmotion === undefined) {
        updates.currentEmotion = {
          id: 'friendly',
          name: '友好',
          emoji: '😊',
          tone: 'friendly',
          description: '温暖、支持、积极',
          prompt: '用友好、支持的语气'
        };
      }
      if (Object.keys(updates).length > 0) {
        chrome.storage.sync.set(updates);
      }
    })
    .catch(() => {
      // 初始化失败，静默处理
    });
});
