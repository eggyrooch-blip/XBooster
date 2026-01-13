let currentAuthorHandle = '';
let currentPostMedia = null;
let promptTemplates = [];
const RESPONSE_TEMPLATE_KEYS = [
  'author_handle',
  'content',
  'reply_content',
  'original_post_text',
  'comments_summary',
  'lang_instruction',
  'tone',
  'tone_label',
  'locale'
];
const STATS_KEY = 'xcomment_batch_stats';

// 默认提示词模板（评论 / 回复统一模板）
const DEFAULT_PROMPT_TEMPLATE = [
  '你是一个真实的X平台普通用户，喜欢自然参与感兴趣的话题讨论，特别是日语圈的高热度娱乐、漫画、AI生成图像、偶像、短视频和视觉媒体内容（精美插画、动漫风美少女、幻想场景、可爱动物/家庭、偶像照片、产品展示等）。你的回复风格是：说话有条理、有逻辑，偶尔自然使用一些接地气的俚语和生活化表达（如“确实”“说实话”“我之前也”“这点太对了”“有点儿意思”“真实”“太有共鸣了”等），但绝不过度堆砌，也不强制每句都加，整体语气轻松亲切、容易让人认同，像日常和朋友聊天一样，完全没有批量、推广或AI痕迹。',
  '',
  '{{lang_instruction}}',
  '',
  '严格遵守X平台风控规则，确保绝不触发spam或平台操纵检测：',
  '',
  '- 这条回复必须完全原创，避免任何公式化、重复句式或AI痕迹。',
  '- 绝不使用任何呼吁行动（CTA），如“你怎么看？”“同意的点赞”“欢迎评论”“转发扩散”等。',
  '- 絶不求赞、求转、互关、刷互动。',
  '- 绝不使用hashtag，除非极度自然且必要（通常完全不加）。',
  '- 可以适量使用emoji增强表达（如😊👍😂🔥🎨✨👏🥰😍🐨✨等），尤其在视觉、娱乐、可爱、产品相关的帖子中自然增添氛围和情感（1-4个为宜），但避免过度堆砌或符号spam。',
  '- 不包含任何外部链接、推广或广告。',
  '- 内容必须基于个人真实感受或思考，避免极端、敏感、仇恨、虚假或违法内容；特别避免低俗物化、过度色情描述或负面质疑。',
  '- 回复长度控制在280字符以内，通常精炼短小（2-5句为佳），语言简洁像真人。',
  '',
  '【最高优先级判断规则 - 必须严格优先执行】',
  '',
  '- 如果帖子明显属于互关/刷粉/刷互动/推广类（如“回复某个词我就follow你”“谁回复我就关注谁”“点赞/转推我就回关”“评论指定内容就送什么”等），则优先直接回复帖子指定的词或内容（如“Hello,”“这里”“+1”“我是新粉”等），就像大多数普通用户一样安静配合，不起冲突、不吐槽、不玩梗、不添加额外评价。',
  '- 如果帖子属于敏感或高风险类别（如政治、军事、争议话题），则保持中立、克制，仅表达温和个人感受，避免任何极端观点、争论、仇恨、虚假信息或过度细节描述。',
  '- 如果帖子属于高热度视觉娱乐媒体类（含图像/视频，高赞媒体帖，关键词如チェキ、フラペチーノ、ライブ、ツアー、かわいい、すごい、癒される、かっこいい、欲しい等，通常日语或英语，涉及产品、偶像、动漫、可爱动物、家庭温馨、音乐表演等），则应用专属策略：',
  '    - 回复语言严格跟随帖子源语言（由{{lang_instruction}}控制）。',
  '    - 核心：强烈情感共鸣 + 明确赞美具体亮点（デザイン、光影、色彩、雰囲気、表情、构图、创意、可爱点、动作、温馨感、操作感等） + 自然表达认同或期待（如“欲しい”“癒される”“最高”“期待大”），让读者产生“就是这个感觉”“太可爱了/酷了”“完全同意”的强烈共鸣。',
  '    - 观点鲜明有力、毫不犹豫赞叹，无任何否定、模棱两可或负面表述。',
  '    - 像圈内老网友一样自然表达（日语帖优先用本土口语化、感叹词如“✨”“すぎる”“反則”“神レベル”等；英语帖接地气直白或幽默赞美）。',
  '    - 必须适量自然融入emoji增强视觉/情感氛围（如✨😍🥰👏🔥🎨）。',
  '    - 回复精炼短小、情感强烈，突出真实欣赏（如“このデザイン最高✨ アナログ感がたまらない”“雰囲気ほっこりする😊 素敵すぎる”）。',
  '    - 对于产品/偶像帖，可自然表达个人向往（如“欲しい！”“楽しみ！”）。',
  '    - 对于NSFW或成人向视觉帖，保持克制赞美画风/氛围，避免任何低俗或过度细节。',
  '    - 目标：最大化圈内共鸣，自然获点赞、浏览和关注。',
  '- 只有在其他正常讨论、有实质内容时，才使用一般有逻辑、有个人思考的回复方式，偶尔自然融入少量接地气表达。',
  '',
  '作者：{{author_handle}}',
  '语气：{{tone_label}}',
  '',
  '任务：根据以下帖子内容，生成1条（仅一条）自然回复。',
  '',
  '帖子内容：{{content}}',
  '',
  '生成要求：',
  '',
  '- 先严格执行“最高优先级判断规则”。',
  '- 对于正常帖子，自然回应，逻辑清晰，俚语和生活化表达仅在合适时偶尔使用（概率出现，不强制）。',
  '- 对于视觉娱乐媒体帖，优先短精炼、情感强烈，突出具体欣赏点和共鸣，无空洞泛泛感叹。',
  '- 可以适量使用emoji增强表达；如果观点不一致、需要直接回应作者意见或强调分歧时，可以自然地@作者（如“@作者handle 我觉得可能不是这样，因为...”），但必须温和、不攻击性（敏感帖避免@）。',
  '- 对于敏感类别，优先中立、安全、简短，避免深入或@作者引发争论。',
  '- 自然收尾，不加任何强迫性互动邀请或强感叹。',
  '',
  '【输出格式 - 必须严格遵守】',
  '',
  '- 只能直接输出纯回复正文，一行或多行纯文本。',
  '- 严禁输出任何前缀、标签、说明、字符统计、自查内容。',
  '- 严禁出现“回复内容”“字符数”或类似字样。',
  '- 你最终的输出就是这条回复本身，就像直接在X评论框里打字发出去一样。'
].join('\n');

