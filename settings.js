const DEFAULT_RESPONSE_PROMPT_TEMPLATE = [
  '你是一个真实的X平台普通用户，喜欢自然参与感兴趣的话题讨论，特别是日语圈的高热度娱乐、漫画、AI生成图像、偶像、短视频和视觉媒体内容（精美插画、动漫风美少女、幻想场景、可爱动物/家庭、偶像照片、产品展示等）。你的回复风格是：说话有条理、有逻辑，偶尔自然使用一些接地气的俚语和生活化表达（如“确实”“说实话”“我之前也”“这点太对了”“有点儿意思”“真实”“太有共鸣了”等），但绝不过度堆砌，也不强制每句都加，整体语气轻松亲切、容易让人认同，像日常和朋友聊天一样，完全没有批量、推广或AI痕迹。',
  '',
  '【严格禁止AI腔调 - 你的回复必须像真实网友】',
  '',
  '- 绝不使用礼貌腔、客套话、过度谦逊的表达。',
  '- 避免"我认为""个人觉得""在我看来"等AI常用开头。',
  '- 不使用"值得一提的是""不得不说""可以说是"等填充词。',
  '- 直接表达观点，无需铺垫或总结。',
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
  '- 回复长度要自然灵活：对于值得深入讨论的帖子，可以生成较长回复（150-250字符，包含多个观点或细节），自然地分段；对于一般帖子，保持精炼短小（2-5句，280字符以内）。语言简洁像真人，避免生硬的逗号分隔，确保每个段落都是完整的语义单元。',
  '',
  '【最高优先级判断规则 - 必须严格优先执行】',
  '',
  '- 如果帖子明显属于互关/刷粉/刷互动/推广类（如“回复某个词我就follow你”“谁回复我就关注谁”“点赞/转推我就回关”“评论指定内容就送什么”等），则优先直接回复帖子指定的词或内容（如“Hello,”“这里”“+1”“我是新粉”等），就像大多数普通用户一样安静配合，不起冲突、不吐槽、不玩梗、不添加额外评价。',
  '- 如果帖子属于敏感或高风险类别（如政治、军事、争议话题），则保持中立、克制，仅表达温和个人感受，避免任何极端观点、争论、仇恨、虚假信息或过度细节描述。',
  '- 如果帖子属于高热度视觉娱乐媒体类（含图像/视频，高赞媒体帖，关键词如チェキ、フラペチーノ、ライブ、ツアー、かわいい、すごい、癒される、かっこいい、欲しい等，通常日语或英语，涉及产品、偶像、动漫、可爱动物、家庭温馨、音乐表演等），则应用专属策略：',
  '    - 回复语言严格跟随帖子源语言（由{{lang_instruction}}控制）。',
  '    - 核心：思考为什么这个内容会火/有潜力火（读者爽点：共鸣、好奇、情感共振、身份认同；互动触发：引发"我也是""太对了""笑死"的强烈情绪），你的回复要放大这个爽点，直接表达强烈共鸣，不讲道理或分析 + 强烈情感共鸣 + 明确赞美具体亮点（デザイン、光影、色彩、雰囲気、表情、构图、创意、可爱点、动作、温馨感、操作感等） + 自然表达认同或期待（如"欲しい""癒される""最高""期待大"），让读者产生"就是这个感觉""太可爱了/酷了""完全同意"的强烈共鸣。',
  '    - 观点鲜明有力、毫不犹豫赞叹，无任何否定、模棱两可或负面表述。',
  '    - 根据帖子语言使用极度地道的圈内表达：',
  '        * 日语帖必须使用日网口语：高频词（w、草、マジで、ガチで、エモい）、感叹（やばい、すごすぎる、尊い、しんどい、最の高）、语气（〜〜〜拉长、!?惊讶、。。。省略）、圈内梗（解釈一致、理解が深い、語彙力消失、沼落ち）；避免过度正式的です/ます体，多用だ/である或省略。',
  '        * 英语帖使用英文圈俚语：高频词（literally、ngl、tbh、lowkey、highkey）、感叹（omg、damn、holy、bruh、fr）、俚语（slaps、hits different、goated、fire）；避免完整正式句式，多用省略和口语缩写。',
  '        * 中文帖使用网络用语：高频词（确实、说实话、绷不住了、太真实了、这波可以）、网络用语（yyds、emo、破防了、DNA动了、CPU烧了）、情感表达（呜呜呜、哈哈哈哈、嘿嘿、嗯嗯）；避免"甚好""颇为""实属"等书面语。',
  '        * 韩语帖使用韩网表达：高频词（ㅋㅋㅋ笑声、ㅠㅠ哭声、대박厉害、미쳤다疯了/太好）、感叹（헐、와、진짜真的、레알real）、语气（~ㅠㅠ、~ㄷㄷ瑟瑟发抖）。',
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
  '- 严禁在回复中出现"回复：""翻译：""解析："等标签。',
  '- 严禁模仿AI助手的多段式、结构化输出。',
  '- 你最终的输出就是这条回复本身，就像直接在X评论框里打字发出去一样。'
].join('\n');
const DEFAULT_COMPOSE_PROMPT_TEMPLATE =
  '请将以下主题或草稿扩写为一条{{tone}}风格的推文（不超过280字符）。主题/草稿：{{topic}}。语言：{{locale}}。';
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
const API_POOL_KEY = 'apiPool';
const API_POOL_ENABLED_KEY = 'enableApiPool';
const PROXY_LIST_KEY = 'proxyList';
const BOOKMARKS_KEY = 'quickBookmarks';
const DEFAULT_MODEL_FALLBACK = 'gpt-3.5-turbo';
const PROMPT_HISTORY_KEY = 'promptHistory';
const PROMPT_HISTORY_LIMIT = 30;
const POTENTIAL_TIME_WEIGHT_KEY = 'potentialTimeWeight';
const POTENTIAL_COMPETITION_WEIGHT_KEY = 'potentialCompetitionWeight';
const POTENTIAL_HIGH_THRESHOLD_KEY = 'potentialHighThreshold';
const POTENTIAL_MEDIUM_THRESHOLD_KEY = 'potentialMediumThreshold';
const DEFAULT_POTENTIAL_TIME_WEIGHT = 0.5;
const DEFAULT_POTENTIAL_COMPETITION_WEIGHT = 0.5;
const DEFAULT_POTENTIAL_HIGH_THRESHOLD = 70;
const DEFAULT_POTENTIAL_MEDIUM_THRESHOLD = 40;
const FILTER_POTENTIAL_HIGH_KEY = 'filterPotentialHigh';
const FILTER_POTENTIAL_MEDIUM_KEY = 'filterPotentialMedium';
const FILTER_POTENTIAL_LOW_KEY = 'filterPotentialLow';
const FILTER_VERIFIED_ONLY_KEY = 'filterVerifiedOnly';
const AUTO_LIKE_AFTER_REPLY_KEY = 'autoLikeAfterReply';
const RESPONSE_VARS = [
  { key: 'author_handle', label: '{{author_handle}}', gate: 'author' },
  { key: 'content', label: '{{content}}' },
  { key: 'original_post_text', label: '{{original_post_text}}' },
  { key: 'reply_content', label: '{{reply_content}}' },
  { key: 'comments_summary', label: '{{comments_summary}}' },
  { key: 'lang_instruction', label: '{{lang_instruction}}' },
  { key: 'tone', label: '{{tone}}', gate: 'tone' },
  { key: 'tone_label', label: '{{tone_label}}', gate: 'tone' },
  { key: 'locale', label: '{{locale}}' }
];

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

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${mm}`;
}

async function getPromptHistory() {
  try {
    const data = await chrome.storage.sync.get([PROMPT_HISTORY_KEY]);
    const list = data[PROMPT_HISTORY_KEY];
    if (Array.isArray(list)) return list;
    return [];
  } catch (e) {
    return [];
  }
}

async function savePromptHistory(list) {
  try {
    await chrome.storage.sync.set({ [PROMPT_HISTORY_KEY]: list });
  } catch (e) {
    // ignore
  }
}

function renderPromptHistory(list) {
  const container = document.getElementById('prompt-history-list');
  if (!container) return;
  const history = Array.isArray(list) ? list : [];
  if (history.length === 0) {
    container.innerHTML = '<div class="history-empty">暂无历史提示词</div>';
    return;
  }
  container.innerHTML = history
    .map((item) => {
      const preview = (item.text || '').trim().slice(0, 360);
      const meta = formatDate(item.createdAt || Date.now());
      return `
        <div class="history-item" data-history-id="${item.id}">
          <div>
            <input type="checkbox" data-history-id="${item.id}">
          </div>
          <div>
            <div class="history-meta">${meta}</div>
            <div class="history-preview">${escapeHtml(preview)}</div>
          </div>
          <div class="history-actions">
            <button type="button" class="btn-secondary" data-action="apply-history" data-history-id="${item.id}">应用</button>
            <button type="button" class="btn-secondary danger" data-action="delete-history" data-history-id="${item.id}">删除</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function addCurrentPromptToHistory() {
  const promptEl = document.getElementById('default-prompt-template');
  if (!promptEl) return;
  const text = (promptEl.value || '').trim();
  if (!text) {
    showStatus('提示词为空，未保存', 'error');
    return;
  }
  let list = await getPromptHistory();
  const latest = list[0];
  if (latest && latest.text === text) {
    showStatus('与最近一条相同，已跳过', 'info');
    return;
  }
  const entry = {
    id: `hist_${Date.now()}`,
    text,
    createdAt: Date.now()
  };
  list = [entry, ...list].slice(0, PROMPT_HISTORY_LIMIT);
  await savePromptHistory(list);
  renderPromptHistory(list);
  showStatus('已保存到历史', 'success');
}

