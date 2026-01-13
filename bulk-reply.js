(() => {
  const PANEL_ID = 'xcomment-batch-panel';
  const PANEL_TOGGLE_ID = 'xcomment-batch-toggle';
  const STATUS_LIST_ID = 'xcomment-batch-status';
  const ACCEPTED_LIST_ID = 'xcomment-batch-accepted';
  const FAILED_LIST_ID = 'xcomment-batch-failed';
  const TAB_PENDING_ID = 'xcomment-tab-pending';
  const TAB_ACCEPTED_ID = 'xcomment-tab-accepted';
  const TAB_FAILED_ID = 'xcomment-tab-failed';
  const FOOTER_ID = 'xcomment-batch-footer';
  const EMOTION_LIST_ID = 'xcomment-batch-emotions';
  const CARD_CLASS = 'xcomment-batch-card';
  const MAX_CONCURRENCY = 2;
  const TASK_DELAY_MS = 200;
  const AUTO_REFRESH_MS = 4000;
  const TOGGLE_ICON_URL = chrome.runtime.getURL('icons/icon48.png');
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
  const DEFAULT_TEMPLATE =
    '请根据以下内容生成一条简洁、有价值、自然的回复/评论（不超过280字符）。{{lang_instruction}}\n作者：{{author_handle}}\n语气：{{tone_label}}\n内容：{{content}}';

  let tasks = [];
  let running = false;
  let stopRequested = false;
  let activeCount = 0;
  let taskElements = new Map();
  let knownTaskIds = new Set();
  let autoTimer = null;
  let mutationObserver = null;
  let scrollRefreshScheduled = false;
  let autoPaused = false;
  const STATS_KEY = 'xcomment_batch_stats';
  const COMPLETED_KEY = 'xcomment_batch_completed';
  let emotions = [];
  let currentEmotion = null;
  const EMO_STORAGE_KEY = 'currentEmotion';
  const RETRY_FAILED_ID = 'xcomment-retry-failed';
  let completedIds = new Set();
  function normalizeText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function loadCompletedCache() {
    try {
      const data = await chrome.storage.local.get([COMPLETED_KEY]);
      const stored = data[COMPLETED_KEY];
      if (stored && stored.date === todayKey() && Array.isArray(stored.ids)) {
        completedIds = new Set(stored.ids);
      } else {
        completedIds = new Set();
        await chrome.storage.local.set({ [COMPLETED_KEY]: { date: todayKey(), ids: [] } });
      }
    } catch (e) {
      completedIds = new Set();
    }
  }

  function completionKey(task) {
    if (!task) return '';
    if (task.tweetId) return `tweet:${task.tweetId}`;
    if (task.id) return `task:${task.id}`;
    const snippet = (task.content || '').slice(0, 80);
    return `content:${task.authorHandle || 'unk'}:${snippet}`;
  }

  function isCompleted(task) {
    const key = completionKey(task);
    if (!key) return false;
    return completedIds.has(key);
  }

  async function markCompleted(task) {
    const key = completionKey(task);
    if (!key) return;
    if (completedIds.has(key)) return;
    completedIds.add(key);
    try {
      await chrome.storage.local.set({
        [COMPLETED_KEY]: { date: todayKey(), ids: Array.from(completedIds) }
      });
    } catch (e) {
      // ignore write errors
    }
  }
  function markTaskAsUsed(task, card) {
    if (!task) return;
    const alreadyAccepted = task.status === 'accepted';
    task.status = 'accepted';
    task.statusLabel = '已填入';
    renderStatus(task);
    if (task.article && task.article.dataset) {
      task.article.dataset.xcommentBatchDone = '1';
    }
    knownTaskIds.add(task.id);
    markCompleted(task);
    if (!alreadyAccepted) {
      recordStat({ accepted: 1 });
    }
    if (card) {
      card.classList.add('used');
      const fillBtn = card.querySelector('button[data-action="fill"]');
      const copyBtn = card.querySelector('button[data-action="copy"]');
      if (fillBtn) {
        fillBtn.textContent = '已填入';
        fillBtn.disabled = true;
      }
      if (copyBtn) {
        copyBtn.textContent = '已用';
        copyBtn.disabled = true;
      }
      const textDiv = card.querySelector('.card-text');
      if (textDiv) {
        textDiv.style.opacity = '0.65';
      }
    }
  }

  function ensureInputMatches(inputEl, text, retries = 3) {
    const target = normalizeText(text);
    for (let i = 0; i < retries; i += 1) {
      const current = normalizeText(inputEl.innerText || inputEl.textContent);
      if (current && current === target) {
        inputEl.classList.add('xcomment-highlight');
        setTimeout(() => inputEl.classList.remove('xcomment-highlight'), 1200);
        return true;
      }
    }
    return false;
  }

  async function recordStat(delta) {
    try {
      const key = todayKey();
      const data = await chrome.storage.local.get([STATS_KEY]);
      const stats = data[STATS_KEY] || {};
      const current = stats[key] || { total: 0, success: 0, fail: 0, accepted: 0 };
      const updated = {
        total: current.total + (delta.total || 0),
        success: current.success + (delta.success || 0),
        fail: current.fail + (delta.fail || 0),
        accepted: current.accepted + (delta.accepted || 0)
      };
      stats[key] = updated;
      await chrome.storage.local.set({ [STATS_KEY]: stats });
    } catch (e) {
      console.warn('recordStat failed', e);
    }
  }

  async function loadEmotions() {
    try {
      const res = await fetch(chrome.runtime.getURL('emotions.json'));
      emotions = await res.json();
      const storage = await chrome.storage.sync.get([EMO_STORAGE_KEY]);
      currentEmotion = storage[EMO_STORAGE_KEY] || emotions[0];
    } catch (e) {
      emotions = [];
      currentEmotion = null;
    }
  }


  function renderEmotions() {
    const wrap = document.getElementById(EMOTION_LIST_ID);
    if (!wrap || !emotions || emotions.length === 0) return;
    wrap.innerHTML = '';
    emotions.forEach((emo) => {
      const btn = document.createElement('button');
      // 仅展示 emoji，本身作为快速切换；名称与说明通过 hover 提示展示
      btn.textContent = `${emo.emoji || ''}`;
      if (emo.description) {
        btn.title = `${emo.emoji || ''} ${emo.name || ''} - ${emo.description}`;
      } else {
        btn.title = `${emo.emoji || ''} ${emo.name || ''}`;
      }
      if (currentEmotion && currentEmotion.id === emo.id) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', async () => {
        currentEmotion = emo;
        await chrome.storage.sync.set({ [EMO_STORAGE_KEY]: emo });
        renderEmotions();
      });
      wrap.appendChild(btn);
    });
  }

  function ensureStyles() {
    if (document.getElementById('xcomment-batch-style')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'xcomment-batch-style';
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 68px;
        width: 340px;
        max-height: 460px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #0f1419;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        z-index: 2147483647;
        display: none;
        flex-direction: column;
        overflow: hidden;
      }
      #${PANEL_ID}.visible { display: flex; }
      #${PANEL_ID} header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        font-weight: 600;
        font-size: 14px;
        color: #0f1419;
      }
      #${PANEL_ID} .actions {
        display: flex;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.02);
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      }
      #${PANEL_ID} button {
        cursor: pointer;
        border: none;
        border-radius: 8px;
        padding: 8px 10px;
        font-weight: 600;
        font-size: 13px;
      }
      #${PANEL_ID} .primary {
        background: #1d9bf0;
        color: #fff;
      }
      #${PANEL_ID} .ghost {
        background: rgba(0, 0, 0, 0.04);
        color: #0f1419;
        border: 1px solid rgba(0, 0, 0, 0.1);
      }
      #${PANEL_ID} .muted {
        opacity: 0.6;
        pointer-events: none;
      }
      #${PANEL_ID} .action-btn {
        flex: 1;
        min-height: 36px;
      }
      #xcomment-batch-tabs {
        display: flex;
        gap: 4px;
        padding: 2px 12px 0;
      }
      #xcomment-batch-tabs button {
        flex: 1;
        background: transparent;
        color: #657786;
        border: none;
        border-radius: 4px;
        padding: 4px 4px 6px;
        cursor: pointer;
        font-weight: 500;
        font-size: 12px;
        min-height: 24px;
      }
      #xcomment-batch-tabs button.active {
        color: #1d9bf0;
        background: rgba(29, 155, 240, 0.06);
        border-radius: 4px;
        box-shadow: none;
      }
      #${STATUS_LIST_ID} {
        padding: 0 12px 12px;
        overflow-y: auto;
        gap: 6px;
        display: flex;
        flex-direction: column;
        max-height: 320px;
        display: none;
      }
      #${ACCEPTED_LIST_ID} {
        padding: 0 12px 12px;
        overflow-y: auto;
        gap: 6px;
        display: flex;
        flex-direction: column;
        max-height: 320px;
        display: none;
      }
      #${FAILED_LIST_ID} {
        padding: 0 12px 12px;
        overflow-y: auto;
        gap: 6px;
        display: flex;
        flex-direction: column;
        max-height: 320px;
        display: none;
      }
      .xcomment-batch-row {
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        line-height: 1.4;
        color: #0f1419;
      }
      .xcomment-batch-row .meta {
        color: #657786;
        font-size: 11px;
      }
      .${CARD_CLASS} {
        margin-top: 8px;
        border: 1px solid #e3e3e3;
        border-radius: 12px;
        padding: 10px;
        background: #f8f9fb;
        color: #111;
        font-size: 14px;
        line-height: 1.5;
      }
      .${CARD_CLASS} .card-actions {
        margin-top: 8px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .${CARD_CLASS} button {
        border: none;
        border-radius: 8px;
        padding: 6px 10px;
        cursor: pointer;
        font-weight: 600;
      }
      .${CARD_CLASS} button.primary { background: #1d9bf0; color: #fff; }
      .${CARD_CLASS} button.ghost { background: #e6f3ff; color: #0f1419; }
      .${CARD_CLASS}.used {
        background: #fff1f0;
        border-color: #f5b0a5;
      }
      .${CARD_CLASS}.used .card-text {
        opacity: 0.75;
      }
      .${CARD_CLASS}.used .card-actions button {
        background: #f0f0f0;
        color: #9a9a9a;
        cursor: default;
      }
      .xcomment-highlight {
        outline: 2px solid #1d9bf0 !important;
        transition: outline 0.3s ease;
      }
      #${FOOTER_ID} {
        border-top: 1px solid rgba(0, 0, 0, 0.08);
        padding: 8px 12px;
        font-size: 12px;
        color: #657786;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #${FOOTER_ID} .badge {
        background: rgba(0, 0, 0, 0.04);
        border-radius: 10px;
        padding: 4px 8px;
        color: #0f1419;
        font-weight: 600;
      }
      #${PANEL_TOGGLE_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #0f1419;
        font-size: 24px;
        font-weight: 700;
        border: 1px solid rgba(0, 0, 0, 0.1);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        z-index: 2147483646;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background-repeat: no-repeat;
        background-position: center;
        background-size: 28px 28px;
      }
      #${EMOTION_LIST_ID} {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        padding: 4px 16px 2px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        scrollbar-width: none;
      }
      #${EMOTION_LIST_ID}.compact {
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 2px 16px 0;
      }
      #${EMOTION_LIST_ID} button {
        position: relative;
        flex: 1 1 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        padding: 0;
        margin: 0;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 22px;
      }
      #${EMOTION_LIST_ID}.compact button {
        font-size: 20px;
      }
      #${EMOTION_LIST_ID} button.active {
        transform: translateY(-1px);
        text-shadow: 0 0 6px rgba(29, 155, 240, 0.6);
      }
      #${EMOTION_LIST_ID} button.active::after {
        content: '';
        position: absolute;
        right: 6px;
        bottom: 2px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #1c9f4d;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
      }
      #xcomment-settings-link {
        color: #1d9bf0;
        cursor: pointer;
        font-size: 12px;
      }
      #xcomment-settings-link:hover {
        color: #1a8cd8;
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <header>
        <span>控制台</span>
        <span id="xcomment-batch-counter" style="font-size:12px;color:#657786;">0 条</span>
      </header>
      <div id="${EMOTION_LIST_ID}"></div>
      <div class="actions">
        <button id="xcomment-batch-start" class="primary action-btn">开始</button>
        <button id="xcomment-batch-stop" class="ghost action-btn muted">停止</button>
        <button id="xcomment-batch-refresh" class="ghost action-btn">刷新</button>
        <button id="${RETRY_FAILED_ID}" class="ghost action-btn">重试失败</button>
      </div>
      <div id="xcomment-batch-tabs">
        <button id="${TAB_PENDING_ID}" class="active">待处理</button>
        <button id="${TAB_ACCEPTED_ID}">已填入</button>
        <button id="${TAB_FAILED_ID}">失败</button>
      </div>
      <div id="${STATUS_LIST_ID}"></div>
      <div id="${ACCEPTED_LIST_ID}"></div>
      <div id="${FAILED_LIST_ID}"></div>
      <div id="${FOOTER_ID}">
        <div class="badge" id="xcomment-batch-summary">待0 / 进行0 / 成功0 / 失败0</div>
        <div style="font-size:11px;display:flex;gap:8px;align-items:center;">
          <span>总计 <span id="xcomment-batch-total">0</span></span>
          <a id="xcomment-settings-link">设置</a>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const toggle = document.createElement('button');
    toggle.id = PANEL_TOGGLE_ID;
    toggle.textContent = '';
    toggle.style.backgroundImage = `url(${TOGGLE_ICON_URL})`;
    toggle.title = '控制台';
    // click事件现在在enableToggleDrag中处理，以支持拖拽和折叠联动
    document.body.appendChild(toggle);

    document.getElementById('xcomment-batch-start').addEventListener('click', startBatch);
    document.getElementById('xcomment-batch-stop').addEventListener('click', stopBatch);
    document.getElementById('xcomment-batch-refresh').addEventListener('click', () => {
      refreshTasks({ reset: false }).then((added) => {
        if (added > 0 && running && !stopRequested) {
          launchNext();
        }
      });
    });
    const settingsLink = panel.querySelector('#xcomment-settings-link');
    if (settingsLink) {
      settingsLink.addEventListener('click', () => {
        chrome.runtime.openOptionsPage().catch(() => {});
      });
    }

    const tabPending = document.getElementById(TAB_PENDING_ID);
    const tabAccepted = document.getElementById(TAB_ACCEPTED_ID);
    const tabFailed = document.getElementById(TAB_FAILED_ID);
    const pendingList = document.getElementById(STATUS_LIST_ID);
    const acceptedList = document.getElementById(ACCEPTED_LIST_ID);
    const failedList = document.getElementById(FAILED_LIST_ID);

    function activateTab(tab) {
      if (!tabPending || !tabAccepted || !pendingList || !acceptedList || !tabFailed || !failedList)
        return;
      if (tab === 'pending') {
        tabPending.classList.add('active');
        tabAccepted.classList.remove('active');
        tabFailed.classList.remove('active');
        pendingList.style.display = 'flex';
        acceptedList.style.display = 'none';
        failedList.style.display = 'none';
      } else if (tab === 'accepted') {
        tabPending.classList.remove('active');
        tabAccepted.classList.add('active');
        tabFailed.classList.remove('active');
        pendingList.style.display = 'none';
        acceptedList.style.display = 'flex';
        failedList.style.display = 'none';
      } else {
        tabPending.classList.remove('active');
        tabAccepted.classList.remove('active');
        tabFailed.classList.add('active');
        pendingList.style.display = 'none';
        acceptedList.style.display = 'none';
        failedList.style.display = 'flex';
      }
    }
    activateTab('pending');
    tabPending?.addEventListener('click', () => activateTab('pending'));
    tabAccepted?.addEventListener('click', () => activateTab('accepted'));
    tabFailed?.addEventListener('click', () => activateTab('failed'));

    const retryFailedBtn = document.getElementById(RETRY_FAILED_ID);
    if (retryFailedBtn) {
      retryFailedBtn.addEventListener('click', () => {
        const failed = tasks.filter((t) => t.status === 'error');
        failed.forEach((t) => {
          t.status = 'pending';
          t.statusLabel = '待生成';
          renderStatus(t);
        });
        launchNext();
      });
    }
  }

  function templateHasVars(template, keys) {
    if (!template) return false;
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

  function detectPostLanguage(text) {
    const chinesePattern = /[\u4e00-\u9fa5]/;
    const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/;
    const koreanPattern = /[\uac00-\ud7a3]/;
    if (chinesePattern.test(text)) return '中文';
    if (japanesePattern.test(text)) return '日语';
    if (koreanPattern.test(text)) return '韩语';
    return '英语或其他语言';
  }

  function mapLanguageToLocale(language) {
    if (language === '中文') return 'zh-CN';
    if (language === '日语') return 'ja';
    if (language === '韩语') return 'ko';
    return 'en';
  }

  function stripMetaCountText(text) {
    if (!text) return '';
    let cleaned = text.replace(
      /\s*[（(]?\s*(字数|字符数|character count|length)\s*[:：]?\s*\d+[^）)]*[）)]?/gi,
      ''
    );
    cleaned = cleaned
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;
        if (/^(字数|字符数|character count|length)\s*[:：]?\s*\d+/i.test(line)) return false;
        if (/^共?\s*\d+\s*(字|字符)$/i.test(line)) return false;
        return true;
      })
      .join('\n');
    return cleaned.trim();
  }

  function cleanComment(text) {
    let t = (text || '').trim();
    t = t.replace(/^["'「」『』]|["'「」『』]$/g, '');
    t = t.replace(/^(评论|Comment|评论内容|回复|Reply)[:：]\s*/i, '');
    return stripMetaCountText(t);
  }

  function extractHandle(article) {
    const user = article.querySelector('[data-testid="tweet"] [data-testid="User-Name"]');
    if (!user) return '';
    const spans = user.querySelectorAll('span');
    for (const span of spans) {
      const val = (span.innerText || span.textContent || '').trim();
      if (val.startsWith('@') && val.length < 50) {
        return val.replace('@', '');
      }
    }
    return '';
  }

  function extractContent(article) {
    const textEl = article.querySelector('[data-testid="tweetText"]');
    if (textEl && textEl.innerText) {
      return textEl.innerText.trim();
    }
    return '';
  }

  function extractTweetId(article) {
    const link = article.querySelector('a[href*="/status/"]');
    const href = link ? link.getAttribute('href') || '' : '';
    const match = href.match(/status\/(\d+)/);
    return match ? match[1] : '';
  }

  function extractTweetUrl(article) {
    const link = article.querySelector('a[href*="/status/"]');
    if (link) {
      const href = link.getAttribute('href') || '';
      if (href.startsWith('http')) return href;
      if (href.startsWith('/')) return `https://x.com${href}`;
      return `https://x.com/${href}`;
    }
    return '';
  }

  function findArticleByTweetId(tweetId) {
    if (!tweetId) return null;
    const link = document.querySelector(`a[href*="/status/${tweetId}"]`);
    if (link) {
      return link.closest('article[data-testid="tweet"]') || link.closest('article');
    }
    return null;
  }

  async function collectTweets() {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    const currentUser = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    const myHandle = currentUser ? (currentUser.getAttribute('href') || '').split('/')[1] : '';

    const list = [];
    articles.forEach((article, idx) => {
      // 跳过回复弹窗内的 article，避免重复生成
      if (article.closest('div[role="dialog"]')) return;
      if (article.dataset.xcommentBatchDone === '1') return;
      const content = extractContent(article);
      const handle = extractHandle(article);
      if (!content || (myHandle && handle === myHandle)) return;
      const tweetId = extractTweetId(article);
      const tweetUrl = extractTweetUrl(article);
      const dedupKey = tweetId || `${handle || 'unk'}-${content.slice(0, 80)}`;
      const candidate = {
        id: dedupKey || `${Date.now()}-${idx}`,
        tweetId,
        tweetUrl,
        article,
        content,
        authorHandle: handle
      };
      if (isCompleted(candidate)) return;
      list.push(candidate);
    });
    return list;
  }

  function updateCounter() {
    const counter = document.getElementById('xcomment-batch-counter');
    if (counter) {
      counter.textContent = `${tasks.length} 条`;
    }
  }

  function updateSummary() {
    const header = document.getElementById('xcomment-batch-counter');
    const footerSummary = document.getElementById('xcomment-batch-summary');
    const totalEl = document.getElementById('xcomment-batch-total');
    if (!header) return;
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const runningCount = tasks.filter((t) => t.status === 'in_progress').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const failed = tasks.filter((t) => t.status === 'error').length;
    const summaryText = `待${pending} / 进行${runningCount} / 成功${done} / 失败${failed}`;
    header.textContent = summaryText;
    if (footerSummary) {
      footerSummary.textContent = summaryText;
    }
    if (totalEl) {
      totalEl.textContent = tasks.length;
    }

    // 根据是否有任务内容，切换情绪栏布局（有内容时压缩为单行）
    const emoWrap = document.getElementById(EMOTION_LIST_ID);
    if (emoWrap) {
      if (tasks.length > 0) {
        emoWrap.classList.add('compact');
      } else {
        emoWrap.classList.remove('compact');
      }
    }
  }

  function renderStatus(task) {
    const list = document.getElementById(STATUS_LIST_ID);
    const acceptedList = document.getElementById(ACCEPTED_LIST_ID);
    const failedList = document.getElementById(FAILED_LIST_ID);
    if (!list || !acceptedList) return;
    let row = taskElements.get(task.id);
    const targetList =
      task.status === 'accepted' ? acceptedList : task.status === 'error' ? failedList : list;
    if (!row) {
      row = document.createElement('div');
      row.className = 'row xcomment-batch-row';
      row.dataset.taskId = task.id;
      row.addEventListener('click', () => {
        locateTask(task);
      });
      taskElements.set(task.id, row);
      targetList.appendChild(row);
    } else if (row.parentElement !== targetList) {
      row.parentElement?.removeChild(row);
      targetList.appendChild(row);
    }
    row.dataset.status = task.status;
    row.innerHTML = `
      <div>${task.preview || task.content.slice(0, 60)}${task.content.length > 60 ? '…' : ''}</div>
      <div class="meta">${task.statusLabel || task.status}</div>
    `;
    updateSummary();
  }

  async function refreshTasks(options = {}) {
    const { reset = false } = options;
    const list = await collectTweets();
    if (reset) {
      tasks = [];
      knownTaskIds.clear();
      taskElements.clear();
      const listEl = document.getElementById(STATUS_LIST_ID);
      if (listEl) listEl.innerHTML = '';
    }

    let added = 0;
    list.forEach((item) => {
      const key = item.id;
      if (knownTaskIds.has(key)) return;
      knownTaskIds.add(key);
      const task = {
        ...item,
        status: 'pending',
        statusLabel: '待生成',
        preview: item.content.slice(0, 80)
      };
      tasks.push(task);
      renderStatus(task);
      added += 1;
    });
    updateCounter();
    updateSummary();
    return added;
  }

  function scheduleRefresh() {
    if (scrollRefreshScheduled) return;
    scrollRefreshScheduled = true;
    setTimeout(async () => {
      scrollRefreshScheduled = false;
      if (!running || stopRequested || autoPaused) return;
      const added = await refreshTasks({ reset: false });
      if (added > 0 && running && !stopRequested) {
        launchNext();
      }
    }, 800);
  }

  function startAutoWatch() {
    stopAutoWatch();
    mutationObserver = new MutationObserver((mutations) => {
      let shouldRefresh = false;
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.querySelector && node.querySelector('article[data-testid="tweet"]')) {
            shouldRefresh = true;
          }
          if (node.nodeType === 1 && node.matches && node.matches('article[data-testid="tweet"]')) {
            shouldRefresh = true;
          }
        });
      });
      if (shouldRefresh && running && !stopRequested && !autoPaused) {
        scheduleRefresh();
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    autoTimer = setInterval(async () => {
      if (!running || stopRequested || autoPaused) return;
      const added = await refreshTasks({ reset: false });
      if (added > 0) {
        launchNext();
      }
    }, AUTO_REFRESH_MS);

    window.addEventListener('scroll', scheduleRefresh, { passive: true });
  }

  function stopAutoWatch() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    window.removeEventListener('scroll', scheduleRefresh);
  }

  function pauseAutoWatch() {
    autoPaused = true;
    stopAutoWatch();
  }

  function resumeAutoWatch() {
    if (!running || stopRequested) return;
    autoPaused = false;
    startAutoWatch();
  }

  function locateTask(task) {
    let target = task.article;
    if ((!target || !target.isConnected) && task.tweetId) {
      const link = document.querySelector(`a[href*="/status/${task.tweetId}"]`);
      if (link) {
        target = link.closest('article[data-testid="tweet"]') || link.closest('article') || link;
      }
    }
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('xcomment-highlight');
      setTimeout(() => target && target.classList && target.classList.remove('xcomment-highlight'), 1800);
      return;
    }
    if (task.tweetUrl) {
      window.open(task.tweetUrl, '_blank', 'noopener');
    }
  }

  function syncPanelPosition() {
    const toggle = document.getElementById(PANEL_TOGGLE_ID);
    const panel = document.getElementById(PANEL_ID);
    if (!toggle || !panel) return;
    
    const toggleRect = toggle.getBoundingClientRect();
    
    // panel默认在toggle的右上方
    // toggle初始位置: right: 16px, bottom: 16px
    // panel初始位置: right: 18px, bottom: 74px
    // 所以panel在toggle上方58px，右侧偏移2px
    
    // 获取toggle的当前位置
    let toggleRight = null;
    let toggleBottom = null;
    let toggleLeft = null;
    let toggleTop = null;
    
    if (toggle.style.right && toggle.style.right !== 'auto') {
      toggleRight = parseFloat(toggle.style.right);
    }
    if (toggle.style.bottom && toggle.style.bottom !== 'auto') {
      toggleBottom = parseFloat(toggle.style.bottom);
    }
    if (toggle.style.left && toggle.style.left !== 'auto') {
      toggleLeft = parseFloat(toggle.style.left);
    }
    if (toggle.style.top && toggle.style.top !== 'auto') {
      toggleTop = parseFloat(toggle.style.top);
    }
    
    // 如果toggle使用left/top定位（拖拽后），计算对应的right/bottom
    if (toggleLeft !== null || toggleTop !== null) {
      if (toggleLeft !== null) {
        toggleRight = window.innerWidth - toggleLeft - toggleRect.width;
      }
      if (toggleTop !== null) {
        toggleBottom = window.innerHeight - toggleTop - toggleRect.height;
      }
    }
    
    // 如果toggle使用right/bottom定位，直接使用
    if (toggleRight === null) {
      toggleRight = 16; // 默认值
    }
    if (toggleBottom === null) {
      toggleBottom = 16; // 默认值
    }
    
    // panel位置：在toggle右上方
    // right偏移: 2px (18 - 16)
    // bottom偏移: 12px (减少间距，让panel更靠近toggle)
    panel.style.right = `${toggleRight + 2}px`;
    panel.style.bottom = `${toggleBottom + toggleRect.height + 12}px`;
    panel.style.left = 'auto';
    panel.style.top = 'auto';
  }

  function enableToggleDrag() {
    const toggle = document.getElementById(PANEL_TOGGLE_ID);
    const panel = document.getElementById(PANEL_ID);
    if (!toggle || !panel) return;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e) => {
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = toggle.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      // 如果移动距离超过5px，才开始拖拽
      if (dx > 5 || dy > 5) {
        isDragging = true;
      }
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const newLeft = startLeft + deltaX;
      const newTop = startTop + deltaY;
      toggle.style.left = `${newLeft}px`;
      toggle.style.top = `${newTop}px`;
      toggle.style.right = 'auto';
      toggle.style.bottom = 'auto';
      toggle.style.position = 'fixed';
      
      // 同步更新panel位置
      syncPanelPosition();
    };

    const onMouseUp = (e) => {
      const wasDragging = isDragging;
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // 如果只是点击（没有拖拽），切换panel显示
      if (!wasDragging) {
        panel.classList.toggle('visible');
        if (panel.classList.contains('visible')) {
          renderEmotions();
          syncPanelPosition();
        }
      }
    };

    toggle.addEventListener('mousedown', onMouseDown);
    
    // 移除原来的click事件监听，因为现在在mouseup中处理
    // toggle.addEventListener('click', (e) => {
    //   if (isDragging) {
    //     e.preventDefault();
    //     e.stopPropagation();
    //   }
    // });
  }

  function setButtonsState({ startDisabled, stopDisabled }) {
    const startBtn = document.getElementById('xcomment-batch-start');
    const stopBtn = document.getElementById('xcomment-batch-stop');
    if (startBtn) {
      startBtn.classList.toggle('muted', !!startDisabled);
      startBtn.disabled = !!startDisabled;
    }
    if (stopBtn) {
      stopBtn.classList.toggle('muted', !!stopDisabled);
      stopBtn.disabled = !!stopDisabled;
    }
  }

  function buildPromptBody(template, task, config) {
    const includeAuthor = config.includeAuthor !== false;
    const includeTone = config.includeTone !== false;
    const postLanguage = detectPostLanguage(task.content);
    const locale = mapLanguageToLocale(postLanguage);
    const languageInstruction =
      postLanguage === '中文'
        ? '请使用中文生成评论'
        : postLanguage === '英语或其他语言'
        ? 'Please reply in English'
        : `请使用${postLanguage}生成评论`;

    let toneValue = '';
    let toneLabel = '';
    if (includeTone) {
      toneValue = currentEmotion?.tone || '';
      toneLabel = currentEmotion?.name || '';
    }

    const templateHasVar = templateHasVars(template, RESPONSE_TEMPLATE_KEYS);
    const body = replaceTemplateVars(template, {
      author_handle: includeAuthor && task.authorHandle ? `@${task.authorHandle}` : '',
      content: task.content,
      reply_content: task.content,
      original_post_text: task.content,
      comments_summary: '',
      lang_instruction: languageInstruction,
      tone: toneValue,
      tone_label: toneLabel,
      locale
    });
    return body;
  }

  function sendGenerateComment(prompt) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'generateComment', prompt }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('无响应'));
          return;
        }
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.comment);
      });
    });
  }

  async function loadTemplateConfig() {
    try {
      const settings = await chrome.storage.sync.get([
        'defaultPromptTemplate',
        'replyPromptTemplate',
        'includeAuthorHandleInPrompt',
        'includeToneInPrompt'
      ]);
      return {
        template:
          settings.defaultPromptTemplate ||
          settings.replyPromptTemplate ||
          DEFAULT_TEMPLATE,
        includeAuthor: settings.includeAuthorHandleInPrompt !== false,
        includeTone: settings.includeToneInPrompt !== false
      };
    } catch (e) {
      return {
        template: DEFAULT_TEMPLATE,
        includeAuthor: true,
        includeTone: true
      };
    }
  }

  function getAllTextInputs() {
    const list = Array.from(
      document.querySelectorAll(
        'div[data-testid^="tweetTextarea_"][contenteditable="true"], div[role="textbox"][contenteditable="true"]'
      )
    );
    // 去重
    return Array.from(new Set(list));
  }

  function findAnyInput() {
    const inputs = getAllTextInputs();
    return inputs.length > 0 ? inputs[0] : null;
  }

  function findNearestInputForArticle(article) {
    if (!article) return findAnyInput();
    const inputs = getAllTextInputs();
    if (!inputs.length) return null;

    const articleRect = article.getBoundingClientRect();
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    inputs.forEach((input) => {
      const rect = input.getBoundingClientRect();
      // 优先选择在文章下方或同一可见区域的输入框
      const dy = rect.top - articleRect.bottom;
      const distance = Math.abs(dy);
      // 仅考虑与文章垂直距离在 800px 内的输入框
      if (distance < bestScore && distance < 800) {
        best = input;
        bestScore = distance;
      }
    });
    return best || inputs[0];
  }

  function findReplyInputForArticle(article) {
    if (!article) return findAnyInput();
    const dialog = article.closest('div[role="dialog"]');
    if (dialog) {
      const inputInDialog =
        dialog.querySelector('div[data-testid^="tweetTextarea_"][contenteditable="true"]') ||
        dialog.querySelector('div[role="textbox"][contenteditable="true"]');
      if (inputInDialog) return inputInDialog;
    }
    // 优先选择距离该 tweet 最近的输入框（避免顶栏发帖框）
    const nearest = findNearestInputForArticle(article);
    if (nearest) return nearest;
    return findAnyInput();
  }

  function findDialogReplyInput() {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    for (const dlg of dialogs) {
      const input =
        dlg.querySelector('div[data-testid^="tweetTextarea_"][contenteditable="true"]') ||
        dlg.querySelector('div[role="textbox"][contenteditable="true"]');
      if (input) return input;
    }
    return null;
  }

  async function openReplyAndFindInput(article) {
    // 如果已经有 dialog 输入框，直接返回
    const preExisting = findDialogReplyInput();
    if (preExisting) return preExisting;

    // 点击该推文的回复按钮
    const replyBtn =
      article.querySelector('[data-testid="reply"]') ||
      article.querySelector('button[data-testid="reply"]') ||
      article.querySelector('div[role="button"][aria-label*="回复"]') ||
      article.querySelector('div[role="button"][aria-label*="Reply"]') ||
      article.querySelector('button[aria-label*="Reply"]') ||
      article.querySelector('button[aria-label*="回复"]');
    if (replyBtn) {
      replyBtn.click();
    }

    // 等待输入框出现
    for (let i = 0; i < 12; i += 1) {
      const dialogInput = findDialogReplyInput();
      if (dialogInput) return dialogInput;
      await sleep(150);
    }

    // 兜底：最近输入框
    return findReplyInputForArticle(article);
  }

  async function setInputText(inputEl, text) {
    if (!inputEl) return false;
    try {
      inputEl.focus();
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", text);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
      });
      const dispatched = inputEl.dispatchEvent(pasteEvent);
      dataTransfer.clearData();
      if (dispatched) {
        return true;
      }
    } catch (e) {
      // fall through to innerHTML fallback
    }
    const wrapper = inputEl.querySelector('[data-text="true"]')?.parentElement;
    if (wrapper) {
      const div = document.createElement("div");
      div.textContent = text;
      const escaped = div.innerHTML;
      wrapper.innerHTML = `<span data-text="true">${escaped}</span>`;
      wrapper.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      wrapper.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  function addInlineCard(task, text) {
    // 尝试重新绑定文章
    if (!task.article || !task.article.isConnected) {
      task.article = findArticleByTweetId(task.tweetId);
    }

    const card = document.createElement('div');
    card.className = CARD_CLASS;
    card.innerHTML = `
      <div class="card-text">${text}</div>
      <div class="card-actions">
        <button type="button" data-action="fill" class="primary">填入输入框</button>
        <button type="button" data-action="copy" class="ghost">复制</button>
      </div>
    `;
    const copyBtn = card.querySelector('button[data-action="copy"]');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        markTaskAsUsed(task, card);
      } catch (e) {
        copyBtn.textContent = '复制失败';
      }
    });

    const fillBtn = card.querySelector('button[data-action="fill"]');
    if (fillBtn) {
      fillBtn.addEventListener('click', async () => {
        fillBtn.textContent = '打开中...';
        fillBtn.disabled = true;
        pauseAutoWatch();
        try {
          let inputEl = await openReplyAndFindInput(task.article);
          if (!inputEl) {
            inputEl = findReplyInputForArticle(task.article);
          }
          if (!inputEl) {
            fillBtn.textContent = '未找到输入框';
            setTimeout(() => (fillBtn.textContent = '填入输入框'), 1500);
            return;
          }
          const ok = await setInputText(inputEl, text);
          if (ok) {
            markTaskAsUsed(task, card);
          } else {
            fillBtn.textContent = '填入失败';
            setTimeout(() => {
              fillBtn.textContent = '填入输入框';
              fillBtn.disabled = false;
            }, 1500);
          }
        } catch (e) {
          fillBtn.textContent = '填入失败';
          setTimeout(() => {
            fillBtn.textContent = '填入输入框';
            fillBtn.disabled = false;
          }, 1500);
        }
        resumeAutoWatch();
      });
    }


    // 在 tweet 区域标记，避免重复处理
    if (task.article) {
      const marker = task.article;
      if (marker.dataset) {
        marker.dataset.xcommentBatchDone = '1';
      }
    }

    const textEl = task.article.querySelector('[data-testid="tweetText"]');
    if (textEl && textEl.parentElement) {
      textEl.parentElement.appendChild(card);
    } else {
      task.article.appendChild(card);
    }
  }

  async function processTask(task) {
    task.status = 'in_progress';
    task.statusLabel = '生成中...';
    renderStatus(task);
    try {
      const config = await loadTemplateConfig();
      const prompt = buildPromptBody(config.template, task, config);
      const comment = await sendGenerateComment(prompt);
      const cleaned = cleanComment(comment);
      addInlineCard(task, cleaned);
      task.status = 'done';
      task.statusLabel = '已生成';
      renderStatus(task);
      recordStat({ total: 1, success: 1 });
    } catch (error) {
      task.status = 'error';
      task.statusLabel = `失败：${error.message}`;
      renderStatus(task);
      recordStat({ total: 1, fail: 1 });
    } finally {
      activeCount -= 1;
      launchNext();
    }
  }

  function launchNext() {
    if (stopRequested) {
      if (activeCount === 0) finishBatch();
      return;
    }
    if (!running) return;
    const next = tasks.find((t) => t.status === 'pending');
    if (!next) {
      return;
    }
    activeCount += 1;
    processTask(next);
    if (activeCount < MAX_CONCURRENCY) {
      setTimeout(() => launchNext(), TASK_DELAY_MS);
    }
  }

  async function startBatch() {
    if (running) return;
    await refreshTasks({ reset: true });
    if (tasks.length === 0) {
      const list = document.getElementById(STATUS_LIST_ID);
      if (list) {
        list.innerHTML = '<div class="row">等待新推文加载...</div>';
      }
    }
    running = true;
    stopRequested = false;
    autoPaused = false;
    setButtonsState({ startDisabled: true, stopDisabled: false });
    activeCount = 0;
    startAutoWatch();
    launchNext();
  }

  function stopBatch() {
    stopRequested = true;
    stopAutoWatch();
    setButtonsState({ startDisabled: true, stopDisabled: true });
    if (activeCount === 0) {
      finishBatch();
    }
  }

  function finishBatch() {
    running = false;
    stopAutoWatch();
    setButtonsState({ startDisabled: false, stopDisabled: true });
    updateSummary();
  }

  async function init() {
    ensureStyles();
    createPanel();
    await loadCompletedCache();
    loadEmotions().then(renderEmotions);
    await refreshTasks();
    enableToggleDrag();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