// ========== 情绪选择器功能 ==========

let emotions = [];
let currentEmotion = null;
let cachedStats = { total: 0, success: 0, fail: 0 };

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadStats() {
  const totalEl = document.getElementById('stat-total');
  const successEl = document.getElementById('stat-success');
  const failEl = document.getElementById('stat-fail');
  if (!totalEl || !successEl || !failEl) return;

  try {
    const data = await chrome.storage.local.get([STATS_KEY]);
    const stats = data[STATS_KEY] || {};
    const today = stats[todayKey()] || { total: 0, success: 0, fail: 0 };
    cachedStats = today;
    totalEl.textContent = today.total || 0;
    successEl.textContent = today.success || 0;
    failEl.textContent = today.fail || 0;
  } catch (e) {
    console.warn('加载统计失败（已忽略）', e);
    totalEl.textContent = cachedStats.total || 0;
    successEl.textContent = cachedStats.success || 0;
    failEl.textContent = cachedStats.fail || 0;
  }
}

/**
 * 加载情绪配置
 */
async function loadEmotions() {
  try {
    const response = await fetch(chrome.runtime.getURL('emotions.json'));
    emotions = await response.json();
    
    // 从 storage 读取当前情绪
    const storage = await chrome.storage.sync.get(['currentEmotion']);
    currentEmotion = storage.currentEmotion || emotions[0]; // 默认第一个（友好）
    
    // 渲染情绪选择器
    renderEmotionSelector();
    
    // 更新当前情绪显示
    updateCurrentEmotionDisplay();
  } catch (error) {
    console.error('加载情绪配置失败:', error);
  }
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

/**
 * 根据窗口高度调整帖子翻译区域的最大高度，避免底部按钮被挤出可视区域
 */
function adjustTranslationHeight() {
  try {
    const section = document.getElementById('translation-result-section');
    const content = document.getElementById('post-translation-content');
    if (!section || !content) return;

    const rect = section.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    // 预留底部按钮和边距空间
    const padding = 120;
    const available = Math.max(80, Math.min(400, viewportHeight - rect.top - padding));
    content.style.maxHeight = `${available}px`;
  } catch (e) {
    console.warn('adjustTranslationHeight error:', e);
  }
}

/**
 * 渲染情绪选择器
 */
function renderEmotionSelector() {
  const grid = document.getElementById('emotion-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  emotions.forEach(emotion => {
    const item = document.createElement('div');
    item.className = 'emotion-item';
    item.dataset.emotionId = emotion.id;
    
    if (currentEmotion && currentEmotion.id === emotion.id) {
      item.classList.add('active');
    }
    
    item.innerHTML = `
      <div class="emotion-emoji">${emotion.emoji}</div>
      <div class="emotion-name">${emotion.name}</div>
    `;
    
    item.title = `${emotion.emoji} ${emotion.name} - ${emotion.description}`;
    
    item.addEventListener('click', () => {
      selectEmotion(emotion);
    });
    
    grid.appendChild(item);
  });
}

/**
 * 选择情绪
 * @param {Object} emotion - 情绪对象
 */