async function deleteSelectedPromptHistory() {
  const container = document.getElementById('prompt-history-list');
  if (!container) return;
  const checked = Array.from(container.querySelectorAll('input[data-history-id]:checked')).map(
    (el) => el.dataset.historyId
  );
  if (checked.length === 0) {
    showStatus('请选择要删除的历史提示词', 'error');
    return;
  }
  const list = await getPromptHistory();
  const filtered = list.filter((item) => !checked.includes(item.id));
  await savePromptHistory(filtered);
  renderPromptHistory(filtered);
  showStatus('已删除所选历史', 'success');
}

async function deleteSinglePromptHistory(id) {
  if (!id) return;
  const list = await getPromptHistory();
  const filtered = list.filter((item) => item.id !== id);
  await savePromptHistory(filtered);
  renderPromptHistory(filtered);
  showStatus('已删除历史提示词', 'success');
}

async function applyPromptHistory(id) {
  if (!id) return;
  const list = await getPromptHistory();
  const found = list.find((item) => item.id === id);
  if (!found) return;
  const promptEl = document.getElementById('default-prompt-template');
  if (promptEl) {
    promptEl.value = found.text;
    showStatus('已应用历史提示词', 'success');
  }
}

// 将旧的“通道列表”配置迁移到代理站列表（仅当代理站为空时）
async function migrateApiPoolToProxyList(settings) {
  try {
    const currentProxies = await getProxyList();
    if (currentProxies.length > 0) return;

    const poolText = settings[API_POOL_KEY];
    if (!poolText || typeof poolText !== 'string') return;

    let pool = [];
    try {
      pool = JSON.parse(poolText);
    } catch (e) {
      console.warn('解析旧通道列表失败: ', e);
      return;
    }
    if (!Array.isArray(pool) || pool.length === 0) return;

    const proxyList = pool
      .map((item, idx) => ({
        id: item.id || `pool_migrated_${Date.now()}_${idx}`,
        name: item.name || `通道 ${idx + 1}`,
        baseUrl: item.baseUrl || '',
        model: item.model || DEFAULT_MODEL_FALLBACK,
        apiKey: item.apiKey || '',
        enabled: settings[API_POOL_ENABLED_KEY] === false ? false : item.enabled !== false
      }))
      .filter((item) => item.baseUrl && item.apiKey);

    if (proxyList.length === 0) return;

    await saveProxyList(proxyList);
    chrome.storage.sync.remove([API_POOL_KEY, API_POOL_ENABLED_KEY]).catch(() => {});
  } catch (e) {
    console.warn('迁移通道列表到代理站失败: ', e);
  }
}

