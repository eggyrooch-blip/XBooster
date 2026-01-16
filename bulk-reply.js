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
  // 自动点赞推文
  async function autoLikeTweet(article) {
    if (!article) return false;
    
    try {
      // 读取自动点赞配置
      const settings = await chrome.storage.sync.get(['autoLikeAfterReply']);
      const autoLike = settings.autoLikeAfterReply ?? true; // 默认开启
      
      if (!autoLike) {
        return false; // 未开启自动点赞
      }
      
      // 方法1: 通过data-testid查找点赞按钮
      let likeBtn = article.querySelector('[data-testid="like"]');
      
      // 方法2: 通过SVG path特征查找（备用）
      if (!likeBtn) {
        const svgPaths = article.querySelectorAll('svg path');
        for (const path of svgPaths) {
          const d = path.getAttribute('d');
          // 检查是否是点赞按钮的SVG path（根据用户提供的特征）
          if (d && d.includes('M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16')) {
            // 找到包含该path的button
            likeBtn = path.closest('button');
            if (likeBtn) break;
          }
        }
      }
      
      // 方法3: 通过aria-label查找（备用）
      if (!likeBtn) {
        const buttons = article.querySelectorAll('button, div[role="button"]');
        for (const btn of buttons) {
          const ariaLabel = btn.getAttribute('aria-label');
          if (ariaLabel) {
            const lowerLabel = ariaLabel.toLowerCase();
            if (lowerLabel.includes('like') || 
                lowerLabel.includes('喜欢') || 
                lowerLabel.includes('いいね') ||
                lowerLabel.includes('赞')) {
              likeBtn = btn;
              break;
            }
          }
        }
      }
      
      if (!likeBtn) {
        console.log('[XBooster] 未找到点赞按钮');
        return false;
      }
      
      // 检查是否已经点赞（避免重复点赞）
      const ariaLabel = likeBtn.getAttribute('aria-label');
      if (ariaLabel) {
        const lowerLabel = ariaLabel.toLowerCase();
        // 如果按钮显示"unlike"或"已喜欢"，说明已经点赞了
        if (lowerLabel.includes('unlike') || 
            lowerLabel.includes('已喜欢') || 
            lowerLabel.includes('取消喜欢')) {
          console.log('[XBooster] 该推文已点赞，跳过');
          return true; // 已经点赞，返回true
        }
      }
      
      // 检查按钮是否可点击
      if (likeBtn.disabled || likeBtn.getAttribute('aria-disabled') === 'true') {
        console.log('[XBooster] 点赞按钮被禁用');
        return false;
      }
      
      // 点击点赞按钮
      likeBtn.click();
      console.log('[XBooster] ✅ 自动点赞成功');
      
      // 添加视觉反馈（短暂高亮）
      likeBtn.style.transition = 'transform 0.2s ease';
      likeBtn.style.transform = 'scale(1.2)';
      setTimeout(() => {
        if (likeBtn.style) {
          likeBtn.style.transform = 'scale(1)';
        }
      }, 300);
      
      return true;
    } catch (error) {
      console.error('[XBooster] 自动点赞失败:', error);
      return false;
    }
  }

  async function markTaskAsUsed(task, card) {
    if (!task) return;
    const alreadyAccepted = task.status === 'accepted';
    task.status = 'accepted';
    task.statusLabel = '已填入';
    
    // ✅ 修复：移动到"已填入"列表后，自动滚动
    renderStatus(task);
    
    if (task.article && task.article.dataset) {
      task.article.dataset.xcommentBatchDone = '1';
    }
    knownTaskIds.add(task.id);
    if (!alreadyAccepted) {
      recordStat({ accepted: 1 });
    }
    // ✅ 标记任务为已完成，防止重复处理
    await markCompleted(task);
    
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
    
    // ✅ 新增：移除待生成中的该任务卡片，避免视觉混乱
    const pendingList = document.getElementById(STATUS_LIST_ID);
    if (pendingList) {
      const oldRow = pendingList.querySelector(`[data-task-id="${task.id}"]`);
      if (oldRow) {
        oldRow.remove();
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

  function isDarkMode() {
    const bgColor = window.getComputedStyle(document.body).backgroundColor;
    // 解析 rgb 值
    const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      // 如果 RGB 三个值的平均值小于 128，认为是暗黑模式
      return (r + g + b) / 3 < 128;
    }
    return false;
  }

  /**
   * 获取主题相关颜色（统一管理暗黑/明亮模式颜色）
   * @returns {Object} 颜色对象
   */
  function getThemeColors() {
    const dark = isDarkMode();
    return {
      // 强调色（用于潜力标签、链接等）
      accent: dark ? '#1da1f2' : '#1d9bf0',
      // 次要文字色（用于计数器、提示文字等）
      muted: dark ? 'rgb(139, 152, 165)' : '#657786',
      // 面板相关
      panelBg: dark ? 'rgba(32, 35, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      panelColor: dark ? 'rgb(231, 233, 234)' : '#0f1419',
      panelBorder: dark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
      panelShadow: dark ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.15)',
      // 分割线
      headerBorder: dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
      actionsBorder: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
      // 背景
      actionsBg: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
      rowBg: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
      // 按钮
      ghostBg: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
      ghostColor: dark ? 'rgb(231, 233, 234)' : '#0f1419',
      ghostBorder: dark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
      // 卡片
      cardBg: dark ? 'rgb(32, 35, 39)' : '#f8f9fb',
      cardColor: dark ? 'rgb(231, 233, 234)' : '#111',
      cardBorder: dark ? 'rgb(56, 68, 77)' : '#e3e3e3',
      // 行
      rowBorder: dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
      rowColor: dark ? 'rgb(231, 233, 234)' : '#0f1419',
      // 已使用状态
      usedBg: dark ? 'rgb(60, 30, 30)' : '#fff1f0',
      usedBorder: dark ? 'rgb(139, 92, 92)' : '#f5b0a5',
      // 已使用按钮状态
      usedButtonBg: dark ? 'rgba(255, 255, 255, 0.1)' : '#f0f0f0',
      usedButtonColor: dark ? 'rgba(231, 233, 234, 0.5)' : '#9a9a9a',
      // 卡片ghost按钮
      cardGhostBg: dark ? 'rgba(29, 155, 240, 0.2)' : '#e6f3ff',
      cardGhostColor: dark ? 'rgb(139, 152, 165)' : '#0f1419',
      // Footer徽标背景
      footerBadgeBg: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
      // 情绪按钮活跃状态的阴影背景
      emoActiveBoxShadow: dark ? 'rgba(32, 35, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)'
    };
  }

  function ensureStyles() {
    // 移除旧样式以支持主题切换
    const oldStyle = document.getElementById('xcomment-batch-style');
    if (oldStyle) {
      oldStyle.remove();
    }
    
    // 统一获取主题颜色
    const colors = getThemeColors();
    const {
      panelBg, panelColor, panelBorder, panelShadow,
      headerBorder, actionsBg, actionsBorder,
      ghostBg, ghostColor, ghostBorder,
      cardBg, cardColor, cardBorder,
      rowBg, rowBorder, rowColor,
      usedBg, usedBorder,
      usedButtonBg, usedButtonColor,
      cardGhostBg, cardGhostColor,
      footerBadgeBg, emoActiveBoxShadow,
      muted
    } = colors;
    
    const style = document.createElement('style');
    style.id = 'xcomment-batch-style';
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 68px;
        width: 340px;
        max-height: 460px;
        background: ${panelBg};
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: ${panelColor};
        border: 1px solid ${panelBorder};
        border-radius: 12px;
        box-shadow: ${panelShadow};
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
        border-bottom: 1px solid ${headerBorder};
        font-weight: 600;
        font-size: 14px;
        color: ${panelColor};
      }
      #xcomment-batch-counter {
        font-size: 12px;
        color: ${muted};
      }
      .generating-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #1d9bf0;
        font-size: 13px;
        animation: pulse 1.5s ease-in-out infinite;
      }
      .idle-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: ${muted};
        font-size: 13px;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      #${PANEL_ID} .actions {
        display: flex;
        gap: 8px;
        padding: 8px 12px;
        background: ${actionsBg};
        border-bottom: 1px solid ${actionsBorder};
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
        background: ${ghostBg};
        color: ${ghostColor};
        border: 1px solid ${ghostBorder};
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
        color: ${muted};
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
        background: ${rowBg};
        border: 1px solid ${rowBorder};
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 13px;
        line-height: 1.4;
        color: ${rowColor};
      }
      .xcomment-batch-row.potential-high {
        border-left: 4px solid #10b981;
        background: linear-gradient(to right, rgba(16, 185, 129, 0.15), ${rowBg});
      }
      .xcomment-batch-row.potential-medium {
        border-left: 4px solid #3b82f6;
        background: linear-gradient(to right, rgba(59, 130, 246, 0.15), ${rowBg});
      }
      .xcomment-batch-row.potential-low {
        border-left: 4px solid #95a5a6;
        background: linear-gradient(to right, rgba(149, 165, 166, 0.10), ${rowBg});
      }
      .xcomment-batch-row .meta {
        color: ${muted};
        font-size: 11px;
        margin-top: 3px;
      }
      .${CARD_CLASS} {
        margin-top: 8px;
        border: 1px solid ${cardBorder};
        border-radius: 12px;
        padding: 10px;
        background: ${cardBg};
        color: ${cardColor};
        font-size: 14px;
        line-height: 1.5;
      }
      .${CARD_CLASS}.potential-high {
        border: 2px solid #10b981;
        border-left: 6px solid #10b981;
        background: linear-gradient(to right, rgba(16, 185, 129, 0.10), ${cardBg});
      }
      .${CARD_CLASS}.potential-medium {
        border: 2px solid #3b82f6;
        border-left: 6px solid #3b82f6;
        background: linear-gradient(to right, rgba(59, 130, 246, 0.10), ${cardBg});
      }
      .${CARD_CLASS}.potential-low {
        border: 2px solid #95a5a6;
        border-left: 6px solid #95a5a6;
        background: linear-gradient(to right, rgba(149, 165, 166, 0.06), ${cardBg});
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
      .${CARD_CLASS} button.ghost { 
        background: ${cardGhostBg}; 
        color: ${cardGhostColor}; 
      }
      .${CARD_CLASS}.used {
        background: ${usedBg};
        border-color: ${usedBorder};
      }
      .${CARD_CLASS}.used .card-text {
        opacity: 0.75;
      }
      .${CARD_CLASS}.used .card-actions button {
        background: ${usedButtonBg};
        color: ${usedButtonColor};
        cursor: default;
      }
      .xcomment-highlight {
        outline: 2px solid #1d9bf0 !important;
        transition: outline 0.3s ease;
      }
      #${FOOTER_ID} {
        border-top: 1px solid ${headerBorder};
        padding: 8px 12px;
        font-size: 12px;
        color: ${muted};
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #${FOOTER_ID} .badge {
        background: ${footerBadgeBg};
        border-radius: 10px;
        padding: 4px 8px;
        color: ${panelColor};
        font-weight: 600;
      }
      #${PANEL_TOGGLE_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${panelBg};
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: ${panelColor};
        font-size: 24px;
        font-weight: 700;
        border: 1px solid ${panelBorder};
        box-shadow: ${panelShadow};
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
        border-bottom: 1px solid ${actionsBorder};
        scrollbar-width: none;
        min-height: 50px;
      }
      #${EMOTION_LIST_ID}.compact {
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 4px 16px;
        height: 50px;
        min-height: 50px;
        max-height: 50px;
      }
      #${EMOTION_LIST_ID} button {
        position: relative;
        flex: 1 1 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 36px;
        padding: 4px;
        margin: 0;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 22px;
      }
      #${EMOTION_LIST_ID}.compact button {
        flex: 0 0 auto;
        min-width: 40px;
        width: 40px;
        height: 40px;
        font-size: 22px;
        padding: 4px;
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
        box-shadow: 0 0 0 2px ${emoActiveBoxShadow};
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
        <span id="xcomment-batch-counter">0 条</span>
      </header>
      <div id="${EMOTION_LIST_ID}"></div>
      <div class="actions">
        <button id="xcomment-batch-start" class="primary action-btn">开始</button>
        <button id="xcomment-batch-stop" class="ghost action-btn muted">停止</button>
        <button id="xcomment-batch-refresh" class="ghost action-btn">刷新</button>
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
        <div class="badge" id="xcomment-batch-summary">待0 / 进行0 / 成功0 / 失败0 | 总计0</div>
        <div style="font-size:11px;">
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
      // ✅ 修复：刷新时重置状态，释放开始按钮
      if (!running) {
        // 如果当前未运行，确保按钮状态正确
        setButtonsState({ startDisabled: false, stopDisabled: true });
      }
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

  // 提取发布时间（返回小时数）
  function extractPostTime(article) {
    // 方法1: 查找 time[datetime] 元素
    const timeEl = article.querySelector('time[datetime]');
    if (timeEl) {
      const datetime = timeEl.getAttribute('datetime');
      if (datetime) {
        try {
          const postDate = new Date(datetime);
          const now = new Date();
          const diffMs = now - postDate;
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours >= 0 && diffHours < 1000) {
            return diffHours;
          }
        } catch (e) {
          // 日期解析失败，继续尝试其他方法
        }
      }
    }
    
    // 方法2: 查找相对时间文本
    const timeTexts = article.querySelectorAll('span, time, a[href*="/status/"]');
    for (const el of timeTexts) {
      const text = (el.textContent || '').trim();
      // 匹配 "2小时前"、"3h"、"5分钟前" 等格式
      const hourMatch = text.match(/(\d+)\s*(?:小时|h|hour|hr)/i);
      if (hourMatch) {
        return parseFloat(hourMatch[1]);
      }
      const minuteMatch = text.match(/(\d+)\s*(?:分钟|min|minute|m)/i);
      if (minuteMatch) {
        return parseFloat(minuteMatch[1]) / 60;
      }
      // 匹配 "1d"、"2天前" 等格式
      const dayMatch = text.match(/(\d+)\s*(?:天|d|day)/i);
      if (dayMatch) {
        return parseFloat(dayMatch[1]) * 24;
      }
    }
    
    return null; // 无法提取
  }

  // 提取回复数
  function extractReplyCount(article) {
    const replyBtn = article.querySelector('[data-testid="reply"]');
    if (!replyBtn) return null;
    
    // 查找父容器中的数字
    let parent = replyBtn.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      const text = parent.textContent || '';
      // 匹配数字（可能包含 K、万 等）
      const match = text.match(/(\d+(?:\.\d+)?)\s*(?:K|k|万|w|M|m)?/);
      if (match) {
        let num = parseFloat(match[1]);
        const unit = text.substring(match.index + match[0].length - 1, match.index + match[0].length);
        if (unit === 'K' || unit === 'k') {
          num *= 1000;
        } else if (unit === '万' || unit === 'w') {
          num *= 10000;
        } else if (unit === 'M' || unit === 'm') {
          num *= 1000000;
        }
        return Math.floor(num);
      }
      parent = parent.parentElement;
      depth++;
    }
    
    return null;
  }

  // 提取点赞数
  function extractLikeCount(article) {
    const likeBtn = article.querySelector('[data-testid="like"]');
    if (!likeBtn) return null;
    
    let parent = likeBtn.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      const text = parent.textContent || '';
      const match = text.match(/(\d+(?:\.\d+)?)\s*(?:K|k|万|w|M|m)?/);
      if (match) {
        let num = parseFloat(match[1]);
        const unit = text.substring(match.index + match[0].length - 1, match.index + match[0].length);
        if (unit === 'K' || unit === 'k') {
          num *= 1000;
        } else if (unit === '万' || unit === 'w') {
          num *= 10000;
        } else if (unit === 'M' || unit === 'm') {
          num *= 1000000;
        }
        return Math.floor(num);
      }
      parent = parent.parentElement;
      depth++;
    }
    
    return null;
  }

  // 计算时间得分（0-100）
  function calculateTimeScore(hours) {
    if (hours === null || hours === undefined) return 50; // 默认中等
    
    if (hours >= 2 && hours <= 8) {
      return 100; // 最佳窗口
    } else if ((hours >= 1 && hours < 2) || (hours > 8 && hours <= 10)) {
      return 60; // 次优
    } else {
      return 20; // 其他
    }
  }

  // 计算竞争得分（0-100）
  function calculateCompetitionScore(replyCount) {
    if (replyCount === null || replyCount === undefined) return 50; // 默认中等
    
    if (replyCount < 30) {
      return 100; // 竞争小
    } else if (replyCount >= 30 && replyCount < 50) {
      return 60; // 中等竞争
    } else if (replyCount >= 50 && replyCount < 100) {
      return 30; // 竞争较大
    } else {
      return 10; // 竞争很大
    }
  }

  // 计算潜力指数
  async function calculatePotentialScore(task) {
    const settings = await chrome.storage.sync.get([
      'potentialTimeWeight',
      'potentialCompetitionWeight'
    ]);
    
    const timeWeight = settings.potentialTimeWeight ?? 0.5;
    const competitionWeight = settings.potentialCompetitionWeight ?? 0.5;
    
    const timeScore = calculateTimeScore(task.postTime);
    const competitionScore = calculateCompetitionScore(task.replyCount);
    
    const totalScore = timeScore * timeWeight + competitionScore * competitionWeight;
    
    return Math.round(totalScore);
  }

  // 获取潜力等级
  async function getPotentialLevel(score) {
    const settings = await chrome.storage.sync.get([
      'potentialHighThreshold',
      'potentialMediumThreshold'
    ]);
    
    const highThreshold = settings.potentialHighThreshold ?? 70;
    const mediumThreshold = settings.potentialMediumThreshold ?? 40;
    
    if (score >= highThreshold) {
      return 'high'; // 3条回复
    } else if (score >= mediumThreshold) {
      return 'medium'; // 2条回复
    } else {
      return 'low'; // 1条回复
    }
  }

  // 拆分回复为多条（智能拆分，避免逗号开头）
  function splitCommentIntoReplies(comment, count) {
    if (count <= 1) return [comment];
    
    // 先尝试按段落拆分（双换行、单换行）
    const paragraphs = comment.split(/\n\s*\n+/).filter(p => p.trim());
    if (paragraphs.length >= count) {
      // 如果段落数足够，按段落拆分
      const paragraphsPerReply = Math.ceil(paragraphs.length / count);
      const replies = [];
      for (let i = 0; i < count; i++) {
        const start = i * paragraphsPerReply;
        const end = Math.min(start + paragraphsPerReply, paragraphs.length);
        const replyText = paragraphs.slice(start, end).join('\n').trim();
        if (replyText && !replyText.match(/^[，,。.！!？?；;：:]/)) {
          replies.push(replyText);
        }
      }
      if (replies.length === count) return replies;
    }
    
    // 备用方案：按句子拆分（支持中英文标点）
    // 保留标点符号，但过滤掉空字符串
    const parts = comment.split(/([。！？.!?]\s*)/);
    const sentences = [];
    for (let i = 0; i < parts.length; i += 2) {
      const sentence = parts[i] + (parts[i + 1] || '');
      if (sentence.trim()) {
        sentences.push(sentence.trim());
      }
    }
    
    if (sentences.length === 0) return [comment];
    
    // 计算每条回复应该包含的句子数
    const sentencesPerReply = Math.ceil(sentences.length / count);
    const replies = [];
    
    for (let i = 0; i < count; i++) {
      const start = i * sentencesPerReply;
      const end = Math.min(start + sentencesPerReply, sentences.length);
      let replyText = sentences.slice(start, end).join('').trim();
      
      // 清理开头：移除开头的逗号、句号等标点
      replyText = replyText.replace(/^[，,。.！!？?；;：:\s]+/, '');
      
      // 确保不是空字符串，且不以标点开头
      if (replyText && !replyText.match(/^[，,。.！!？?；;：:]/)) {
        replies.push(replyText);
      } else if (replyText) {
        // 如果清理后还有内容但以标点开头，尝试找到第一个非标点字符
        const firstNonPunct = replyText.match(/[^，,。.！!？?；;：:\s]/);
        if (firstNonPunct) {
          const index = replyText.indexOf(firstNonPunct[0]);
          replyText = replyText.substring(index);
          if (replyText) replies.push(replyText);
        }
      }
    }
    
    // 如果拆分后数量不足，尝试更宽松的拆分
    if (replies.length < count && sentences.length > 0) {
      // 重新分配，确保每条都有内容
      const newReplies = [];
      const targetPerReply = Math.floor(sentences.length / count);
      let currentIndex = 0;
      
      for (let i = 0; i < count; i++) {
        const take = i < count - 1 ? targetPerReply : sentences.length - currentIndex;
        let replyText = sentences.slice(currentIndex, currentIndex + take).join('').trim();
        replyText = replyText.replace(/^[，,。.！!？?；;：:\s]+/, '');
        
        if (replyText && !replyText.match(/^[，,。.！!？?；;：:]/)) {
          newReplies.push(replyText);
        } else if (replyText) {
          // 最后尝试：如果还是以标点开头，至少保证有内容
          newReplies.push(replyText);
        }
        currentIndex += take;
      }
      
      if (newReplies.length > 0) {
        return newReplies.slice(0, count);
      }
    }
    
    // 最后的兜底：如果还是不够，至少返回原回复
    if (replies.length === 0) {
      return [comment];
    }
    
    return replies.slice(0, count);
  }

  // 检测推文是否可以回复（过滤有回复限制的推文）
  function canReplyToTweet(article) {
    const replyBtn = article.querySelector('[data-testid="reply"]');
    if (!replyBtn) {
      return false;
    }
    
    // 简化检测：只检查最关键的指标
    
    // 方法1：检查按钮是否被禁用（最可靠）
    if (replyBtn.disabled || replyBtn.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    
    // 方法2：检查是否有回复限制提示文本
    // X会在限制回复的推文底部显示特殊提示
    const restrictionText = article.querySelector('[data-testid="reply-restriction-text"]');
    if (restrictionText) {
      return false;
    }
    
    return true; // 默认认为可以回复
  }

  // 检测用户是否为蓝V认证用户
  function isVerifiedUser(article) {
    if (!article) return false;
    
    // 方法1: 查找认证标志SVG（通过path的d属性识别）- 最准确的方法
    // Twitter的蓝V标志有特定的SVG path，这是用户提供的蓝对钩的特征
    const verifiedBadges = article.querySelectorAll('svg path');
    for (const path of verifiedBadges) {
      const d = path.getAttribute('d');
      // 检查是否包含蓝V标志的特征字符串
      if (d && (
        d.includes('M20.396 11c-.018-.646-.215-1.275-.57-1.816') || // 完整特征
        d.includes('M22.25 12c0-1.43-.') || // 另一种可能的蓝V path
        d.includes('M20.396 11c') // 开头特征（更兼容）
      )) {
        return true;
      }
    }
    
    // 方法2: 查找认证标志元素（通过aria-label）
    const userNameSection = article.querySelector('[data-testid="User-Name"]');
    if (userNameSection) {
      // 查找带有"Verified"标签的元素（支持多语言）
      const verifiedLabels = userNameSection.querySelectorAll(
        '[aria-label*="Verified"], [aria-label*="已认证"], [aria-label*="認證済み"], [aria-label*="verificado"]'
      );
      if (verifiedLabels.length > 0) {
        return true;
      }
      
      // 查找蓝V的SVG图标（通过aria-label）
      const svgs = userNameSection.querySelectorAll('svg');
      for (const svg of svgs) {
        const ariaLabel = svg.getAttribute('aria-label');
        if (ariaLabel) {
          const lowerLabel = ariaLabel.toLowerCase();
          if (lowerLabel.includes('verified') || 
              lowerLabel.includes('已认证') || 
              lowerLabel.includes('認證済み') ||
              lowerLabel.includes('verificado')) {
            return true;
          }
        }
      }
    }
    
    // 方法3: 查找用户名后的认证徽章（通过特定的class或data属性）
    const verifiedBadge = article.querySelector('[data-testid="icon-verified"]');
    if (verifiedBadge) {
      return true;
    }
    
    // 方法4: 通过用户链接的aria-label检测（备用）
    const userLinks = article.querySelectorAll('a[href^="/"]');
    for (const link of userLinks) {
      const ariaLabel = link.getAttribute('aria-label');
      if (ariaLabel) {
        const lowerLabel = ariaLabel.toLowerCase();
        if (lowerLabel.includes('verified') || lowerLabel.includes('已认证')) {
          return true;
        }
      }
    }
    
    return false;
  }

  async function collectTweets() {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    
    const currentUser = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    const myHandle = currentUser ? (currentUser.getAttribute('href') || '').split('/')[1] : '';

    // 读取筛选配置
    const filterSettings = await chrome.storage.sync.get([
      'filterPotentialHigh',
      'filterPotentialMedium',
      'filterPotentialLow',
      'filterVerifiedOnly'
    ]);
    
    const filterHigh = filterSettings.filterPotentialHigh ?? true;
    const filterMedium = filterSettings.filterPotentialMedium ?? true;
    const filterLow = filterSettings.filterPotentialLow ?? true;
    const verifiedOnly = filterSettings.filterVerifiedOnly ?? false;

    const list = [];
    let skipped = { dialog: 0, marked: 0, noReply: 0, noContent: 0, self: 0, completed: 0, notVerified: 0, potentialFiltered: 0 };
    
    articles.forEach((article, idx) => {
      // 跳过回复弹窗内的 article，避免重复生成
      if (article.closest('div[role="dialog"]')) {
        skipped.dialog++;
        return;
      }
      if (article.dataset.xcommentBatchDone === '1') {
        skipped.marked++;
        return;
      }
      
      // 检查是否可以回复（过滤有回复限制的推文）
      if (!canReplyToTweet(article)) {
        skipped.noReply++;
        return;
      }
      
      const content = extractContent(article);
      const handle = extractHandle(article);
      
      if (!content) {
        skipped.noContent++;
        return;
      }
      if (myHandle && handle === myHandle) {
        skipped.self++;
        return;
      }
      
      const tweetId = extractTweetId(article);
      const tweetUrl = extractTweetUrl(article);
      const dedupKey = tweetId || `${handle || 'unk'}-${content.slice(0, 80)}`;
      
      // ✅ 检测是否为蓝V用户
      const isVerified = isVerifiedUser(article);
      
      // ✅ 蓝V筛选：如果开启了"仅回复蓝V"，且该用户不是蓝V，跳过
      if (verifiedOnly && !isVerified) {
        skipped.notVerified++;
        return;
      }
      
      // ✅ 构建候选任务
      const candidate = {
        id: dedupKey || `${Date.now()}-${idx}`,
        tweetId,
        tweetUrl,
        article,
        content,
        authorHandle: handle,
        postTime: extractPostTime(article),
        replyCount: extractReplyCount(article),
        likeCount: extractLikeCount(article),
        isVerified: isVerified
      };
      
      // ✅ 检查是否已经完成过（使用持久化的完成记录）
      if (isCompleted(candidate)) {
        skipped.completed++;
        // 即使已完成，也标记该article，避免重复检查
        article.dataset.xcommentBatchDone = '1';
        return;
      }
      
      list.push(candidate);
    });
    
    console.log(`[XBooster] 扫描: ${articles.length}条推文, 收集: ${list.length}条, 跳过: 弹窗${skipped.dialog} 已标记${skipped.marked} 已完成${skipped.completed} 无回复${skipped.noReply} 无内容${skipped.noContent} 自己${skipped.self} 非蓝V${skipped.notVerified} 潜力筛选${skipped.potentialFiltered}`);
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
    if (!header) return;
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const runningCount = tasks.filter((t) => t.status === 'in_progress').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const failed = tasks.filter((t) => t.status === 'error').length;
    
    // ✅ 优化：右上角显示状态（始终显示，运行时带动画）
    // 只有在真正运行且有任务进行中时才显示"生成中"
    if (running && runningCount > 0) {
      header.innerHTML = '<span class="generating-status"><img src="' + TOGGLE_ICON_URL + '" style="width:16px;height:16px;"> 生成中...</span>';
    } else {
      // 其他情况（未运行、运行但无任务进行中）都显示"待命中"
      header.innerHTML = '<span class="idle-status"><img src="' + TOGGLE_ICON_URL + '" style="width:16px;height:16px;opacity:0.6;"> 待命中</span>';
    }
    
    // 左下角显示完整统计
    if (footerSummary) {
      footerSummary.textContent = `待${pending} / 进行${runningCount} / 成功${done} / 失败${failed} | 总计${tasks.length}`;
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
    
    // ✅ 新增：自动滚动到底部（确保最新内容可见）
    setTimeout(() => {
      if (targetList.scrollHeight > targetList.clientHeight) {
        targetList.scrollTop = targetList.scrollHeight;
      }
    }, 100);
    
    // 添加潜力等级class
    row.classList.remove('potential-high', 'potential-medium', 'potential-low');
    if (task.potentialLevel) {
      row.classList.add(`potential-${task.potentialLevel}`);
    }
    
    // 构建潜力指数标签
    let potentialBadge = '';
    if (task.potentialScore !== undefined) {
      const levelLabels = { high: '潜力高 ⭐⭐⭐', medium: '潜力中 ⭐⭐', low: '潜力低 ⭐' };
      const levelLabel = levelLabels[task.potentialLevel] || '';
      const { accent } = getThemeColors();
      potentialBadge = levelLabel ? `<span style="color: ${accent}; font-weight: 600; margin-right: 8px;">${levelLabel}</span>` : '';
    }
    
    row.innerHTML = `
      <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${potentialBadge}${task.preview || task.content.slice(0, 70)}${task.content.length > 70 ? '…' : ''}</div>
      <div class="meta">${task.statusLabel || task.status}${task.potentialScore !== undefined ? ` (${task.potentialScore}分)` : ''}</div>
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

  function buildPromptBody(template, task, config, potentialLevel = 'low') {
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

    // 根据潜力等级添加长度和拆分提示
    let lengthInstruction = '';
    if (potentialLevel === 'high') {
      lengthInstruction = '\n\n【重要：此回复可能需要拆分成3条发送】\n- 请生成一条较长的、内容丰富的回复（建议150-250字符，包含多个观点或细节）。\n- 回复应该自然地包含多个完整的语义段落，每个段落可以独立成一条回复。\n- 避免在逗号处断开，优先在完整的观点或话题转换处自然分段。\n- 确保每条拆分后的回复开头都是完整的句子，不要以逗号、句号或其他标点开头。';
    } else if (potentialLevel === 'medium') {
      lengthInstruction = '\n\n【重要：此回复可能需要拆分成2条发送】\n- 请生成一条中等长度的回复（建议100-180字符，包含2-3个观点或细节）。\n- 回复应该自然地包含2个完整的语义段落，每个段落可以独立成一条回复。\n- 避免在逗号处断开，优先在完整的观点转换处自然分段。\n- 确保每条拆分后的回复开头都是完整的句子，不要以逗号、句号或其他标点开头。';
    }

    const templateHasVar = templateHasVars(template, RESPONSE_TEMPLATE_KEYS);
    let body = replaceTemplateVars(template, {
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
    
    // 如果模板中没有使用变量，追加长度提示
    if (!templateHasVar && lengthInstruction) {
      body += lengthInstruction;
    } else if (templateHasVar && lengthInstruction) {
      // 如果使用了变量，在任务描述后追加
      body = body.replace(
        /任务：根据以下帖子内容，生成1条（仅一条）自然回复。/,
        `任务：根据以下帖子内容，生成1条（仅一条）自然回复。${lengthInstruction}`
      );
    }
    
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

  function addInlineCard(task, text, index = 1, total = 1) {
    // 尝试重新绑定文章
    if (!task.article || !task.article.isConnected) {
      task.article = findArticleByTweetId(task.tweetId);
    }
    
    // ✅ 检查是否已有相同 index 的卡片（精确防重复）
    if (task.article) {
      const existingIndexCard = task.article.querySelector(
        `.${CARD_CLASS}[data-task-id="${task.id}"][data-reply-index="${index}-${total}"]`
      );
      if (existingIndexCard) {
        console.log(`[XBooster] 跳过重复添加卡片: 任务 ${task.id} 的第 ${index}/${total} 条已存在`);
        return;
      }
    }

    const card = document.createElement('div');
    card.className = CARD_CLASS;
    // ✅ 添加唯一标识，防止重复添加
    card.dataset.taskId = task.id;
    card.dataset.replyIndex = `${index}-${total}`;
    
    // 添加潜力等级class
    if (task.potentialLevel) {
      card.classList.add(`potential-${task.potentialLevel}`);
    }
    
    // 如果有多条回复，显示序号（根据当前主题动态设置颜色）
    const { muted } = getThemeColors();
    const replyLabel = total > 1 ? `<div style="font-size: 11px; color: ${muted}; margin-bottom: 4px;">回复 ${index}/${total}</div>` : '';
    
    card.innerHTML = `
      ${replyLabel}
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
        // ✅ 修复：复制后标记为已用，从待生成移除
        await markTaskAsUsed(task, card);
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
            await markTaskAsUsed(task, card);
            
            // ✅ 只在最后一条回复填入后才自动点赞
            // 判断是否是最后一条：当前 index === total
            if (task.article && index === total) {
              // 随机延迟3-5秒，模拟真实用户在阅读评论后点赞的行为
              const randomDelay = 3000 + Math.random() * 2000; // 3000-5000ms之间的随机延迟
              setTimeout(() => {
                autoLikeTweet(task.article);
              }, randomDelay);
            }
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
    // 初始化重试次数
    if (task.retryCount === undefined) {
      task.retryCount = 0;
    }
    
    // ✅ 防止重复处理：如果已完成，直接返回
    if (task.status === 'done' && task.retryCount === 0) {
      console.log(`[XBooster] 跳过已完成任务: ${task.id}`);
      activeCount -= 1;
      return;
    }
    
    // ✅ 防止重复处理：如果已填入，直接返回
    if (task.status === 'accepted' && task.retryCount === 0) {
      console.log(`[XBooster] 跳过已填入任务: ${task.id}`);
      activeCount -= 1;
      return;
    }
    
    // ✅ 检查推文是否已有回复卡片（最强防御，仅针对非重试）
    if (task.article && task.retryCount === 0) {
      const existingCards = task.article.querySelectorAll(`.${CARD_CLASS}[data-task-id="${task.id}"]`);
      if (existingCards.length > 0) {
        console.log(`[XBooster] 跳过已有卡片的任务: ${task.id}（已有${existingCards.length}个卡片）`);
        task.status = 'done';
        activeCount -= 1;
        await markCompleted(task);
        return;
      }
    }
    
    // ✅ 立即标记推文为已处理，避免重复生成（在所有操作之前）
    if (task.article && task.article.dataset) {
      task.article.dataset.xcommentBatchDone = '1';
    }
    
    // ✅ 立即添加到已知任务集合，防止并发重复
    knownTaskIds.add(task.id);
    
    // ✅ 预先标记为已完成，防止页面刷新时重复处理
    await markCompleted(task);
    
    task.statusLabel = '生成中...';
    renderStatus(task);
    try {
      // 计算潜力指数
      const potentialScore = await calculatePotentialScore(task);
      const potentialLevel = await getPotentialLevel(potentialScore);
      task.potentialScore = potentialScore;
      task.potentialLevel = potentialLevel;
      
      // ✅ 读取潜力筛选配置
      const filterSettings = await chrome.storage.sync.get([
        'filterPotentialHigh',
        'filterPotentialMedium',
        'filterPotentialLow'
      ]);
      
      const filterHigh = filterSettings.filterPotentialHigh ?? true;
      const filterMedium = filterSettings.filterPotentialMedium ?? true;
      const filterLow = filterSettings.filterPotentialLow ?? true;
      
      // ✅ 潜力筛选：检查当前任务的潜力等级是否被选中
      if (
        (potentialLevel === 'high' && !filterHigh) ||
        (potentialLevel === 'medium' && !filterMedium) ||
        (potentialLevel === 'low' && !filterLow)
      ) {
        console.log(`[XBooster] 跳过潜力筛选任务: ${task.id}（潜力等级: ${potentialLevel}）`);
        task.status = 'done';
        task.statusLabel = '已跳过（潜力筛选）';
        renderStatus(task);
        activeCount -= 1;
        launchNext();
        return;
      }
      
      // 根据潜力等级决定回复数量
      const replyCount = potentialLevel === 'high' ? 3 : potentialLevel === 'medium' ? 2 : 1;
      
      const config = await loadTemplateConfig();
      const prompt = buildPromptBody(config.template, task, config, potentialLevel);
      const comment = await sendGenerateComment(prompt);
      const cleaned = cleanComment(comment);
      
      // 拆分回复为多条
      const replies = splitCommentIntoReplies(cleaned, replyCount);
      
      // 为每条回复添加卡片
      replies.forEach((replyText, index) => {
        addInlineCard(task, replyText, index + 1, replies.length);
      });
      
      task.status = 'done';
      task.statusLabel = `已生成${replies.length}条`;
      renderStatus(task);
      recordStat({ total: 1, success: 1 });
      activeCount -= 1;
      launchNext();
    } catch (error) {
      console.log(`[XBooster] 任务失败:`, error.message || error);
      // 自动重试逻辑：最多重试2次
      if (task.retryCount < 2) {
        task.retryCount += 1;
        // 🐛 修复：明确设置状态为 in_progress，确保在延迟期间不会被判断为"已完成"
        task.status = 'in_progress';
        task.statusLabel = `重试中(${task.retryCount}/2)...`;
        renderStatus(task);
        // 延迟1秒后重试
        activeCount -= 1; // 释放槽位，让其他任务可以运行
        launchNext(); // 继续处理其他任务
        setTimeout(() => {
          if (running && !stopRequested) {
            console.log(`[XBooster] 重试任务 ${task.id}, 第${task.retryCount}次重试`);
            activeCount += 1; // 重新占用槽位
            processTask(task);
          }
        }, 1000);
        return;
      }
      
      // 重试2次后仍失败，插入随机emoji作为fallback
      const fallbackEmojis = ['😄😄😄', '😊😊😊', '👍👍👍', '🎉🎉🎉', '✨✨✨', '💯💯💯', '🔥🔥🔥'];
      const randomEmoji = fallbackEmojis[Math.floor(Math.random() * fallbackEmojis.length)];
      addInlineCard(task, randomEmoji, 1, 1);
      
      task.status = 'done';
      task.statusLabel = `已插入fallback`;
      renderStatus(task);
      recordStat({ total: 1, success: 1 }); // 算作成功，因为有fallback
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
    
    // ✅ 查找待处理的任务，排除正在处理的任务
    const next = tasks.find((t) => 
      t.status === 'pending' &&
      // 额外检查：确保任务没有已生成的卡片
      (!t.article || t.article.querySelectorAll(`.${CARD_CLASS}[data-task-id="${t.id}"]`).length === 0)
    );
    if (!next) {
      // 🔥 修复：不自动停止，保持运行状态，继续监控新任务
      // 只有用户手动点击"停止"按钮时才会停止批处理
      return;
    }
    
    // ✅ 立即标记为正在处理，防止重复启动
    next.status = 'in_progress';
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
    updateSummary();
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
    try {
      ensureStyles();
      createPanel();
      await loadCompletedCache();
      await loadEmotions();
      renderEmotions();
      await refreshTasks();
      enableToggleDrag();
      
      // ✅ 默认展开面板
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.add('visible');
        syncPanelPosition();
      }
      
      console.log('[XBooster Batch] ✅ 批量回复面板初始化完成');
    } catch (error) {
      console.error('[XBooster Batch] ❌ 初始化失败:', error);
    }
    
    // 监听情绪变化，实时更新选择器
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[EMO_STORAGE_KEY]) {
        loadEmotions().then(renderEmotions);
      }
    });
    
    // 监听主题变化（通过body的background-color变化检测）
    const themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          // 检测到style变化，重新应用样式
          ensureStyles();
          break;
        }
      }
    });
    
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['style']
    });
    
    // 也监听整个文档的背景色变化（通过class变化间接检测）
    const classObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme')) {
          ensureStyles();
          break;
        }
      }
    });
    
    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