async function selectEmotion(emotion) {
  currentEmotion = emotion;
  
  // 保存到 storage（会自动触发 background.js 更新图标）
  await chrome.storage.sync.set({ currentEmotion: emotion });
  
  // 更新 UI
  updateCurrentEmotionDisplay();
  
  // 更新选中状态
  document.querySelectorAll('.emotion-item').forEach(item => {
    if (item.dataset.emotionId === emotion.id) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // 显示提示
  showStatus(`已切换到 ${emotion.emoji} ${emotion.name} 情绪`, 'success');
}

/**
 * 更新当前情绪显示
 */
function updateCurrentEmotionDisplay() {
  const display = document.getElementById('current-emotion');
  if (display && currentEmotion) {
    display.textContent = `${currentEmotion.emoji} ${currentEmotion.name}`;
  }
}

// 加载提示词模板
async function loadPromptTemplates() {
  try {
    const response = await fetch(chrome.runtime.getURL('prompt-templates.json'));
    const templates = await response.json();
    promptTemplates = templates;
    const select = document.getElementById('prompt-template');
    
    templates.forEach((template, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = template.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('加载提示词模板失败:', error);
    showStatus('加载提示词模板失败', 'error');
  }
}

// 加载选中的风格模板
function loadTemplate() {
  const select = document.getElementById('prompt-template');
  const index = select.value;
  
  if (index === '') {
    return;
  }
  
  fetch(chrome.runtime.getURL('prompt-templates.json'))
    .then(response => response.json())
    .then(templates => {
      if (templates[index]) {
        showStatus(`已选择润色风格: ${templates[index].name}`, 'success');
      }
    })
    .catch(error => {
      console.error('加载模板失败:', error);
      showStatus('加载风格失败', 'error');
    });
}

// 读取当前页面的帖子内容（带重试机制）
async function readPostContent(retryCount = 0) {
  const maxRetries = 3;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('x.com') && !tab.url.includes('twitter.com')) {
      showStatus('请先在 <a href="https://x.com" target="_blank">x.com</a> 打开帖子页面', 'info');
      return null;
    }
    
    // ✅ 移除页面限制：所有 X 页面都可以使用
    
    // 确保 content script 已注入
    const scriptReady = await ensureContentScript(tab.id);
    if (!scriptReady) {
      if (retryCount < maxRetries) {
        showStatus(`准备中... (${retryCount + 1}/${maxRetries})`, 'info');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return readPostContent(retryCount + 1);
      } else {
        showStatus('无法连接到页面，请刷新页面后重试', 'error');
        return null;
      }
    }
    
    // 发送消息读取帖子内容
    let results;
    try {
      results = await chrome.tabs.sendMessage(tab.id, { action: 'readPost' });
    } catch (error) {
      // 如果仍然失败，可能是页面还未完全加载
      if (retryCount < maxRetries) {
        showStatus(`等待页面就绪... (${retryCount + 1}/${maxRetries})`, 'info');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return readPostContent(retryCount + 1);
      } else {
        console.error('读取帖子内容失败:', error);
        showStatus('读取失败，请刷新页面后重试', 'error');
        return null;
      }
    }
    
    if (!results) {
      if (retryCount < maxRetries) {
        showStatus(`读取中... (${retryCount + 1}/${maxRetries})`, 'info');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return readPostContent(retryCount + 1);
      } else {
        showStatus('未能读取到帖子内容，请确保在帖子详情页', 'error');
        return null;
      }
    }
    
    // 检查是否有内容
    if (results.content && results.content.trim().length > 0) {
      currentPostMedia = results.media || null;
      document.getElementById('post-content').textContent = results.content;
      
      // 显示帖子内容区域（默认折叠，只显示翻译）
      document.getElementById('post-content-section').style.display = 'none';
      
      // 显示重新读取按钮（图标形式）
      document.getElementById('read-content-btn').style.display = 'block';
      
      // 显示生成评论按钮（在底部）
      document.getElementById('generate-comment-btn').style.display = 'block';
      const footerHint = document.getElementById('footer-hint');
      if (footerHint) footerHint.style.display = 'none';
      
      // ✅ 显示页面上下文（新增）
      if (results.pageType) {
        const pageContextInfo = document.getElementById('page-context-info');
        const pageContextIcon = document.getElementById('page-context-icon');
        const pageContextLabel = document.getElementById('page-context-label');
        
        // 根据页面类型设置图标和文本
        const contextMap = {
          'post_detail': { icon: '📄', label: '帖子详情页' },
          'home': { icon: '🏠', label: '首页' },
          'profile': { icon: '👤', label: '用户主页' },
          'search': { icon: '🔎', label: '搜索结果' },
          'other': { icon: '📱', label: '其他页面' }
        };
        
        const context = contextMap[results.pageType] || contextMap['other'];
        pageContextIcon.textContent = context.icon;
        pageContextLabel.textContent = context.label;
        pageContextInfo.style.display = 'block';
      }
      
      // 如果包含作者信息，更新显示
      if (results.author && results.author.displayName) {
        const authorSection = document.getElementById('author-section');
        const authorInfo = document.getElementById('author-info');
        authorInfo.textContent = `✓ ${results.author.displayName}`;
        authorSection.style.display = 'block';
        
        // 记录作者 handle（用于提示词变量）
        currentAuthorHandle = results.author.handle || '';
      }
      
      // 检查是否自动翻译帖子
    const config = await chrome.storage.sync.get(['enableTranslation', 'autoTranslatePost', 'targetLanguage']);
    const enableTranslation = config.enableTranslation !== false;
    const autoTranslatePost = config.autoTranslatePost === true; // 默认关闭，仅显式开启时生效
      
      if (enableTranslation && autoTranslatePost) {
        // 自动翻译帖子
        showStatus('正在自动翻译帖子...', 'info');
        setTimeout(async () => {
          await autoTranslatePostContent(results.content, config.targetLanguage || 'zh-CN');
        }, 300);
      } else {
        showStatus('帖子内容已自动读取，请选择操作', 'success');
      }
      
      const mediaSummary = results.media
        ? {
            imageCount: results.media.imageCount,
            imageSample: (results.media.imageUrls || []).slice(0, 2)
          }
        : null;
      console.log('[XBooster] readPost summary', {
        pageType: results.pageType,
        authorHandle: results.author?.handle || '',
        contentLength: results.content.length,
        contentPreview: results.content.slice(0, 120),
        media: mediaSummary,
        debug: results.debug
      });
      return results.content;
    } else {
      // 如果内容为空，尝试等待页面加载
      if (retryCount < maxRetries) {
        showStatus(`等待页面加载... (${retryCount + 1}/${maxRetries})`, 'info');
        await new Promise(resolve => setTimeout(resolve, 1500));
        return readPostContent(retryCount + 1);
      } else {
        let errorMsg = '未能读取到帖子内容。\n';
        errorMsg += '请确保：\n';
        errorMsg += '• 在帖子详情页（URL 包含 /status/）\n';
        errorMsg += '• 页面已完全加载\n';
        errorMsg += '• 刷新页面后重试';
        
        showStatus(errorMsg, 'error');
        console.log('读取失败，调试信息:', results.debug);
        console.log('当前 URL:', tab.url);
        return null;
      }
    }
  } catch (error) {
    console.error('读取帖子内容失败:', error);
    
    if (retryCount < maxRetries) {
      showStatus(`重试中... (${retryCount + 1}/${maxRetries})`, 'info');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return readPostContent(retryCount + 1);
    } else {
      showStatus(`读取失败: ${error.message || '未知错误'}`, 'error');
      return null;
    }
  }
}

// 自动翻译帖子内容
async function autoTranslatePostContent(postContent, targetLanguage, options = {}) {
  const silentStatus = options.silentStatus === true;
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translate',
      text: postContent,
      targetLang: targetLanguage
    }).catch((error) => {
      // 兼容扩展上下文失效等错误，给出友好提示
      const msg = (error && error.message) || '';
      if (msg.includes('Extension context invalidated')) {
        if (!silentStatus) {
          showStatus('扩展已更新，请刷新 X 页面后重试', 'info');
        }
        return null;
      }
      throw error;
    });
    
    console.log('翻译响应:', response);
    
    // 检查翻译是否成功
    if (response && response.translation && response.translation.trim().length > 0) {
      document.getElementById('post-translation-content').textContent = response.translation;
      document.getElementById('copy-post-translation-btn').disabled = false;
      document.getElementById('translation-result-section').style.display = 'block';
      // 调整翻译区域高度
      setTimeout(adjustTranslationHeight, 100);
      if (!silentStatus) {
        showStatus('帖子内容已自动读取并翻译', 'success');
      }
      return true;
    } else if (response && response.error) {
      // 翻译失败，有错误信息
      console.error('翻译失败:', response.error);
      if (!silentStatus) {
        showStatus('帖子内容已自动读取（翻译失败）', 'info');
      }
      return false;
    } else {
      // 响应格式异常
      console.warn('翻译响应格式异常:', response);
      // 检查页面上是否已经有翻译内容（可能是之前成功但状态未更新）
      const translationElement = document.getElementById('post-translation-content');
      if (translationElement && translationElement.textContent.trim().length > 0) {
        // 如果页面上已经有翻译内容，说明翻译成功了
        if (!silentStatus) {
          showStatus('帖子内容已自动读取并翻译', 'success');
        }
        return true;
      } else {
        if (!silentStatus) {
          showStatus('帖子内容已自动读取（翻译失败）', 'info');
        }
        return false;
      }
    }
  } catch (error) {
    console.error('自动翻译失败:', error);
    // 检查页面上是否已经有翻译内容
    const translationElement = document.getElementById('post-translation-content');
    if (translationElement && translationElement.textContent.trim().length > 0) {
      // 如果页面上已经有翻译内容，说明翻译成功了
      if (!silentStatus) {
        showStatus('帖子内容已自动读取并翻译', 'success');
      }
      return true;
    } else {
      if (!silentStatus) {
        showStatus('帖子内容已自动读取（翻译失败）', 'info');
      }
      return false;
    }
  }
}