// 加载保存的设置
async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'aiProvider',
    'openaiApiKey',
    'openaiModel',
    'customApiBaseUrl',
    'customApiKey',
    'customModel',
    'googleTranslateApiKey',
    'enableTranslation',
    'autoTranslatePost',
    'targetLanguage',
    'includeAuthorHandleInPrompt',
    'includeToneInPrompt',
    'defaultPromptTemplate',
    'replyPromptTemplate',
    'composePromptTemplate',
    API_POOL_KEY,
    API_POOL_ENABLED_KEY
  ]);
  
  const providerFallback =
    settings.aiProvider ||
    ((settings.customApiKey || settings.customApiBaseUrl || settings.customModel) ? 'custom' : 'openai');
  document.getElementById('ai-provider').value = providerFallback;

  if (!settings.aiProvider && providerFallback === 'custom') {
    chrome.storage.sync.set({ aiProvider: 'custom' }).catch(() => {});
  }

  if (settings.openaiApiKey) {
    document.getElementById('openai-api-key').value = settings.openaiApiKey;
  }

  if (settings.openaiModel) {
    document.getElementById('openai-model').value = settings.openaiModel;
  }

  if (settings.customApiBaseUrl) {
    document.getElementById('custom-api-base-url').value = settings.customApiBaseUrl;
  }

  if (settings.customApiKey) {
    document.getElementById('custom-api-key').value = settings.customApiKey;
  }

  if (settings.customModel) {
    document.getElementById('custom-model').value = settings.customModel;
  }
  
  if (settings.googleTranslateApiKey) {
    document.getElementById('google-translate-api-key').value = settings.googleTranslateApiKey;
  }
  
  // 翻译设置
  document.getElementById('enable-translation').checked = settings.enableTranslation !== false; // 默认开启
  // 帖子自动翻译默认关闭，仅当设置显式为 true 时才开启
  document.getElementById('auto-translate-post').checked = settings.autoTranslatePost === true;
  document.getElementById('target-language').value = settings.targetLanguage || 'zh-CN';

  // 提示词变量设置
  document.getElementById('include-author-handle-in-prompt').checked =
    settings.includeAuthorHandleInPrompt !== false; // 默认开启
  document.getElementById('include-tone-in-prompt').checked =
    settings.includeToneInPrompt !== false; // 默认开启
  
  // 回复/评论提示词模板（弹窗评论 + 小老虎回复共用）
  const responseTemplate =
    settings.defaultPromptTemplate ||
    settings.replyPromptTemplate ||
    DEFAULT_RESPONSE_PROMPT_TEMPLATE;
  document.getElementById('default-prompt-template').value = responseTemplate;
  if (!settings.defaultPromptTemplate) {
    chrome.storage.sync.set({ defaultPromptTemplate: responseTemplate }).catch(() => {});
  }

  // 写作提示词模板（新推文）
  if (settings.composePromptTemplate) {
    document.getElementById('compose-prompt-template').value = settings.composePromptTemplate;
  } else {
    document.getElementById('compose-prompt-template').value = DEFAULT_COMPOSE_PROMPT_TEMPLATE;
    chrome.storage.sync.set({ composePromptTemplate: DEFAULT_COMPOSE_PROMPT_TEMPLATE }).catch(() => {});
  }
  
  // 已废弃的 replyPromptTemplate 仅用于迁移，不再显示
  
  // 根据翻译开关显示/隐藏相关选项
  updateTranslationUI();

  updateProviderUI();

  await migrateApiPoolToProxyList(settings);
  await renderStats();
  renderResponseVarChips();
  await renderProxyList();
  await renderBookmarkList();
  const history = await getPromptHistory();
  renderPromptHistory(history);
  await loadPotentialWeights();
  await loadPotentialFilters();
  syncPotentialWeights();
  
  // 代理站表格输入变化时自动保存（防抖）
  const proxyTableBody = document.getElementById('proxy-table-body');
  if (proxyTableBody) {
    let saveTimeout;
    proxyTableBody.addEventListener('input', (e) => {
      if (e.target.matches('.proxy-name-input, .proxy-url-input, .proxy-model-input, .proxy-key-input, .proxy-enabled-checkbox')) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          saveProxyListFromTable().catch(console.error);
        }, 1000);
      }
    });
  }
  
  // 书签表格输入变化时自动保存（防抖）
  const bookmarkTableBody = document.getElementById('bookmark-table-body');
  if (bookmarkTableBody) {
    let saveTimeout;
    bookmarkTableBody.addEventListener('input', (e) => {
      if (e.target.matches('.bookmark-icon-input, .bookmark-name-input, .bookmark-url-input, .bookmark-date-checkbox')) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          saveBookmarkListFromTable().catch(console.error);
        }, 1000);
      }
    });
  }
}

// 将deleteProxyRow函数暴露到全局，以便onclick使用
window.deleteProxyRow = deleteProxyRow;

// ========== 书签管理 ==========

// 默认书签数据（与popup.js保持一致）
const DEFAULT_BOOKMARKS = [
  {
    id: 'default_bookmark_1',
    name: '趋势娱乐',
    url: 'https://x.com/search?q=lang%3Aja%20within_time%3A12h%20-is%3Aretweet%20filter%3Amedia%20-filter%3Areplies%20since%3A2026-01-14&src=typed_query',
    icon: '🔥',
    needsDateUpdate: true
  },
  {
    id: 'default_bookmark_2',
    name: '精选视觉',
    url: 'https://x.com/search?q=(NSFW%20OR%20porn%20OR%20adult)%20lang%3Aen%20within_time%3A18h%20-is%3Aretweet%20filter%3Aimages%20-filter%3Asafe%20since%3A2026-01-14&src=typed_query&f=top',
    icon: '🎨',
    needsDateUpdate: true
  },
  {
    id: 'default_bookmark_3',
    name: '热门视频',
    url: 'https://x.com/search?q=lang%3Aja%20within_time%3A36h%20-is%3Aretweet%20filter%3Avideos%20since%3A2026-01-14&src=typed_query&f=top',
    icon: '📹',
    needsDateUpdate: true
  },
  {
    id: 'default_bookmark_4',
    name: '艺术灵感',
    url: 'https://x.com/search?q=(NSFW%20OR%20R18%20OR%20%E3%82%A8%E3%83%AD%20OR%20porn)%20within_time%3A12h%20-is%3Aretweet%20filter%3Amedia%20-filter%3Asafe%20since%3A2026-01-14&src=typed_query&f=top',
    icon: '✨',
    needsDateUpdate: true
  },
  {
    id: 'default_bookmark_5',
    name: '创作中心',
    url: 'https://x.com/i/jf/creators/inspiration/top_posts',
    icon: '💡',
    needsDateUpdate: false
  }
];

