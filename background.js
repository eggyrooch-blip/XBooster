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
    console.log('[XBooster] 图标已更新为静态 Logo');
  } catch (error) {
    console.error('[XBooster] 更新图标失败:', error);
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
      console.warn(`[XBooster] 代理站 ${proxy.name || proxy.baseUrl} 请求失败:`, error.message);
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
    
    console.log('[XBooster] generateCommentWithAI', {
      provider,
      model,
      endpoint,
      promptLength: safePrompt.length,
      promptPreview: buildPromptPreview(safePrompt),
      promptTail: buildPromptTail(safePrompt)
    });
    
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
    "Exclude hashtags and emojis. Don't apologize. Don't provide translation or notes. No calls to action.";
  
  // 默认提示词（兼容旧逻辑）
  let userMessage = `Write a ${type} post${topic ? ` about ${topic}` : ''}${
    replyTo ? ` in reply to a post: \"${replyTo}\"` : ''
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
      console.log('读取回复/评论提示词模板失败，使用默认提示词:', e);
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
      console.log('读取写作提示词模板失败，使用默认提示词:', e);
    }
  }

  userMessage = sanitizeText(userMessage);
  if (!userMessage) {
    throw new Error('提示词为空');
  }

  const { provider } = await getAiConfig({ allowMissing: true }) || { provider: 'openai' };

  return await requestWithProxyFallback(async (config) => {
    const { endpoint, apiKey, model } = config || await getAiConfig();
    
    console.log('[XBooster] generateTweetWithAI', {
      provider,
      model,
      endpoint,
      type,
      hasReply: !!replyTo,
      replyLength: replyTo.length,
      topicLength: topic.length,
      messageLength: userMessage.length,
      messagePreview: buildPromptPreview(userMessage),
      messageTail: buildPromptTail(userMessage)
    });

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
          console.error('分块翻译 JSON 解析失败:', parseError);
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
        
        console.warn('翻译分块解析失败，保留原文:', chunk.substring(0, 50));
        translatedChunks.push(chunk); // 如果翻译失败，保留原文
      } else {
        const errorText = await response.text();
        console.error('翻译分块请求失败:', response.status, errorText.substring(0, 100));
        translatedChunks.push(chunk); // 如果请求失败，保留原文
      }
      
      // 添加小延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('翻译分块失败:', error);
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
    console.log('检测到的源语言:', sourceLang, '目标语言:', targetLang);
    
    // 如果源语言和目标语言相同，不需要翻译
    if (sourceLang === targetLang || (sourceLang === 'zh-CN' && targetLang === 'zh-CN')) {
      console.log('源语言和目标语言相同，跳过翻译');
      return text;
    }
    
    // 如果文本较短，直接翻译
    if (text.length <= 4500) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      console.log('翻译请求 URL:', url.substring(0, 200) + '...');
      
      const response = await fetch(url);
      
      if (response.ok) {
        const responseText = await response.text();
        console.log('Google Translate 原始返回:', responseText.substring(0, 500));
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('JSON 解析失败:', parseError);
          throw new Error('翻译服务返回格式错误');
        }
        
        console.log('Google Translate 解析后数据:', JSON.stringify(data).substring(0, 1000));
        
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
            console.log('翻译成功，结果长度:', translatedText.length, '预览:', translatedText.substring(0, 100));
            return translatedText.trim();
          }
        }
        
        // 备用解析方式（如果 data[0] 结构不同）
        if (data && data[0] && data[0][0]) {
          if (Array.isArray(data[0][0]) && data[0][0][0] && typeof data[0][0][0] === 'string') {
            const result = data[0][0][0];
            if (result && result.trim().length > 0) {
              console.log('使用备用解析方式，结果长度:', result.length);
              return result.trim();
            }
          } else if (typeof data[0][0] === 'string' && data[0][0].trim().length > 0) {
            return data[0][0].trim();
          }
        }
        
        console.error('无法解析翻译结果，返回数据格式:', JSON.stringify(data).substring(0, 500));
        throw new Error('无法解析翻译结果');
      } else {
        const errorText = await response.text();
        console.error('Google Translate API 请求失败:', response.status, response.statusText, errorText.substring(0, 200));
        throw new Error(`翻译请求失败: ${response.status}`);
      }
    } else {
      // 长文本分块翻译
      const chunks = splitTextForTranslation(text);
      console.log(`文本较长（${text.length}字符），分为${chunks.length}块翻译`);
      return await translateChunks(chunks, sourceLang, targetLang);
    }
  } catch (error) {
    console.error('使用 Google Translate 免费 API 失败:', error);
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
    console.error('使用 OpenAI 兼容接口翻译失败:', error);
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
      console.error('使用 Google Translate 付费 API 失败:', error);
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
    console.error('使用 mymemory 翻译服务失败:', error);
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
  console.log('XBooster 插件已安装');
  
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
          '请根据以下内容生成一条简洁、有价值、自然的回复/评论（不超过280字符）。{{lang_instruction}}\n作者：{{author_handle}}\n语气：{{tone_label}}\n内容：{{content}}';
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
    .catch((error) => {
      console.error('初始化默认配置失败:', error);
    });
});