// 显示生成评论的配置界面
function showCommentConfig() {
  document.getElementById('prompt-section').style.display = 'block';
  const actionSection = document.getElementById('action-buttons-section');
  if (actionSection) {
    actionSection.style.display = 'none';
  }
}

// 检测帖子语言
function detectPostLanguage(text) {
  // 简单的语言检测（可以通过更复杂的方法改进）
  const chinesePattern = /[\u4e00-\u9fa5]/;
  const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/;
  const koreanPattern = /[\uac00-\ud7a3]/;
  
  if (chinesePattern.test(text)) {
    return '中文';
  } else if (japanesePattern.test(text)) {
    return '日语';
  } else if (koreanPattern.test(text)) {
    return '韩语';
  } else {
    return '英语或其他语言';
  }
}

function mapLanguageToLocale(language) {
  if (language === '中文') {
    return 'zh-CN';
  }
  if (language === '日语') {
    return 'ja';
  }
  if (language === '韩语') {
    return 'ko';
  }
  return 'en';
}

function stripMetaCountText(text) {
  if (!text) {
    return '';
  }

  let cleaned = text.replace(
    /\s*[（(]?\s*(字数|字符数|character count|length)\s*[:：]?\s*\d+[^）)]*[）)]?/gi,
    ''
  );

  cleaned = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) {
        return false;
      }
      if (/^(字数|字符数|character count|length)\s*[:：]?\s*\d+/i.test(line)) {
        return false;
      }
      if (/^共?\s*\d+\s*(字|字符)$/i.test(line)) {
        return false;
      }
      return true;
    })
    .join('\n');

  return cleaned.trim();
}