async function getBookmarkList() {
  const result = await chrome.storage.sync.get([BOOKMARKS_KEY]);
  const bookmarks = result[BOOKMARKS_KEY];
  // 如果没有书签，初始化默认书签
  if (!bookmarks || bookmarks.length === 0) {
    await chrome.storage.sync.set({ [BOOKMARKS_KEY]: DEFAULT_BOOKMARKS });
    return DEFAULT_BOOKMARKS;
  }
  return bookmarks;
}

async function saveBookmarkList(bookmarkList) {
  await chrome.storage.sync.set({ [BOOKMARKS_KEY]: bookmarkList });
}

// 从表格读取书签列表
function getBookmarkListFromTable() {
  const tbody = document.getElementById('bookmark-table-body');
  if (!tbody) return [];

  const rows = tbody.querySelectorAll('tr[data-bookmark-id]');
  const bookmarkList = [];

  rows.forEach((row) => {
    const icon = row.querySelector('.bookmark-icon-input')?.value.trim() || '🔖';
    const name = row.querySelector('.bookmark-name-input')?.value.trim() || '';
    const url = row.querySelector('.bookmark-url-input')?.value.trim() || '';
    const needsDateUpdate = row.querySelector('.bookmark-date-checkbox')?.checked === true;
    const id = row.dataset.bookmarkId;

    if (name && url) {
      bookmarkList.push({
        id: id || `bookmark_${Date.now()}_${bookmarkList.length}`,
        name,
        url,
        icon,
        needsDateUpdate
      });
    }
  });

  return bookmarkList;
}

// 渲染书签表格
async function renderBookmarkList() {
  const tbody = document.getElementById('bookmark-table-body');
  if (!tbody) return;

  const bookmarkList = await getBookmarkList();

  if (bookmarkList.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无书签，点击上方"添加书签"按钮添加</td></tr>';
    return;
  }

  tbody.innerHTML = bookmarkList.map((bookmark, index) => {
    return `
      <tr data-bookmark-id="${bookmark.id || `bookmark_${Date.now()}_${index}`}">
        <td>
          <input type="text" class="bookmark-icon-input" value="${escapeHtml(bookmark.icon || '🔖')}" placeholder="🔖" style="width: 60px; text-align: center;">
        </td>
        <td>
          <input type="text" class="bookmark-name-input" value="${escapeHtml(bookmark.name || '')}" placeholder="书签名称">
        </td>
        <td>
          <input type="text" class="bookmark-url-input" value="${escapeHtml(bookmark.url || '')}" placeholder="https://x.com/...">
        </td>
        <td style="text-align: center;">
          <input type="checkbox" class="bookmark-date-checkbox" ${bookmark.needsDateUpdate === true ? 'checked' : ''}>
        </td>
        <td style="text-align: center;">
          <button type="button" class="delete-btn" onclick="deleteBookmarkRow(this)">删除</button>
        </td>
      </tr>
    `;
  }).join('');
}

// 添加新书签行
function addBookmarkRow() {
  const tbody = document.getElementById('bookmark-table-body');
  if (!tbody) return;

  // 移除空行提示
  const emptyRow = tbody.querySelector('.empty-row');
  if (emptyRow) {
    emptyRow.remove();
  }

  const newId = `bookmark_${Date.now()}_${tbody.children.length}`;
  const newRow = document.createElement('tr');
  newRow.dataset.bookmarkId = newId;
  newRow.innerHTML = `
    <td>
      <input type="text" class="bookmark-icon-input" value="🔖" placeholder="🔖" style="width: 60px; text-align: center;">
    </td>
    <td>
      <input type="text" class="bookmark-name-input" placeholder="书签名称">
    </td>
    <td>
      <input type="text" class="bookmark-url-input" placeholder="https://x.com/...">
    </td>
    <td style="text-align: center;">
      <input type="checkbox" class="bookmark-date-checkbox" checked>
    </td>
    <td style="text-align: center;">
      <button type="button" class="delete-btn" onclick="deleteBookmarkRow(this)">删除</button>
    </td>
  `;

  tbody.appendChild(newRow);
  
  // 聚焦到新行的名称输入框
  const nameInput = newRow.querySelector('.bookmark-name-input');
  if (nameInput) {
    nameInput.focus();
  }
}

// 删除书签行
function deleteBookmarkRow(button) {
  const row = button.closest('tr');
  if (row && confirm('确定要删除这个书签吗？')) {
    row.remove();
    
    // 如果没有行了，显示空行提示
    const tbody = document.getElementById('bookmark-table-body');
    if (tbody && tbody.children.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无书签，点击上方"添加书签"按钮添加</td></tr>';
    }
    
    // 自动保存
    saveBookmarkListFromTable();
  }
}

// 从表格保存书签列表
async function saveBookmarkListFromTable() {
  const bookmarkList = getBookmarkListFromTable();
  await saveBookmarkList(bookmarkList);
}

// 将deleteBookmarkRow函数暴露到全局，以便onclick使用
window.deleteBookmarkRow = deleteBookmarkRow;

// 代理站列表管理 - 表格编辑
async function getProxyList() {
  const result = await chrome.storage.sync.get([PROXY_LIST_KEY]);
  return result[PROXY_LIST_KEY] || [];
}

async function saveProxyList(proxyList) {
  await chrome.storage.sync.set({ [PROXY_LIST_KEY]: proxyList });
}

// 从表格读取代理站列表
function getProxyListFromTable() {
  const tbody = document.getElementById('proxy-table-body');
  if (!tbody) return [];

  const rows = tbody.querySelectorAll('tr[data-proxy-id]');
  const proxyList = [];

  rows.forEach((row) => {
    const name = row.querySelector('.proxy-name-input')?.value.trim() || '';
    const baseUrl = row.querySelector('.proxy-url-input')?.value.trim() || '';
    const model = row.querySelector('.proxy-model-input')?.value.trim() || 'gpt-3.5-turbo';
    const apiKey = row.querySelector('.proxy-key-input')?.value.trim() || '';
    const enabled = row.querySelector('.proxy-enabled-checkbox')?.checked !== false;
    const id = row.dataset.proxyId;

    if (baseUrl && apiKey) {
      proxyList.push({
        id: id || `proxy_${Date.now()}_${proxyList.length}`,
        name: name || `代理站 ${proxyList.length + 1}`,
        baseUrl,
        model: model || 'gpt-3.5-turbo',
        apiKey,
        enabled
      });
    }
  });

  return proxyList;
}