// 生成评论（原文+翻译）+ 帖子翻译
async function generateComment() {
  const postContent = document.getElementById('post-content').textContent;
  let customPrompt = document.getElementById('custom-prompt').value;
  
  if (!postContent) {
    showStatus('请先读取帖子内容', 'error');
    return;
  }
  
  if (!customPrompt || customPrompt.trim() === '') {
    showStatus('请选择角色模板或输入自定义指令', 'error');
    return;
  }
  
  // 获取翻译与提示词变量设置
  const config = await chrome.storage.sync.get([
    'enableTranslation',
    'targetLanguage',
    'includeAuthorHandleInPrompt',
    'includeToneInPrompt'
  ]);
  const enableTranslation = config.enableTranslation !== false; // 默认开启
  const targetLanguage = config.targetLanguage || 'zh-CN';
  const includeAuthorHandleInPrompt = config.includeAuthorHandleInPrompt !== false; // 默认开启
  const includeToneInPrompt = config.includeToneInPrompt !== false; // 默认开启
  
  showStatus('正在生成评论...', 'info');
  
  try {
    // 确保获取到最新的情绪选择
    if (!currentEmotion) {
      try {
        const storage = await chrome.storage.sync.get(['currentEmotion']);
        currentEmotion = storage.currentEmotion || emotions[0] || null;
      } catch (error) {
        console.warn('获取情绪失败（已忽略）:', error);
      }
    }

    // 检测帖子语言
    const postLanguage = detectPostLanguage(postContent);
    const locale = mapLanguageToLocale(postLanguage);
    const isTargetLanguage = (targetLanguage === 'zh-CN' && postLanguage === '中文') ||
                            (targetLanguage === 'zh-TW' && postLanguage === '中文') ||
                            (targetLanguage === 'en' && postLanguage === '英语或其他语言');
    
    // 步骤1: 翻译帖子内容（不阻塞评论生成）
    if (enableTranslation && !isTargetLanguage) {
      autoTranslatePostContent(postContent, targetLanguage, { silentStatus: true }).catch((error) => {
        console.error('翻译帖子失败:', error);
      });
    } else if (enableTranslation && isTargetLanguage) {
      // 如果帖子本身就是目标语言，直接显示
      document.getElementById('post-translation-content').textContent = postContent;
      document.getElementById('copy-post-translation-btn').disabled = false;
      document.getElementById('translation-result-section').style.display = 'block';
    }
    
    // 步骤2: 生成源语言评论
    
    // 构建完整的提示词
    // 明确要求使用帖子相同的语言
    const languageInstruction = postLanguage === '中文'
      ? '请使用中文生成评论'
      : postLanguage === '英语或其他语言'
      ? '请使用英语生成评论'
      : `请使用${postLanguage}生成评论`;
    
    // 处理提示词模板变量
    const templateHasVar = templateHasVars(customPrompt, RESPONSE_TEMPLATE_KEYS);
    const authorHandleValue =
      includeAuthorHandleInPrompt && currentAuthorHandle
        ? `@${currentAuthorHandle}`
        : '';
    
    // 计算情绪相关变量（基于当前选择的风格）
    let toneValue = currentEmotion?.tone || '';
    let toneLabel = currentEmotion ? `${currentEmotion.emoji} ${currentEmotion.name}` : '';
    let tonePrompt = currentEmotion?.prompt || '';
    const selectEl = document.getElementById('prompt-template');
    if (selectEl && selectEl.value !== '') {
      const index = parseInt(selectEl.value, 10);
      if (!Number.isNaN(index) && promptTemplates && promptTemplates[index]) {
        const tpl = promptTemplates[index];
        toneLabel = tpl.name ? (toneLabel ? `${toneLabel} · ${tpl.name}` : tpl.name) : toneLabel;
        toneValue = toneValue || (tpl.tone || tpl.name || '').toString();
        if (!tonePrompt && tpl.prompt) {
          tonePrompt = tpl.prompt;
        }
      }
    }
    if (!includeToneInPrompt) {
      toneValue = '';
      toneLabel = '';
      tonePrompt = '';
    }

    const toneLabelForPrompt = tonePrompt
      ? `${toneLabel || toneValue}（${tonePrompt}）`
      : (toneLabel || toneValue);
    const toneInstruction = includeToneInPrompt && toneLabelForPrompt
      ? `语气：${toneLabelForPrompt}`
      : '';
    
    let promptBody = replaceTemplateVars(customPrompt, {
      author_handle: authorHandleValue,
      content: postContent,
      reply_content: postContent,
      original_post_text: postContent,
      comments_summary: '',
      lang_instruction: languageInstruction,
      tone: toneValue || tonePrompt,
      tone_label: toneLabelForPrompt,
      locale: locale
    });
    
    let fullPrompt;
    if (templateHasVar) {
      // 用户显式使用了变量，占位符版本完全由用户控制
      fullPrompt = promptBody;
    } else {
      // 兼容旧行为：自动附加帖子内容和语言说明
      const toneNote = toneInstruction ? `${toneInstruction}\n` : '';
      fullPrompt = `${toneNote}${promptBody}\n\n帖子内容：\n${postContent}\n\n${languageInstruction}。评论应该简洁明了，不超过280个字符。请直接生成评论内容，不要包含字数统计或其他说明文字。`;
    }

    const mediaSummary = currentPostMedia
      ? {
          imageCount: currentPostMedia.imageCount,
          imageSample: (currentPostMedia.imageUrls || []).slice(0, 2)
        }
      : null;
    console.log('[XBooster] prompt debug', {
      includeAuthorHandleInPrompt,
      includeToneInPrompt,
      templateHasVar,
      authorHandleValue,
      toneValue,
      toneLabel: toneLabelForPrompt,
      tonePrompt,
      locale,
      contentLength: postContent.length,
      media: mediaSummary,
      includeMediaInPrompt: false
    });
    console.log('[XBooster] fullPrompt preview', {
      length: fullPrompt.length,
      preview: fullPrompt.slice(0, 220)
    });

    // 调用后台脚本生成评论
    const requestStart = Date.now();
    const response = await chrome.runtime.sendMessage({
      action: 'generateComment',
      prompt: fullPrompt
    }).catch((error) => {
      const msg = (error && error.message) || '';
      if (msg.includes('Extension context invalidated')) {
        showStatus('扩展已更新，请刷新 X 页面后重试', 'info');
        return null;
      }
      throw error;
    });

    console.log('[XBooster] LLM response meta', {
      elapsedMs: Date.now() - requestStart,
      hasComment: !!(response && response.comment),
      length: response && response.comment ? response.comment.length : 0,
      error: response?.error || null
    });
    
    if (response && response.comment) {
      // 清理评论内容（移除可能的引号或多余文字）
      let commentText = response.comment.trim();
      // 移除可能的引号
      commentText = commentText.replace(/^["'「」『』]|["'「」『』]$/g, '');
      // 移除可能的"评论："等前缀
      commentText = commentText.replace(/^(评论|Comment|评论内容|回复|Reply)[:：]\s*/i, '');
      commentText = stripMetaCountText(commentText);
      
      // 显示源语言评论
      document.getElementById('comment-content').textContent = commentText;
      document.getElementById('copy-comment-btn').disabled = false;
      document.getElementById('comment-result-section').style.display = 'block';
      
      // 步骤3: 如果启用了翻译，生成评论的翻译
      if (enableTranslation) {
        const commentIsTargetLanguage = (targetLanguage === 'zh-CN' && detectPostLanguage(commentText) === '中文') ||
                                       (targetLanguage === 'zh-TW' && detectPostLanguage(commentText) === '中文') ||
                                       (targetLanguage === 'en' && detectPostLanguage(commentText) === '英语或其他语言');
        
        if (!commentIsTargetLanguage) {
          showStatus('评论已生成，翻译进行中...', 'info');
          generateCommentTranslation(commentText, targetLanguage, { silentStatus: true })
            .then(() => {
              showStatus('评论已生成，翻译完成', 'success');
            })
            .catch((error) => {
              console.error('评论翻译失败:', error);
              showStatus('评论已生成（翻译失败）', 'info');
            });
        } else {
          // 如果评论已经是目标语言，直接显示
          document.getElementById('translation-content').textContent = commentText;
          document.getElementById('copy-translation-btn').disabled = false;
          document.getElementById('comment-translation-section').style.display = 'block';
          showStatus('评论已生成', 'success');
        }
      } else {
        showStatus('评论已生成', 'success');
      }
    } else {
      showStatus('生成评论失败: ' + (response?.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('生成评论失败:', error);
    showStatus('生成评论失败: ' + error.message, 'error');
  }
}

// 生成评论翻译
async function generateCommentTranslation(commentText, targetLang = 'zh-CN', options = {}) {
  const silentStatus = options.silentStatus === true;
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translate',
      text: commentText,
      targetLang: targetLang
    });
    
    if (response && response.translation) {
      document.getElementById('translation-content').textContent = response.translation;
      document.getElementById('copy-translation-btn').disabled = false;
      document.getElementById('comment-translation-section').style.display = 'block';
    } else {
      if (!silentStatus) {
        showStatus('评论翻译失败: ' + (response?.error || '未知错误'), 'error');
      }
      throw new Error(response?.error || '未知错误');
    }
  } catch (error) {
    console.error('评论翻译失败:', error);
    if (!silentStatus) {
      showStatus('评论翻译失败: ' + error.message, 'error');
    }
    throw error;
  }
}

// 重置界面（隐藏所有结果区域）
function resetUI() {
  document.getElementById('post-content-section').style.display = 'none';
  document.getElementById('prompt-section').style.display = 'none';
  document.getElementById('translation-result-section').style.display = 'none';
  document.getElementById('comment-result-section').style.display = 'none';
  document.getElementById('comment-translation-section').style.display = 'none';
  document.getElementById('generate-comment-btn').style.display = 'none';
  
  // 清空内容
  document.getElementById('post-content').textContent = '';
  document.getElementById('post-translation-content').textContent = '';
  document.getElementById('comment-content').textContent = '';
  
  // 显示底部提示（如果没有错误状态）
  const statusEl = document.getElementById('status');
  const footerHint = document.getElementById('footer-hint');
  if (footerHint && (!statusEl.className.includes('error') && !statusEl.className.includes('info'))) {
    footerHint.style.display = 'block';
  }
  document.getElementById('translation-content').textContent = '';
  
  // 禁用按钮
  document.getElementById('copy-post-translation-btn').disabled = true;
  document.getElementById('copy-comment-btn').disabled = true;
  document.getElementById('copy-translation-btn').disabled = true;
}

// 复制文本
async function copyToClipboard(text, type) {
  try {
    await navigator.clipboard.writeText(text);
    showStatus(`${type}已复制到剪贴板`, 'success');
  } catch (error) {
    console.error('复制失败:', error);
    showStatus('复制失败', 'error');
  }
}

// 显示状态消息
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  const footerHint = document.getElementById('footer-hint');
  
  statusEl.innerHTML = message;
  statusEl.className = `status ${type}`;
  
  // 当显示错误或信息状态时，隐藏底部提示
  if (type === 'error' || type === 'info') {
    if (footerHint) footerHint.style.display = 'none';
  } else {
    // 当状态清空时，显示底部提示（如果没有按钮显示）
    const generateBtn = document.getElementById('generate-comment-btn');
    if (!generateBtn || generateBtn.style.display === 'none') {
      if (footerHint) footerHint.style.display = 'block';
    }
  }
  
  if (type === 'success') {
    setTimeout(() => {
      statusEl.className = 'status';
      statusEl.textContent = '';
      // 状态清空后，检查是否需要显示底部提示
      const generateBtn = document.getElementById('generate-comment-btn');
      if (!generateBtn || generateBtn.style.display === 'none') {
        if (footerHint) footerHint.style.display = 'block';
      }
    }, 3000);
  }
}

// 检查 API 配置
async function checkApiConfig() {
  const config = await chrome.storage.sync.get([
    'aiProvider',
    'openaiApiKey',
    'customApiKey',
    'customApiBaseUrl'
  ]);
  const provider = config.aiProvider || 'openai';
  const missingConfig =
    provider === 'custom'
      ? !(config.customApiKey && config.customApiBaseUrl)
      : !config.openaiApiKey;

  if (missingConfig) {
    showStatus('提示：请在设置中配置 API Key / URL 以获得最佳体验', 'info');
  }
}


// 检查并注入 content script（如果需要）
async function ensureContentScript(tabId) {
  try {
    // 先尝试发送消息检查 content script 是否存在
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return true; // content script 已存在
    } catch (error) {
      // content script 不存在，尝试注入
      if (error.message && error.message.includes('Could not establish connection')) {
        console.log('Content script 未注入，正在注入...');
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        // 等待脚本执行完成
        await new Promise(resolve => setTimeout(resolve, 800));
        return true;
      }
      throw error;
    }
  } catch (error) {
    console.error('确保 content script 失败:', error);
    return false;
  }
}