// 渲染代理站表格
async function renderProxyList() {
  const tbody = document.getElementById('proxy-table-body');
  if (!tbody) return;

  const proxyList = await getProxyList();

  if (proxyList.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无代理站，点击上方"添加代理站"按钮添加</td></tr>';
    return;
  }

  tbody.innerHTML = proxyList.map((proxy, index) => {
    return `
      <tr data-proxy-id="${proxy.id || `proxy_${Date.now()}_${index}`}">
        <td>
          <input type="text" class="proxy-name-input" value="${escapeHtml(proxy.name || '')}" placeholder="站点名称">
        </td>
        <td>
          <input type="text" class="proxy-url-input" value="${escapeHtml(proxy.baseUrl || '')}" placeholder="https://api.example.com/v1">
        </td>
        <td>
          <input type="text" class="proxy-model-input" value="${escapeHtml(proxy.model || 'gpt-3.5-turbo')}" placeholder="gpt-3.5-turbo">
        </td>
        <td>
          <input type="password" class="proxy-key-input" value="${escapeHtml(proxy.apiKey || '')}" placeholder="sk-...">
        </td>
        <td style="text-align: center;">
          <input type="checkbox" class="proxy-enabled-checkbox" ${proxy.enabled !== false ? 'checked' : ''}>
        </td>
        <td style="text-align: center;">
          <button type="button" class="delete-btn" onclick="deleteProxyRow(this)">删除</button>
        </td>
      </tr>
    `;
  }).join('');
}

// 转义HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 添加新代理站行
function addProxyRow() {
  const tbody = document.getElementById('proxy-table-body');
  if (!tbody) return;

  // 移除空行提示
  const emptyRow = tbody.querySelector('.empty-row');
  if (emptyRow) {
    emptyRow.remove();
  }

  const newId = `proxy_${Date.now()}_${tbody.children.length}`;
  const newRow = document.createElement('tr');
  newRow.dataset.proxyId = newId;
  newRow.innerHTML = `
    <td>
      <input type="text" class="proxy-name-input" placeholder="站点名称">
    </td>
    <td>
      <input type="text" class="proxy-url-input" placeholder="https://api.example.com/v1">
    </td>
    <td>
      <input type="text" class="proxy-model-input" value="gpt-3.5-turbo" placeholder="gpt-3.5-turbo">
    </td>
    <td>
      <input type="password" class="proxy-key-input" placeholder="sk-...">
    </td>
    <td style="text-align: center;">
      <input type="checkbox" class="proxy-enabled-checkbox" checked>
    </td>
    <td style="text-align: center;">
      <button type="button" class="delete-btn" onclick="deleteProxyRow(this)">删除</button>
    </td>
  `;

  tbody.appendChild(newRow);
  
  // 聚焦到新行的第一个输入框
  const firstInput = newRow.querySelector('.proxy-name-input');
  if (firstInput) {
    firstInput.focus();
  }
}

// 删除代理站行
function deleteProxyRow(button) {
  const row = button.closest('tr');
  if (row && confirm('确定要删除这个代理站吗？')) {
    row.remove();
    
    // 如果没有行了，显示空行提示
    const tbody = document.getElementById('proxy-table-body');
    if (tbody && tbody.children.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无代理站，点击上方"添加代理站"按钮添加</td></tr>';
    }
    
    // 自动保存
    saveProxyListFromTable();
  }
}

// 从表格保存代理站列表
async function saveProxyListFromTable() {
  const proxyList = getProxyListFromTable();
  await saveProxyList(proxyList);
}

async function renderStats() {
  const container = document.getElementById('stats-daily');
  if (!container) return;
  try {
    const data = await chrome.storage.local.get([STATS_KEY]);
    const stats = data[STATS_KEY] || {};
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    const cur = stats[key] || { total: 0, success: 0, fail: 0, accepted: 0 };
    let html = `<div>今日 (${key})：总计 ${cur.total}，成功 ${cur.success}，失败 ${cur.fail}，填入输入框 ${cur.accepted}</div>`;
    const keys = Object.keys(stats).sort().reverse();
    if (keys.length > 1) {
      html += '<div style="margin-top:6px; font-size:12px; color:#697179;">历史：</div>';
      keys.slice(0, 7).forEach((k) => {
        const row = stats[k];
        html += `<div style="font-size:12px; color:#697179;">${k}：总 ${row.total} | 成功 ${row.success} | 失败 ${row.fail} | 填入 ${row.accepted}</div>`;
      });
    }
    container.innerHTML = html;
  } catch (e) {
    container.textContent = '统计加载失败';
  }
}

function insertAtCursor(el, text) {
  if (!el) return;
  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const value = el.value || '';
  el.value = value.slice(0, start) + text + value.slice(end);
  const pos = start + text.length;
  el.selectionStart = el.selectionEnd = pos;
  el.focus();
}

function renderResponseVarChips() {
  const wrap = document.getElementById('response-var-chips');
  const tplEl = document.getElementById('default-prompt-template');
  const authorEnabled = document.getElementById('include-author-handle-in-prompt').checked;
  const toneEnabled = document.getElementById('include-tone-in-prompt').checked;
  if (!wrap || !tplEl) return;
  wrap.innerHTML = '';
  RESPONSE_VARS.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    btn.className = 'chip-btn';
    const gateOk =
      !item.gate ||
      (item.gate === 'author' && authorEnabled) ||
      (item.gate === 'tone' && toneEnabled);
    if (!gateOk) {
      btn.disabled = true;
      btn.title = item.gate === 'author' ? '开启作者变量后可用' : '开启语气变量后可用';
    }
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      insertAtCursor(tplEl, item.label);
    });
    wrap.appendChild(btn);
  });
}

// 更新翻译相关UI
function updateTranslationUI() {
  const enableTranslation = document.getElementById('enable-translation').checked;
  const targetLanguageSection = document.getElementById('target-language-section');
  const autoTranslateSection = document.getElementById('auto-translate-section');
  
  targetLanguageSection.style.display = enableTranslation ? 'block' : 'none';
  autoTranslateSection.style.display = enableTranslation ? 'block' : 'none';
}

// 更新接口提供方相关UI
function updateProviderUI() {
  const providerEl = document.getElementById('ai-provider');
  if (!providerEl) {
    return;
  }

  const provider = providerEl.value || 'openai';
  const openaiSection = document.getElementById('openai-config-section');
  const customSection = document.getElementById('custom-config-section');

  document.body.dataset.provider = provider;

  if (provider === 'custom') {
    if (openaiSection) {
      openaiSection.style.display = 'none';
      openaiSection.setAttribute('aria-hidden', 'true');
    }
    if (customSection) {
      customSection.style.display = 'block';
      customSection.setAttribute('aria-hidden', 'false');
    }
  } else {
    if (openaiSection) {
      openaiSection.style.display = 'block';
      openaiSection.setAttribute('aria-hidden', 'false');
    }
    if (customSection) {
      customSection.style.display = 'none';
      customSection.setAttribute('aria-hidden', 'true');
    }
  }
}

// 保存设置
async function saveSettings() {
  const aiProvider = document.getElementById('ai-provider').value;
  const openaiApiKey = document.getElementById('openai-api-key').value.trim();
  const openaiModel = document.getElementById('openai-model').value;
  const customApiBaseUrl = document.getElementById('custom-api-base-url')?.value.trim() || '';
  const customApiKey = document.getElementById('custom-api-key')?.value.trim() || '';
  const customModel = document.getElementById('custom-model')?.value.trim() || '';
  const googleTranslateApiKey = document.getElementById('google-translate-api-key').value.trim();
  const enableTranslation = document.getElementById('enable-translation').checked;
  const autoTranslatePost = document.getElementById('auto-translate-post').checked;
  const targetLanguage = document.getElementById('target-language').value;
  const includeAuthorHandleInPrompt = document.getElementById('include-author-handle-in-prompt').checked;
  const includeToneInPrompt = document.getElementById('include-tone-in-prompt').checked;
  const defaultPromptTemplate = document.getElementById('default-prompt-template').value;
  const composePromptTemplate = document.getElementById('compose-prompt-template').value;
  
  // 保存代理站列表（从表格）
  await saveProxyListFromTable();
  
  try {
    await chrome.storage.sync.set({
      aiProvider: aiProvider,
      openaiApiKey: openaiApiKey,
      openaiModel: openaiModel,
      customApiBaseUrl: customApiBaseUrl,
      customApiKey: customApiKey,
      customModel: customModel,
      googleTranslateApiKey: googleTranslateApiKey,
      enableTranslation: enableTranslation,
      autoTranslatePost: autoTranslatePost,
      targetLanguage: targetLanguage,
      includeAuthorHandleInPrompt: includeAuthorHandleInPrompt,
      includeToneInPrompt: includeToneInPrompt,
      defaultPromptTemplate: defaultPromptTemplate,
      composePromptTemplate: composePromptTemplate
    });
    
    // 保存潜力指数权重配置
    await savePotentialWeights();
    
    // 保存潜力筛选配置
    await savePotentialFilters();
    
    showStatus('设置已保存', 'success');
  } catch (error) {
    console.error('保存设置失败:', error);
    showStatus('保存设置失败', 'error');
  }
}

// 显示状态消息
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  
  if (type === 'success') {
    setTimeout(() => {
      statusEl.className = 'status';
      statusEl.textContent = '';
    }, 3000);
  }
}