// 检查当前页面并自动读取帖子
async function checkCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      showStatus('无法获取当前页面信息', 'error');
      return;
    }
    
    if (!tab.url.includes('x.com')) {
      showStatus('请先在 <a href="https://x.com" target="_blank">x.com</a> 打开帖子页面', 'info');
      resetUI();
      return;
    }
    
    // 如果是帖子详情页，自动读取
    if (tab.url.includes('/status/')) {
      showStatus('正在读取帖子内容...', 'info');
      
      // 确保 content script 已注入
      const scriptReady = await ensureContentScript(tab.id);
      if (!scriptReady) {
        showStatus('正在准备...', 'info');
        // 重试一次
        setTimeout(async () => {
          const retryReady = await ensureContentScript(tab.id);
          if (retryReady) {
            readPostContent();
          } else {
            showStatus('无法连接到页面，请刷新页面后重试', 'error');
          }
        }, 1000);
        return;
      }
      
      // 延迟一下确保页面内容加载完成，然后自动读取
      setTimeout(() => {
        readPostContent();
      }, 300);
      return;
    }
    
    // 对于非帖子详情页，尝试检查页面
    try {
      // 确保 content script 已注入
      const scriptReady = await ensureContentScript(tab.id);
      if (!scriptReady) {
        showStatus('当前不是帖子详情页', 'info');
        return;
      }
      
      const results = await chrome.tabs.sendMessage(tab.id, { action: 'checkPage' });
      
      // ✅ 优化：所有页面都显示上下文信息
      if (results && results.pageContext) {
        // 显示页面上下文
        const pageContextInfo = document.getElementById('page-context-info');
        const pageContextIcon = document.getElementById('page-context-icon');
        const pageContextLabel = document.getElementById('page-context-label');
        
        pageContextIcon.textContent = results.pageContext.icon || '📱';
        pageContextLabel.textContent = results.pageContext.label || '未知页面';
        pageContextInfo.style.display = 'block';
        
        // 如果有作者信息，显示
        if (results.author) {
          const authorSection = document.getElementById('author-section');
          const authorInfo = document.getElementById('author-info');
          
          authorInfo.textContent = `✓ ${results.author.displayName || results.author.name || results.author.handle || '已识别'}`;
          authorSection.style.display = 'block';
        }
        
        // 如果可以读取内容，自动读取
        if (results.pageContext.canRead) {
          showStatus('正在读取内容...', 'info');
          setTimeout(() => {
            readPostContent();
          }, 300);
        } else {
          showStatus(`当前在 ${results.pageContext.label}，可以直接创作评论`, 'info');
          // 显示生成评论按钮
          document.getElementById('generate-comment-btn').style.display = 'block';
          const footerHint = document.getElementById('footer-hint');
          if (footerHint) footerHint.style.display = 'none';
        }
      } else if (results && results.isPostPage && results.author) {
        // ✅ 兼容旧逻辑（如果 pageContext 不存在）
        // 显示作者信息
        const authorSection = document.getElementById('author-section');
        const authorInfo = document.getElementById('author-info');
        
        authorInfo.textContent = `✓ ${results.author.displayName || results.author.name || results.author.handle || '已识别'}`;
        authorSection.style.display = 'block';
        
        // 自动读取帖子内容
        showStatus('正在读取帖子内容...', 'info');
        setTimeout(() => {
          readPostContent();
        }, 300);
      } else {
        // 隐藏作者信息
        document.getElementById('author-section').style.display = 'none';
        showStatus('当前不是帖子详情页，请打开帖子详情页', 'info');
        resetUI();
      }
    } catch (error) {
      // 静默处理错误，不显示给用户
      console.log('检查页面失败（已静默处理）:', error.message);
      showStatus('当前不是帖子详情页', 'info');
    }
  } catch (error) {
    // 完全静默处理所有错误
    console.log('checkCurrentPage 错误（已静默处理）:', error.message);
    showStatus('无法检查页面，请刷新后重试', 'error');
  }
}