// 事件监听
  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    
    // 翻译开关变化时更新UI
    document.getElementById('enable-translation').addEventListener('change', updateTranslationUI);
    document.getElementById('ai-provider').addEventListener('change', updateProviderUI);
    
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);

    // 添加代理站按钮
    const addProxyBtn = document.getElementById('add-proxy-btn');
    if (addProxyBtn) {
      addProxyBtn.addEventListener('click', () => {
        addProxyRow();
      });
    }
    
    // 添加书签按钮
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    if (addBookmarkBtn) {
      addBookmarkBtn.addEventListener('click', () => {
        addBookmarkRow();
      });
    }

    // 提示词历史
    const saveHistoryBtn = document.getElementById('save-prompt-history-btn');
    if (saveHistoryBtn) {
      saveHistoryBtn.addEventListener('click', addCurrentPromptToHistory);
    }
    const deleteSelectedHistoryBtn = document.getElementById('delete-selected-history-btn');
    if (deleteSelectedHistoryBtn) {
      deleteSelectedHistoryBtn.addEventListener('click', deleteSelectedPromptHistory);
    }
    const historyList = document.getElementById('prompt-history-list');
    if (historyList) {
      historyList.addEventListener('click', (e) => {
        const target = e.target;
        if (!target || !target.dataset) return;
        if (target.dataset.action === 'apply-history') {
          applyPromptHistory(target.dataset.historyId);
        } else if (target.dataset.action === 'delete-history') {
          deleteSinglePromptHistory(target.dataset.historyId);
        }
      });
    }
    
    // 提示词调试：调用后台 LLM 预览输出
    const previewComposeBtn = document.getElementById('preview-compose-btn');
  if (previewComposeBtn) {
    previewComposeBtn.addEventListener('click', async () => {
      const template = document.getElementById('compose-prompt-template').value;
      const resultEl = document.getElementById('preview-compose-result');
      if (!template || !template.trim()) {
        resultEl.value = '请先填写“写作提示词模板”。';
        return;
      }

      const testTopic = document.getElementById('test-compose-topic').value.trim();
      const testTone = document.getElementById('test-compose-tone').value.trim();
      const testLocale = document.getElementById('test-compose-locale').value.trim() || 'zh-CN';
      const templateHasVar = /{{\s*(topic|tone|locale)\s*}}/i.test(template);
      const promptBody = template
        .replace(/{{\s*topic\s*}}/gi, testTopic)
        .replace(/{{\s*tone\s*}}/gi, testTone)
        .replace(/{{\s*locale\s*}}/gi, testLocale);

      const fullPrompt = templateHasVar ? promptBody : template;
      resultEl.value = '正在调用模型，请稍候...';
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'generatePreview',
          prompt: fullPrompt
        });
        if (response && response.text) {
          resultEl.value = response.text;
        } else {
          resultEl.value = '生成失败: ' + (response && response.error ? response.error : '未知错误');
        }
      } catch (e) {
        console.error('写作预览失败:', e);
        resultEl.value = '调用失败: ' + (e && e.message ? e.message : String(e));
      }
    });
  }

  const previewResponseBtn = document.getElementById('preview-response-btn');
  if (previewResponseBtn) {
    previewResponseBtn.addEventListener('click', async () => {
      const template = document.getElementById('default-prompt-template').value;
      const resultEl = document.getElementById('preview-response-result');
      if (!template || !template.trim()) {
        resultEl.value = '请先填写“回复/评论提示词模板”。';
        return;
      }

      const includeAuthorHandleInPrompt = document.getElementById('include-author-handle-in-prompt').checked;
      const includeToneInPrompt = document.getElementById('include-tone-in-prompt').checked;

      const testContent = document.getElementById('test-response-content').value.trim();
      const testAuthorHandle = document.getElementById('test-response-author-handle').value.trim();
      const testTone = document.getElementById('test-response-tone').value.trim();
      const testToneLabel = document.getElementById('test-response-tone-label').value.trim();
      const testLangInstruction = document.getElementById('test-response-lang').value.trim() || '请使用中文生成评论';
      const testLocale = document.getElementById('test-response-locale').value.trim() || 'zh-CN';

      const authorHandleValue =
        includeAuthorHandleInPrompt && testAuthorHandle
          ? testAuthorHandle
          : '';
      let toneValue = includeToneInPrompt ? testTone : '';
      let toneLabel = includeToneInPrompt ? testToneLabel : '';

      const templateHasVar = templateHasVars(template, RESPONSE_TEMPLATE_KEYS);

      const promptBody = replaceTemplateVars(template, {
        author_handle: authorHandleValue,
        content: testContent,
        reply_content: testContent,
        original_post_text: testContent,
        comments_summary: '',
        lang_instruction: testLangInstruction,
        tone: toneValue,
        tone_label: toneLabel,
        locale: testLocale
      });

      const fullPrompt = templateHasVar
        ? promptBody
        : `${promptBody}\n\n内容：\n${testContent}\n\n${testLangInstruction}。请直接生成回复/评论内容。`;

      resultEl.value = '正在调用模型，请稍候...';
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'generatePreview',
          prompt: fullPrompt
        });
        if (response && response.text) {
          resultEl.value = response.text;
        } else {
          resultEl.value = '生成失败: ' + (response && response.error ? response.error : '未知错误');
        }
      } catch (e) {
        console.error('回复/评论预览失败:', e);
        resultEl.value = '调用失败: ' + (e && e.message ? e.message : String(e));
      }
    });
  }

  const resetDefaultBtn = document.getElementById('reset-default-template-btn');
  if (resetDefaultBtn) {
    resetDefaultBtn.addEventListener('click', async () => {
      const promptEl = document.getElementById('default-prompt-template');
      if (promptEl) {
        promptEl.value = DEFAULT_RESPONSE_PROMPT_TEMPLATE;
        await saveSettings();
      }
    });
  }

  const resetComposeBtn = document.getElementById('reset-compose-template-btn');
  if (resetComposeBtn) {
    resetComposeBtn.addEventListener('click', async () => {
      const composeEl = document.getElementById('compose-prompt-template');
      if (composeEl) {
        composeEl.value = DEFAULT_COMPOSE_PROMPT_TEMPLATE;
        await saveSettings();
      }
    });
  }

  // 潜力指数权重配置
  const resetPotentialWeightsBtn = document.getElementById('reset-potential-weights-btn');
  if (resetPotentialWeightsBtn) {
    resetPotentialWeightsBtn.addEventListener('click', resetPotentialWeights);
  }
});

// 加载潜力指数权重配置
async function loadPotentialWeights() {
  const settings = await chrome.storage.sync.get([
    POTENTIAL_TIME_WEIGHT_KEY,
    POTENTIAL_COMPETITION_WEIGHT_KEY,
    POTENTIAL_HIGH_THRESHOLD_KEY,
    POTENTIAL_MEDIUM_THRESHOLD_KEY
  ]);
  
  const timeWeight = (settings[POTENTIAL_TIME_WEIGHT_KEY] ?? DEFAULT_POTENTIAL_TIME_WEIGHT) * 100;
  const competitionWeight = (settings[POTENTIAL_COMPETITION_WEIGHT_KEY] ?? DEFAULT_POTENTIAL_COMPETITION_WEIGHT) * 100;
  const highThreshold = settings[POTENTIAL_HIGH_THRESHOLD_KEY] ?? DEFAULT_POTENTIAL_HIGH_THRESHOLD;
  const mediumThreshold = settings[POTENTIAL_MEDIUM_THRESHOLD_KEY] ?? DEFAULT_POTENTIAL_MEDIUM_THRESHOLD;
  
  const timeWeightEl = document.getElementById('potential-time-weight');
  const competitionWeightEl = document.getElementById('potential-competition-weight');
  const highThresholdEl = document.getElementById('potential-high-threshold');
  const mediumThresholdEl = document.getElementById('potential-medium-threshold');
  
  if (timeWeightEl) timeWeightEl.value = timeWeight;
  if (competitionWeightEl) competitionWeightEl.value = competitionWeight;
  if (highThresholdEl) highThresholdEl.value = highThreshold;
  if (mediumThresholdEl) mediumThresholdEl.value = mediumThreshold;
  
  updatePotentialWeightDisplay();
}

// 加载潜力筛选配置
async function loadPotentialFilters() {
  const settings = await chrome.storage.sync.get([
    FILTER_POTENTIAL_HIGH_KEY,
    FILTER_POTENTIAL_MEDIUM_KEY,
    FILTER_POTENTIAL_LOW_KEY,
    FILTER_VERIFIED_ONLY_KEY,
    AUTO_LIKE_AFTER_REPLY_KEY
  ]);
  
  // 默认全选
  const filterHigh = settings[FILTER_POTENTIAL_HIGH_KEY] ?? true;
  const filterMedium = settings[FILTER_POTENTIAL_MEDIUM_KEY] ?? true;
  const filterLow = settings[FILTER_POTENTIAL_LOW_KEY] ?? true;
  const verifiedOnly = settings[FILTER_VERIFIED_ONLY_KEY] ?? false;
  const autoLike = settings[AUTO_LIKE_AFTER_REPLY_KEY] ?? true; // 默认开启
  
  const filterHighEl = document.getElementById('filter-potential-high');
  const filterMediumEl = document.getElementById('filter-potential-medium');
  const filterLowEl = document.getElementById('filter-potential-low');
  const verifiedOnlyEl = document.getElementById('filter-verified-only');
  const autoLikeEl = document.getElementById('auto-like-after-reply');
  
  if (filterHighEl) filterHighEl.checked = filterHigh;
  if (filterMediumEl) filterMediumEl.checked = filterMedium;
  if (filterLowEl) filterLowEl.checked = filterLow;
  if (verifiedOnlyEl) verifiedOnlyEl.checked = verifiedOnly;
  if (autoLikeEl) autoLikeEl.checked = autoLike;
}

// 更新潜力指数权重显示
function updatePotentialWeightDisplay() {
  const timeWeightEl = document.getElementById('potential-time-weight');
  const competitionWeightEl = document.getElementById('potential-competition-weight');
  const timeValueEl = document.getElementById('potential-time-weight-value');
  const competitionValueEl = document.getElementById('potential-competition-weight-value');
  const sumEl = document.getElementById('potential-weight-sum');
  
  if (!timeWeightEl || !competitionWeightEl || !timeValueEl || !competitionValueEl || !sumEl) return;
  
  const timeWeight = parseInt(timeWeightEl.value);
  const competitionWeight = parseInt(competitionWeightEl.value);
  const sum = timeWeight + competitionWeight;
  
  timeValueEl.textContent = timeWeight;
  competitionValueEl.textContent = competitionWeight;
  sumEl.textContent = sum;
  
  // 如果总和不是100%，显示警告样式
  if (sum !== 100) {
    sumEl.style.color = 'var(--accent-strong)';
    sumEl.style.fontWeight = '600';
  } else {
    sumEl.style.color = '';
    sumEl.style.fontWeight = '';
  }
}

// 同步潜力指数权重滑块（确保总和为100%）
function syncPotentialWeights() {
  const timeSlider = document.getElementById('potential-time-weight');
  const competitionSlider = document.getElementById('potential-competition-weight');
  
  if (!timeSlider || !competitionSlider) return;
  
  timeSlider.addEventListener('input', () => {
    const timeValue = parseInt(timeSlider.value);
    competitionSlider.value = 100 - timeValue;
    updatePotentialWeightDisplay();
    savePotentialWeights();
  });
  
  competitionSlider.addEventListener('input', () => {
    const competitionValue = parseInt(competitionSlider.value);
    timeSlider.value = 100 - competitionValue;
    updatePotentialWeightDisplay();
    savePotentialWeights();
  });
  
  // 阈值变化时也保存
  const highThresholdEl = document.getElementById('potential-high-threshold');
  const mediumThresholdEl = document.getElementById('potential-medium-threshold');
  
  if (highThresholdEl) {
    highThresholdEl.addEventListener('change', savePotentialWeights);
  }
  if (mediumThresholdEl) {
    mediumThresholdEl.addEventListener('change', savePotentialWeights);
  }
}

// 保存潜力指数权重配置
async function savePotentialWeights() {
  const timeWeightEl = document.getElementById('potential-time-weight');
  const competitionWeightEl = document.getElementById('potential-competition-weight');
  const highThresholdEl = document.getElementById('potential-high-threshold');
  const mediumThresholdEl = document.getElementById('potential-medium-threshold');
  
  if (!timeWeightEl || !competitionWeightEl || !highThresholdEl || !mediumThresholdEl) return;
  
  const timeWeight = parseInt(timeWeightEl.value) / 100;
  const competitionWeight = parseInt(competitionWeightEl.value) / 100;
  const highThreshold = parseInt(highThresholdEl.value);
  const mediumThreshold = parseInt(mediumThresholdEl.value);
  
  try {
    await chrome.storage.sync.set({
      [POTENTIAL_TIME_WEIGHT_KEY]: timeWeight,
      [POTENTIAL_COMPETITION_WEIGHT_KEY]: competitionWeight,
      [POTENTIAL_HIGH_THRESHOLD_KEY]: highThreshold,
      [POTENTIAL_MEDIUM_THRESHOLD_KEY]: mediumThreshold
    });
  } catch (e) {
    console.warn('保存潜力指数权重配置失败:', e);
  }
}

// 保存潜力筛选配置
async function savePotentialFilters() {
  const filterHighEl = document.getElementById('filter-potential-high');
  const filterMediumEl = document.getElementById('filter-potential-medium');
  const filterLowEl = document.getElementById('filter-potential-low');
  const verifiedOnlyEl = document.getElementById('filter-verified-only');
  const autoLikeEl = document.getElementById('auto-like-after-reply');
  
  if (!filterHighEl || !filterMediumEl || !filterLowEl || !verifiedOnlyEl || !autoLikeEl) return;
  
  const filterHigh = filterHighEl.checked;
  const filterMedium = filterMediumEl.checked;
  const filterLow = filterLowEl.checked;
  const verifiedOnly = verifiedOnlyEl.checked;
  const autoLike = autoLikeEl.checked;
  
  try {
    await chrome.storage.sync.set({
      [FILTER_POTENTIAL_HIGH_KEY]: filterHigh,
      [FILTER_POTENTIAL_MEDIUM_KEY]: filterMedium,
      [FILTER_POTENTIAL_LOW_KEY]: filterLow,
      [FILTER_VERIFIED_ONLY_KEY]: verifiedOnly,
      [AUTO_LIKE_AFTER_REPLY_KEY]: autoLike
    });
  } catch (e) {
    console.warn('保存潜力筛选配置失败:', e);
  }
}

// 重置潜力指数权重为默认值
function resetPotentialWeights() {
  const timeWeightEl = document.getElementById('potential-time-weight');
  const competitionWeightEl = document.getElementById('potential-competition-weight');
  const highThresholdEl = document.getElementById('potential-high-threshold');
  const mediumThresholdEl = document.getElementById('potential-medium-threshold');
  
  if (!timeWeightEl || !competitionWeightEl || !highThresholdEl || !mediumThresholdEl) return;
  
  timeWeightEl.value = DEFAULT_POTENTIAL_TIME_WEIGHT * 100;
  competitionWeightEl.value = DEFAULT_POTENTIAL_COMPETITION_WEIGHT * 100;
  highThresholdEl.value = DEFAULT_POTENTIAL_HIGH_THRESHOLD;
  mediumThresholdEl.value = DEFAULT_POTENTIAL_MEDIUM_THRESHOLD;
  
  updatePotentialWeightDisplay();
  savePotentialWeights();
  showStatus('已重置为默认值', 'success');
}