// 事件监听
document.addEventListener('DOMContentLoaded', async () => {
  // ✅ 加载情绪选择器
  await loadEmotions();
  // 载入统计看板
  loadStats();
  
  loadPromptTemplates();
  await checkApiConfig();
  
  // 加载默认提示词模板（仅在当前为空时填充）
  try {
    const { defaultPromptTemplate } = await chrome.storage.sync.get(['defaultPromptTemplate']);
    const promptEl = document.getElementById('custom-prompt');
    if (promptEl && !promptEl.value) {
      if (defaultPromptTemplate) {
        promptEl.value = defaultPromptTemplate;
      } else {
        promptEl.value = DEFAULT_PROMPT_TEMPLATE;
        try {
          await chrome.storage.sync.set({ defaultPromptTemplate: DEFAULT_PROMPT_TEMPLATE });
        } catch (e2) {
          console.log('写入默认提示词模板失败（已忽略）:', e2);
        }
      }
    }
  } catch (e) {
    console.log('加载默认提示词模板失败（已忽略）:', e);
  }
  
  // 自动检查当前页面并读取帖子
  checkCurrentPage();
  
  // 重新读取帖子按钮（图标形式）
  document.getElementById('read-content-btn').addEventListener('click', () => {
    showStatus('正在重新读取...', 'info');
    // 只重置内容区域，保留其他状态
    document.getElementById('post-content').textContent = '';
    document.getElementById('post-translation-content').textContent = '';
    document.getElementById('comment-content').textContent = '';
    document.getElementById('translation-content').textContent = '';
    document.getElementById('post-content-section').style.display = 'none';
    document.getElementById('translation-result-section').style.display = 'none';
    document.getElementById('comment-result-section').style.display = 'none';
    document.getElementById('comment-translation-section').style.display = 'none';
    const actionSection = document.getElementById('action-buttons-section');
    if (actionSection) {
      actionSection.style.display = 'none';
    }
    document.getElementById('generate-comment-btn').style.display = 'none';
    readPostContent();
  });
  
  // 生成评论按钮（在底部）
  document.getElementById('generate-comment-btn').addEventListener('click', showCommentConfig);
  
  // 切换原文显示/隐藏
  document.getElementById('toggle-original-btn').addEventListener('click', () => {
    const postContent = document.getElementById('post-content');
    const toggleBtn = document.getElementById('toggle-original-btn');
    
    if (postContent.style.display === 'none') {
      postContent.style.display = 'block';
      toggleBtn.textContent = '隐藏';
    } else {
      postContent.style.display = 'none';
      toggleBtn.textContent = '显示';
    }
  });
  
  // 生成评论按钮（在底部）
  document.getElementById('generate-comment-btn').addEventListener('click', showCommentConfig);
  
  // 提示词相关
  document.getElementById('load-template-btn').addEventListener('click', loadTemplate);
  document.getElementById('generate-btn').addEventListener('click', generateComment);
  
  // 复制按钮
  document.getElementById('copy-post-translation-btn').addEventListener('click', () => {
    const text = document.getElementById('post-translation-content').textContent;
    if (text) {
      copyToClipboard(text, '帖子翻译');
    }
  });
  
  document.getElementById('copy-comment-btn').addEventListener('click', () => {
    const text = document.getElementById('comment-content').textContent;
    if (text) {
      copyToClipboard(text, '评论');
    }
  });
  
  document.getElementById('copy-translation-btn').addEventListener('click', () => {
    const text = document.getElementById('translation-content').textContent;
    if (text) {
      copyToClipboard(text, '评论翻译');
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STATS_KEY]) {
      loadStats();
    }
  });
});
