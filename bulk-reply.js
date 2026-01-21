(() => {
  // ========== v1.0.5 高级优化 ==========

  // ✅ 优化1：模拟 Twitter 原生类名格式（特征混淆）
  function generateTwitterLikeClass() {
    const prefixes = ['css', 'r'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const length = 6 + Math.floor(Math.random() * 3);
    let hash = '';
    for (let i = 0; i < length; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${prefix}-${hash}`;
  }

  // ✅ 优化2：正态分布随机（更符合人类行为特征）
  function normalRandom(mean, stdDev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, mean + z0 * stdDev);
  }

  // ✅ 优化3：人类行为延迟
  function humanLikeDelay(action = 'default') {
    switch (action) {
      case 'refresh':
        return normalRandom(4500, 800); // 刷新间隔
      case 'task':
        return normalRandom(300, 100);  // 任务间隔
      case 'mutation':
        return normalRandom(500, 150);  // DOM 变化响应
      case 'scroll':
        return normalRandom(200, 50);   // 滚动响应
      default:
        return normalRandom(400, 120);
    }
  }

  // ✅ 优化4：智能暂停机制
  let riskLevel = 'low';
  let operationCount = 0;
  const MAX_OPS_PER_MINUTE = 30;

  function assessRisk() {
    operationCount++;
    const isHighFrequency = operationCount > MAX_OPS_PER_MINUTE;
    const hasWarningElements = document.querySelector('[data-testid="error"]') ||
      document.querySelector('[role="alert"]');

    if (hasWarningElements) {
      riskLevel = 'high';
    } else if (isHighFrequency) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }
    return riskLevel;
  }

  function getAdaptiveRefreshInterval() {
    const risk = assessRisk();
    switch (risk) {
      case 'high':
        return humanLikeDelay('refresh') * 3; // 高风险：大幅降低
      case 'medium':
        return humanLikeDelay('refresh') * 1.5; // 中风险：适度降低
      default:
        return humanLikeDelay('refresh');
    }
  }

  function getAdaptiveConcurrency() {
    switch (riskLevel) {
      case 'high':
        return 1;
      default:
        return 2;
    }
  }

  // ✅ 统一日志系统 - 只输出 warning 和 error
  const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
  const CURRENT_LOG_LEVEL = LOG_LEVELS.WARN; // 只显示警告和错误

  const logger = {
    error: (...args) => {
      if (CURRENT_LOG_LEVEL >= LOG_LEVELS.ERROR) {
        console.error('[XBooster Error]', ...args);
      }
    },
    warn: (...args) => {
      if (CURRENT_LOG_LEVEL >= LOG_LEVELS.WARN) {
        console.warn('[XBooster Warning]', ...args);
      }
    },
    info: (...args) => {
      if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) {
        console.log('[XBooster]', ...args);
      }
    },
    debug: (...args) => {
      if (CURRENT_LOG_LEVEL >= LOG_LEVELS.DEBUG) {
        console.log('[XBooster Debug]', ...args);
      }
    }
  };

  // ✅ v1.0.5：使用 Twitter 风格的类名
  const PANEL_ID = generateTwitterLikeClass();
  const PANEL_TOGGLE_ID = generateTwitterLikeClass();
  const FOOTER_ID = generateTwitterLikeClass();
  const EMOTION_LIST_ID = generateTwitterLikeClass();
  const CARD_CLASS = generateTwitterLikeClass();
  const MAX_CONCURRENCY = 2; // 基础值，实际使用 getAdaptiveConcurrency()
  const TASK_DELAY_MS = 200; // 基础值，实际使用 humanLikeDelay()
  const AUTO_REFRESH_MS = 4000; // 基础值，实际使用 getAdaptiveRefreshInterval()
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
    'locale',
    'is_high_potential',
    'post_type'
  ];
  const DEFAULT_TEMPLATE =
    '{{lang_instruction}}\n\n请生成一条简洁、有价值、自然的回复（不超过280字符）。\n作者：{{author_handle}}\n语气：{{tone_label}}\n内容：{{content}}';

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
  // ✅ 性能优化：保存主题监听器引用，以便在页面隐藏时断开
  let themeObserver = null;
  let classObserver = null;
  let themeStyleTimeout = null; // 节流用
  const STATS_KEY = 'xcomment_batch_stats';
  const COMPLETED_KEY = 'xcomment_batch_completed';
  let emotions = [];
  let currentEmotion = null;
  const EMO_STORAGE_KEY = 'currentEmotion';
  const RETRY_FAILED_ID = 'xcomment-retry-failed';
  let completedIds = new Set();

  // ========== 会话统计计数器（不受清理影响） ==========
  let sessionStats = {
    generated: 0,   // 生成成功数（DONE）
    failed: 0,      // 失败数（FAIL）
    filled: 0       // 已填入数（包含在DONE中）
  };

  // ========== 导航功能状态 ==========
  let navigationState = {
    currentIndex: -1,
    completedPosts: [],
    lastNavigationTime: 0,
    minNavigationInterval: 800, // 导航间隔800ms（更流畅）
    currentArticle: null  // 当前正在处理的文章，用于定位下一篇
  };

  let highlightTimeout = null;

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

      // 刷新导航列表（延迟执行，避免频繁刷新）
      if (typeof refreshNavigationPosts === 'function') {
        setTimeout(() => {
          refreshNavigationPosts();
        }, 500);
      }
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
          return true; // 已经点赞，返回true
        }
      }

      // 检查按钮是否可点击
      if (likeBtn.disabled || likeBtn.getAttribute('aria-disabled') === 'true') {
        return false;
      }

      // 点击点赞按钮
      likeBtn.click();

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

    // ✅ 性能优化：使用 getTaskArticle 获取 article（可能需要重新查找）
    const article = getTaskArticle(task);
    if (article && article.dataset) {
      article.dataset.xcommentBatchDone = '1';
    }

    // ✨ 在帖子上显示"已填入"状态
    if (article) {
      updateArticleBadge(article, {
        potentialLevel: task.potentialLevel,
        status: 'accepted',
        score: task.potentialScore
      });
    }

    knownTaskIds.add(task.id);
    if (!alreadyAccepted) {
      sessionStats.filled++; // 会话填入计数
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

    // ✅ 性能优化：标记完成后释放 DOM 引用
    releaseTaskDomRef(task);
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


  // emoji 展开/折叠状态
  let emotionsExpanded = false;

  function renderEmotions() {
    const emotionRow = document.getElementById('xcomment-emotion-row');
    const emotionIndicator = document.getElementById('xcomment-emotion-indicator');
    const emotionOptions = document.getElementById('xcomment-emotion-options');
    
    // 确保有当前情绪（默认为友好）
    if (!currentEmotion && emotions && emotions.length > 0) {
      currentEmotion = emotions.find(e => e.id === 'friendly') || emotions[0];
    }

    // 更新情绪指示器（显示当前选中的emoji）
    if (emotionIndicator) {
      const currentEmo = currentEmotion || (emotions && emotions.length > 0 ? emotions[0] : null);
      if (currentEmo) {
        emotionIndicator.textContent = currentEmo.emoji || '😊';
        emotionIndicator.title = `当前: ${currentEmo.name}\n点击${emotionsExpanded ? '收起' : '展开'}`;
        emotionIndicator.onclick = (e) => {
          e.stopPropagation();
          emotionsExpanded = !emotionsExpanded;
          renderEmotions();
        };
      }
    }

    if (!emotionRow || !emotionOptions || !emotions || emotions.length === 0) return;

    // 更新展开状态
    if (emotionsExpanded) {
      emotionRow.classList.add('expanded');
    } else {
      emotionRow.classList.remove('expanded');
    }

    // 清空并重新渲染选项
    emotionOptions.innerHTML = '';
    
    emotions.forEach((emo) => {
      // 跳过当前选中的（已经显示在指示器中）
      if (currentEmotion && currentEmotion.id === emo.id) return;
      
      const btn = document.createElement('button');
      btn.textContent = emo.emoji || '';
      btn.title = `${emo.name || ''}`;
      btn.onclick = async (e) => {
        e.stopPropagation();
        currentEmotion = emo;
        await chrome.storage.sync.set({ [EMO_STORAGE_KEY]: emo });
        emotionsExpanded = false;
        renderEmotions();
      };
      emotionOptions.appendChild(btn);
    });
    
    // 点击外部关闭
    if (emotionsExpanded) {
      const closeHandler = (e) => {
        if (!emotionRow.contains(e.target)) {
          emotionsExpanded = false;
          renderEmotions();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => {
        document.addEventListener('click', closeHandler);
      }, 100);
    }
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

    // 检测暗黑模式
    const dark = isDarkMode();

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
        width: 380px;
        max-height: 520px;
        background: ${dark ? 'linear-gradient(135deg, rgba(32, 35, 39, 0.98) 0%, rgba(22, 24, 28, 0.98) 100%)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)'};
        backdrop-filter: blur(30px);
        -webkit-backdrop-filter: blur(30px);
        color: ${panelColor};
        border: 1px solid ${panelBorder};
        border-radius: 24px;
        box-shadow: ${dark ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)' : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        z-index: 2147483647;
        display: none;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      #${PANEL_ID}.visible { display: flex; }
      #${PANEL_ID} header.panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid ${headerBorder};
        background: ${dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'};
      }
      #${PANEL_ID} .brand {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${PANEL_ID} .brand-icon {
        width: 24px;
        height: 24px;
        border-radius: 4px;
      }
      #${PANEL_ID} .brand-name {
        font-weight: 700;
        font-size: 16px;
        color: ${panelColor};
        letter-spacing: 0.5px;
      }
      #${PANEL_ID} .task-count-badge {
        background: ${dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'};
        border-radius: 20px;
        padding: 4px 12px;
        font-size: 12px;
        font-weight: 500;
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
        padding: 12px 20px;
        background: transparent;
        border-bottom: none;
      }
      #${PANEL_ID} button {
        cursor: pointer;
        border: none;
        border-radius: 12px;
        padding: 10px 16px;
        font-weight: 600;
        font-size: 13px;
        transition: all 0.2s ease;
      }
      #${PANEL_ID} .primary {
        background: linear-gradient(135deg, #1d9bf0 0%, #1a8cd8 100%);
        color: #fff;
        box-shadow: 0 2px 8px rgba(29, 155, 240, 0.3);
      }
      #${PANEL_ID} .primary:hover {
        background: linear-gradient(135deg, #1a8cd8 0%, #1877b2 100%);
        box-shadow: 0 4px 12px rgba(29, 155, 240, 0.4);
        transform: translateY(-1px);
      }
      #${PANEL_ID} .ghost {
        background: ${ghostBg};
        color: ${ghostColor};
        border: 1px solid ${ghostBorder};
      }
      #${PANEL_ID} .ghost:hover {
        background: ${dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)'};
        transform: translateY(-1px);
      }
      #${PANEL_ID} .muted {
        opacity: 0.6;
        pointer-events: none;
      }
      #${PANEL_ID} .action-btn {
        flex: 1;
        min-height: 40px;
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
      #${PANEL_ID} .main-controls {
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        position: relative;
      }
      #${PANEL_ID} .action-buttons {
        display: flex;
        gap: 10px;
      }
      #${PANEL_ID} .primary-btn {
        flex: 1;
        height: 40px;
        background: linear-gradient(135deg, #1d9bf0 0%, #1a8cd8 100%);
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(29, 155, 240, 0.3);
        transition: all 0.2s ease;
      }
      #${PANEL_ID} .primary-btn:hover {
        background: linear-gradient(135deg, #1a8cd8 0%, #1877b2 100%);
        box-shadow: 0 4px 12px rgba(29, 155, 240, 0.4);
        transform: translateY(-1px);
      }
      #${PANEL_ID} .primary-btn:active {
        transform: scale(0.95);
      }
      #${PANEL_ID} .primary-btn.running {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
      }
      #${PANEL_ID} .primary-btn.running:hover {
        background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
      }
      #${PANEL_ID} .primary-btn.paused {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
      }
      #${PANEL_ID} .primary-btn.paused:hover {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      }
      #${PANEL_ID} .next-btn {
        flex: 1;
        height: 40px;
        background: ${dark ? 'rgba(255, 255, 255, 0.1)' : 'white'};
        color: ${dark ? 'rgb(231, 233, 234)' : '#333'};
        border: 1px solid ${dark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 10px;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      #${PANEL_ID} .next-btn:hover {
        background: ${dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)'};
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      #${PANEL_ID} .status-bar {
        background: ${dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
        border-radius: 8px;
        padding: 6px 10px;
        text-align: center;
        font-size: 11px;
        font-weight: 500;
        color: ${muted};
        transition: all 0.3s ease;
      }
      #${PANEL_ID} .status-bar.running {
        background: ${dark ? 'rgba(29, 155, 240, 0.2)' : 'rgba(29, 155, 240, 0.1)'};
        color: #1d9bf0;
      }
      #${PANEL_ID} .status-bar.paused {
        background: ${dark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)'};
        color: #f59e0b;
      }
      #${PANEL_ID} .status-bar.error {
        background: ${dark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)'};
        color: #ef4444;
      }
      #${PANEL_ID} .task-stats {
        padding: 8px 14px;
        display: flex;
        justify-content: space-around;
        font-size: 11px;
        border-top: 1px solid ${headerBorder};
        gap: 6px;
      }
      #${PANEL_ID} .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        color: ${muted};
      }
      #${PANEL_ID} .stat-item strong {
        font-size: 14px;
        font-weight: 600;
      }
      #${PANEL_ID} .stat-item.wait strong,
      #${PANEL_ID} .stat-item.run strong {
        color: #1d9bf0;
      }
      #${PANEL_ID} .stat-item.done strong {
        color: #10b981;
      }
      #${PANEL_ID} .stat-item.fail strong {
        color: #ef4444;
      }
      #${PANEL_ID} .settings-btn {
        position: absolute;
        bottom: 12px;
        right: 12px;
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        font-size: 18px;
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 0.2s ease;
        color: ${muted};
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #${PANEL_ID} .settings-btn:hover {
        opacity: 1;
      }
      #${PANEL_ID} .emotion-selector-hidden {
        display: none;
      }
      #${PANEL_ID} .emotion-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
      }
      #${PANEL_ID} .emotion-row .emotion-indicator {
        width: 36px;
        height: 36px;
        font-size: 26px;
        cursor: pointer;
        transition: transform 0.15s ease;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #${PANEL_ID} .emotion-row .emotion-indicator:hover {
        transform: scale(1.1);
      }
      #${PANEL_ID} .emotion-row .emotion-options {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        max-width: 0;
        opacity: 0;
        transition: max-width 0.3s ease, opacity 0.2s ease;
      }
      #${PANEL_ID} .emotion-row.expanded .emotion-options {
        max-width: 300px;
        opacity: 1;
      }
      #${PANEL_ID} .emotion-row .emotion-options button {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        border: none;
        background: transparent;
        font-size: 24px;
        cursor: pointer;
        transition: all 0.15s ease;
        padding: 0;
        margin: 0;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #${PANEL_ID} .emotion-row .emotion-options button:hover {
        transform: scale(1.1);
        background: ${dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
      }
      #${PANEL_ID} .emotion-row .emotion-options button.active {
        background: rgba(29, 155, 240, 0.15);
        box-shadow: 0 0 0 2px rgba(29, 155, 240, 0.3);
      }
      #${EMOTION_LIST_ID} {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-start;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
        scrollbar-width: none;
        transition: all 0.3s ease;
      }
      #${EMOTION_LIST_ID}.emotion-selector {
        padding: 0;
        min-height: auto;
      }
      .control-buttons {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 0 0 auto;
      }
      #${EMOTION_LIST_ID} button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        padding: 0;
        margin: 0;
        background: ${ghostBg};
        border: 2px solid ${ghostBorder};
        border-radius: 12px;
        cursor: pointer;
        font-size: 24px;
        transition: all 0.2s ease;
      }
      #${EMOTION_LIST_ID} button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-color: #1d9bf0;
      }
      #${EMOTION_LIST_ID} button.emotion-current {
        width: 52px;
        height: 52px;
        font-size: 28px;
        background: linear-gradient(135deg, rgba(29, 155, 240, 0.15), rgba(29, 155, 240, 0.08));
        border: 2px solid rgba(29, 155, 240, 0.4);
        box-shadow: 0 3px 12px rgba(29, 155, 240, 0.25);
      }
      #${EMOTION_LIST_ID} button.emotion-current:hover {
        background: linear-gradient(135deg, rgba(29, 155, 240, 0.25), rgba(29, 155, 240, 0.15));
        border-color: rgba(29, 155, 240, 0.6);
        box-shadow: 0 6px 20px rgba(29, 155, 240, 0.35);
      }
      #${EMOTION_LIST_ID} button.active {
        background: linear-gradient(135deg, rgba(29, 155, 240, 0.2), rgba(29, 155, 240, 0.12));
        border-color: #1d9bf0;
        box-shadow: 0 0 16px rgba(29, 155, 240, 0.5);
      }
      #${EMOTION_LIST_ID} button.active::after {
        content: '';
        position: absolute;
        right: 4px;
        bottom: 4px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #1d9bf0;
        box-shadow: 0 0 6px rgba(29, 155, 240, 0.8);
      }
      .navigation-info {
        text-align: center;
        font-size: 12px;
        color: ${muted};
        font-weight: 500;
        letter-spacing: 0.3px;
        border-bottom: 1px solid ${actionsBorder};
      }
      .xcomment-post-highlight {
        outline: 2px solid rgba(29, 155, 240, 0.4) !important;
        outline-offset: 2px;
        transition: outline 0.3s ease;
        animation: highlightPulse 2s ease-in-out;
      }
      @keyframes highlightPulse {
        0%, 100% { outline-color: rgba(29, 155, 240, 0.4); }
        50% { outline-color: rgba(29, 155, 240, 0.6); }
        background: #1c9f4d;
        box-shadow: 0 0 0 2px ${emoActiveBoxShadow};
      }
      .config-notice {
        display: none;
        padding: 12px 14px;
        background: ${dark ? 'linear-gradient(135deg, #4a3c1a 0%, #5a4a2a 100%)' : 'linear-gradient(135deg, #fff3cd 0%, #fff9e6 100%)'};
        border-bottom: 1px solid ${dark ? '#8a7a4a' : '#ffc107'};
        box-shadow: ${dark ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 8px rgba(255, 193, 7, 0.15)'};
      }
      .config-notice.show {
        display: block;
        animation: slideDown 0.3s ease-out;
      }
      .notice-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        color: ${dark ? '#ffd54f' : '#856404'};
      }
      .notice-icon {
        font-size: 18px;
        line-height: 1;
      }
      .notice-header strong {
        font-weight: 600;
        font-size: 13px;
      }
      .notice-text {
        font-size: 12px;
        color: ${dark ? '#ffca28' : '#856404'};
        opacity: 0.95;
        margin-bottom: 10px;
        line-height: 1.4;
      }
      .notice-btn {
        width: 100%;
        padding: 8px 12px;
        background: ${dark ? '#ffa726' : '#ffc107'};
        color: #000;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
      }
      .notice-btn:hover {
        background: ${dark ? '#ff9800' : '#ffb300'};
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(255, 193, 7, 0.4);
      }
      .notice-btn:active {
        transform: translateY(0);
      }
      @keyframes slideDown {
        from {
          opacity: 0;
          max-height: 0;
          padding-top: 0;
          padding-bottom: 0;
        }
        to {
          opacity: 1;
          max-height: 200px;
          padding-top: 12px;
          padding-bottom: 14px;
        }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-8px); }
        50% { transform: translateX(0); }
        75% { transform: translateX(8px); }
      }
      
      /* ✨ 帖子潜力状态标记 - 紧凑版 */
      .xcomment-potential-badge {
        position: absolute !important;
        top: 4px !important;
        right: 4px !important;
        z-index: 9999 !important;
        display: inline-flex !important;
        align-items: center;
        gap: 3px;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 600;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
        transition: all 0.2s ease;
        white-space: nowrap;
        pointer-events: auto;
        cursor: help;
        opacity: 0.85;
      }
      
      .xcomment-potential-badge:hover {
        opacity: 1;
        transform: scale(1.05);
      }
      
      /* 潜力等级样式 - 更柔和 */
      .xcomment-potential-badge.high {
        background: rgba(16, 185, 129, 0.9);
        color: white;
      }
      
      .xcomment-potential-badge.medium {
        background: rgba(59, 130, 246, 0.9);
        color: white;
      }
      
      .xcomment-potential-badge.low {
        background: rgba(149, 165, 166, 0.85);
        color: white;
      }
      
      .xcomment-potential-badge.skip {
        background: rgba(239, 68, 68, 0.85);
        color: white;
      }
      
      /* 状态指示器 - 更小 */
      .xcomment-potential-badge .status-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.8;
      }
      
      .xcomment-potential-badge.generating .status-dot {
        animation: pulse-dot 1.5s ease-in-out infinite;
      }
      
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
      }
      
      /* 确保article元素有相对定位 */
      article[data-testid="tweet"] {
        position: relative;
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
      <header class="panel-header">
        <div class="brand">
          <img src="${TOGGLE_ICON_URL}" class="brand-icon" alt="XBooster">
          <span class="brand-name">XBooster</span>
        </div>
        <div class="task-count-badge" id="xcomment-batch-counter">0 Tasks</div>
      </header>
      <div id="xcomment-config-notice" class="config-notice">
        <div class="notice-header">
          <span class="notice-icon">⚠️</span>
          <strong>检测到 AI 接口尚未配置</strong>
        </div>
        <div class="notice-text">
          请先在设置页面配置 API Key，才能使用批量回复功能
        </div>
        <button id="xcomment-open-settings" class="notice-btn">
          ⚙️ 前往设置
        </button>
      </div>
      <div class="main-controls">
        <div class="emotion-row" id="xcomment-emotion-row">
          <div class="emotion-indicator" id="xcomment-emotion-indicator">😊</div>
          <div class="emotion-options" id="xcomment-emotion-options"></div>
        </div>
        <div class="action-buttons">
          <button id="xcomment-nav-play" class="primary-btn" title="Start/Stop (Space or K)">
            <span class="btn-icon">▶</span>
            <span class="btn-text">Start</span>
          </button>
          <button id="xcomment-nav-next" class="next-btn" title="Next (→ or L)">
            <span class="btn-icon">↓</span>
            <span class="btn-text">Next</span>
          </button>
        </div>
        <div class="status-bar" id="xcomment-status-bar">
          <span class="status-text">Ready</span>
        </div>
      </div>
      <div class="task-stats" id="xcomment-task-stats">
        <span class="stat-item wait">WAIT: <strong>0</strong></span>
        <span class="stat-item run">RUN: <strong>0</strong></span>
        <span class="stat-item done">DONE: <strong>0</strong></span>
        <span class="stat-item fail">FAIL: <strong>0</strong></span>
      </div>
      <button class="settings-btn" id="xcomment-settings-btn" title="设置">⚙️</button>
      <div id="${EMOTION_LIST_ID}" class="emotion-selector-hidden"></div>
    `;
    document.body.appendChild(panel);

    const toggle = document.createElement('button');
    toggle.id = PANEL_TOGGLE_ID;
    toggle.textContent = '';
    toggle.style.backgroundImage = `url(${TOGGLE_ICON_URL})`;
    toggle.title = '控制台';
    // click事件现在在enableToggleDrag中处理，以支持拖拽和折叠联动
    document.body.appendChild(toggle);

    // 上方的开始/停止按钮已删除，使用导航区域的按钮

    // ✨ 设置按钮事件监听
    const settingsBtn = panel.querySelector('#xcomment-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openSettings' }).catch(() => { });
      });
    }

    // 配置提示的"前往设置"按钮
    const openSettingsBtn = panel.querySelector('#xcomment-open-settings');
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openSettings' }).catch(() => { });
      });
    }

    // ========== 导航功能事件监听 ==========
    const navNextBtn = panel.querySelector('#xcomment-nav-next');
    const navPlayBtn = panel.querySelector('#xcomment-nav-play');

    if (navNextBtn) {
      navNextBtn.addEventListener('click', () => navigateToNearest());
    }
    if (navPlayBtn) {
      // 导航区域的开始/暂停按钮用于开始/停止生成
      navPlayBtn.addEventListener('click', () => {
        if (running) {
          stopBatch();
        } else {
          startBatch();
        }
      });
    }

    // 初始化导航功能（延迟执行，确保所有函数已定义）
    setTimeout(() => {
      if (typeof initNavigation === 'function') {
        initNavigation().catch(() => { });
      }
    }, 500);
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
    const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/; // 平假名+片假名
    const koreanPattern = /[\uac00-\ud7a3]/; // 韩文字符
    const chinesePattern = /[\u4e00-\u9fa5]/; // 汉字（中日韩共用）

    // 优先检测日语（因为日语必定包含假名）
    if (japanesePattern.test(text)) return '日语';
    // 其次检测韩语
    if (koreanPattern.test(text)) return '韩语';
    // 最后检测中文（纯汉字）
    if (chinesePattern.test(text)) return '中文';
    // 默认英语
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

  // 提取帖子类型（文本/图片/视频/链接/投票等）
  function extractPostType(article) {
    if (!article) return 'text';

    const content = extractContent(article);

    // 优先级1：检测特殊场景类型（基于内容关键词）
    // 检测互关/任务/增长类帖子
    const taskGrowthKeywords = [
      'follow', 'フォロー', '关注', '互关', 'f4f', 'follow back',
      '回复.*follow', '评论.*关注', 'comment.*follow',
      '点赞.*互关', 'like.*follow', 'rt.*follow'
    ];
    const isTaskGrowth = taskGrowthKeywords.some(kw => {
      const regex = new RegExp(kw, 'i');
      return regex.test(content);
    });
    if (isTaskGrowth) {
      return 'task_growth';
    }

    // 检测敏感话题（政治/军事/争议/讽刺）
    const sensitiveKeywords = [
      // 基础政治词汇
      '政治', '政府', '选举', '党', 'politics', 'government', 'election',
      '军事', '战争', 'military', 'war', '武器', 'weapon',
      '宗教', 'religion', '种族', 'race', 'racism',
      // 经济政治指标
      'GDP', 'gdp', '统计局', '统计数据', '官方数据', '数据造假',
      // 讽刺性称呼
      '圣上', '小胖', '大大', '领导层', '上面的',
      // 体制话题
      '体制', '制度', '审查', 'censorship', '言论'
    ];
    const isSensitive = sensitiveKeywords.some(kw => {
      const regex = new RegExp(kw, 'i');
      return regex.test(content);
    });
    if (isSensitive) {
      return 'sensitive';
    }

    // 优先级2：检测媒体类型
    const types = [];

    // 检测投票
    const poll = article.querySelector('[data-testid="cardPoll"]') ||
      article.querySelector('[role="group"][aria-label*="投票"]') ||
      article.querySelector('[role="group"][aria-label*="Poll"]');
    if (poll) {
      types.push('poll');
    }

    // 检测视频（优先级高于图片，因为视频封面也可能被识别为图片）
    const video = article.querySelector('video') ||
      article.querySelector('[data-testid="videoPlayer"]') ||
      article.querySelector('[data-testid="videoComponent"]');
    if (video) {
      types.push('video');
    }

    // 检测图片（排除视频封面）
    let hasImage = false;
    let imageCount = 0;
    if (!video) {
      const images = article.querySelectorAll('img[alt][src*="media"]');
      const mediaImages = Array.from(images).filter(img => {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || '';
        // 排除头像、表情等小图标
        return src.includes('media') && !src.includes('profile') && alt.length > 0;
      });
      imageCount = mediaImages.length;
      hasImage = imageCount > 0;
      if (hasImage) {
        types.push('image');
      }
    }

    // 检测外部链接卡片
    const linkCard = article.querySelector('[data-testid="card.wrapper"]') ||
      article.querySelector('[data-testid="card.layoutLarge"]') ||
      article.querySelector('[data-testid="card.layoutSmall"]');
    if (linkCard) {
      types.push('link');
    }

    // 检测引用推文
    const quoteTweet = article.querySelector('[data-testid="tweet"]', article) !== article;
    if (quoteTweet) {
      types.push('quote');
    }

    // 优先级3：检测内容主题（基于关键词）
    // 偶像/娱乐相关
    const idolKeywords = [
      'アイドル', 'idol', '偶像', 'チェキ', 'ライブ', 'live', 'concert',
      'ツアー', 'tour', '握手会', 'ファンミ', 'fan meeting'
    ];
    const isIdol = idolKeywords.some(kw => {
      const regex = new RegExp(kw, 'i');
      return regex.test(content);
    });

    // 产品/商品相关
    const productKeywords = [
      '新品', '発売', 'release', '购入', '購入', 'bought', 'pre-order', '予約',
      '商品', '製品', 'product', '価格', 'price', '定価', '欲しい', 'want'
    ];
    const isProduct = productKeywords.some(kw => {
      const regex = new RegExp(kw, 'i');
      return regex.test(content);
    });

    // 优先级4：构建最终类型标签
    // 如果是视频或图片，且内容涉及偶像/产品，添加语义标签
    if (hasImage || video) {
      if (isIdol) {
        types.push('idol');
      }
      if (isProduct) {
        types.push('product');
      }
      // 添加通用视觉标签
      types.push('visual');
    }

    // 如果没有任何类型，返回"text"
    if (types.length === 0) {
      return 'text';
    }

    // 返回类型组合（例如："video+product+visual"）
    return types.join('+');
  }

  function findArticleByTweetId(tweetId) {
    if (!tweetId) return null;
    const link = document.querySelector(`a[href*="/status/${tweetId}"]`);
    if (link) {
      return link.closest('article[data-testid="tweet"]') || link.closest('article');
    }
    return null;
  }

  // ✅ 性能优化：释放任务的 DOM 引用，防止内存泄漏
  function releaseTaskDomRef(task) {
    if (!task) return;
    // 释放 article 引用，但保留 tweetId 以便需要时重新查找
    task.article = null;
  }

  // ✅ 性能优化：获取任务的 article 元素（优先使用缓存，否则重新查找）
  function getTaskArticle(task) {
    if (!task) return null;
    // 如果已有有效的 article 引用，直接返回
    if (task.article && task.article.isConnected) {
      return task.article;
    }
    // 否则尝试通过 tweetId 重新查找
    if (task.tweetId) {
      const article = findArticleByTweetId(task.tweetId);
      if (article) {
        task.article = article; // 临时缓存
        return article;
      }
    }
    return null;
  }

  // ========== 导航功能实现 ==========

  // 检查页面是否正在滚动
  function isScrolling() {
    return window._lastScrollTop !== undefined &&
      Math.abs(window.scrollY - (window._lastScrollTop || 0)) > 5;
  }

  // 等待滚动停止
  async function waitForScrollStop(timeout = 2000) {
    return new Promise((resolve) => {
      let lastScrollY = window.scrollY;
      let scrollTimeout;

      const checkScroll = () => {
        const currentScrollY = window.scrollY;
        if (Math.abs(currentScrollY - lastScrollY) < 2) {
          clearTimeout(scrollTimeout);
          resolve();
        } else {
          lastScrollY = currentScrollY;
          scrollTimeout = setTimeout(checkScroll, 100);
        }
      };

      scrollTimeout = setTimeout(() => {
        resolve(); // 超时也继续
      }, timeout);

      checkScroll();
    });
  }

  // 线性滚动指定距离（平滑匀速）
  async function progressiveScrollByDistance(distance) {
    const absDistance = Math.abs(distance);
    const direction = Math.sign(distance);

    // 使用requestAnimationFrame实现平滑线性滚动
    const startScrollY = window.scrollY;
    const targetScrollY = startScrollY + distance;
    const startTime = performance.now();
    const duration = Math.min(800, Math.max(300, absDistance * 0.5)); // 根据距离动态调整时长，更线性

    return new Promise((resolve) => {
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 线性插值（完全线性，无缓动）
        const currentScrollY = startScrollY + distance * progress;
        window.scrollTo(0, currentScrollY);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // 滚动完成
          setTimeout(() => resolve(), 100);
        }
      };
      requestAnimationFrame(animate);
    });
  }

  // 渐进式滚动到目标元素（保守安全版本）
  async function progressiveScrollToElement(element) {
    if (!element) return false;

    // 1. 滚动前检查
    // 如果页面正在滚动，等待完成
    if (isScrolling()) {
      await waitForScrollStop();
      await sleep(100);
    }

    // 2. 滚动前短暂延迟（减少卡顿感）
    await sleep(50); // 固定50ms延迟，减少卡顿

    // 3. 计算目标位置
    const targetRect = element.getBoundingClientRect();
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;

    // 目标位置：元素顶部对齐到视口上方1/3处（更自然的位置）
    const targetTop = currentScrollY + targetRect.top;
    const viewportTopThird = currentScrollY + viewportHeight * 0.33;
    const distance = targetTop - viewportTopThird;

    // 4. 如果距离很小（< 50px），使用小幅微调
    if (Math.abs(distance) < 50) {
      window.scrollBy({ top: distance, behavior: 'smooth' });
      await sleep(200);
      return true;
    }

    // 5. 安全限制：单次滚动不超过 3 个屏幕高度
    const MAX_SCROLL_DISTANCE = viewportHeight * 3;
    if (Math.abs(distance) > MAX_SCROLL_DISTANCE) {
      // 距离太远，分多次导航（先滚动一部分）
      const partialDistance = Math.sign(distance) * MAX_SCROLL_DISTANCE * 0.8;
      await progressiveScrollByDistance(partialDistance);
      // 等待后再继续（让用户有机会看到内容）
      await sleep(normalRandom(3000, 1000));
      // 递归继续滚动剩余距离
      return await progressiveScrollToElement(element);
    }

    // 6. 渐进式滚动（分多步）
    return await progressiveScrollByDistance(distance);
  }

  // 高亮帖子
  function highlightPost(article) {
    if (!article) return;

    // 清除之前的高亮
    const prevHighlight = document.querySelector('.xcomment-post-highlight');
    if (prevHighlight) {
      prevHighlight.classList.remove('xcomment-post-highlight');
    }

    // 添加高亮
    article.classList.add('xcomment-post-highlight');

    // 2-3秒后自动移除
    if (highlightTimeout) clearTimeout(highlightTimeout);
    highlightTimeout = setTimeout(() => {
      article.classList.remove('xcomment-post-highlight');
    }, 2500);
  }

  // 显示临时提示（Toast）
  let toastTimeout = null;
  function showToast(message) {
    // 移除旧的toast
    const oldToast = document.querySelector('.xcomment-toast');
    if (oldToast) {
      oldToast.remove();
    }
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }

    // 创建新的toast
    const toast = document.createElement('div');
    toast.className = 'xcomment-toast';
    toast.textContent = message;
    
    // 样式
    const dark = document.documentElement.classList.contains('dark') ||
      document.body.style.backgroundColor === 'rgb(0, 0, 0)';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '100px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: dark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.85)',
      color: dark ? '#000' : '#fff',
      padding: '10px 20px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '500',
      zIndex: '2147483647',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      opacity: '0',
      transition: 'opacity 0.3s ease'
    });

    document.body.appendChild(toast);

    // 动画显示
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    // 3秒后消失
    toastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // 检查帖子是否有已生成但未填入的回复卡片
  function hasUnfilledCard(article) {
    if (!article) return false;

    // 检查是否有回复卡片（已生成）
    const cards = article.querySelectorAll(`.${CARD_CLASS}`);
    if (cards.length === 0) return false; // 没有卡片，说明未生成

    // 检查是否有未使用的卡片（未填入）
    for (const card of cards) {
      // 如果卡片没有 used 类，说明未填入
      if (!card.classList.contains('used')) {
        return true; // 有未填入的卡片，这是我们要找的
      }
    }

    // 所有卡片都已使用，说明已全部填入
    return false;
  }

  // 获取已生成但未填入的帖子列表（按页面顺序，从上到下）
  function getUnfilledPosts() {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    const unfilledPosts = [];

    articles.forEach((article, index) => {
      // 检查是否有已生成但未填入的回复卡片
      if (hasUnfilledCard(article)) {
        // 提取帖子信息
        const tweetId = extractTweetId(article);
        const authorHandle = extractHandle(article);
        const content = extractContent(article);

        if (tweetId) {
          unfilledPosts.push({
            tweetId: tweetId,
            authorHandle: authorHandle || '',
            content: content || '',
            article: article,
            pageIndex: index // 页面中的原始索引，用于判断方向
          });
        }
      }
    });

    return unfilledPosts; // 按页面顺序返回（从上到下，index小的在上方）
  }

  // 更新导航UI
  function updateNavigationUI() {
    const navArea = document.getElementById('xcomment-navigation-area');
    const navNextBtn = document.getElementById('xcomment-nav-next');
    const navPlayBtn = document.getElementById('xcomment-nav-play');

    if (!navArea) return;

    const posts = navigationState.completedPosts;
    const total = posts.length;

    // 始终显示导航区域
    navArea.style.display = 'block';

    if (total === 0) {
      if (navNextBtn) navNextBtn.disabled = true;
      if (navPlayBtn) navPlayBtn.disabled = true;
      return;
    }

    // 启用按钮
    if (navPlayBtn) navPlayBtn.disabled = false;
    if (navNextBtn) navNextBtn.disabled = false;
  }

  // 找到页面上第一条未填入的"填入输入框"按钮（从上到下）
  function findFirstFillButton() {
    // 获取所有未使用的"填入输入框"按钮
    const allFillButtons = Array.from(document.querySelectorAll(`.${CARD_CLASS}:not(.used) button[data-action="fill"]`));

    if (allFillButtons.length === 0) {
      return null;
    }

    // 按页面位置排序（从上到下）
    allFillButtons.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top;
    });

    // 返回第一个（最上面的）
    return allFillButtons[0];
  }

  // 找到下一篇帖子的第一个"填入输入框"按钮
  // 逻辑：跳过当前文章，定位到下一篇文章的第一个填入按钮
  function findNextPostFirstFillButton() {
    // 获取所有有未填入卡片的文章，按页面位置排序
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    
    // 筛选出有未填入卡片的文章
    const articlesWithUnfilledCards = articles.filter(article => hasUnfilledCard(article));
    
    if (articlesWithUnfilledCards.length === 0) {
      return { button: null, article: null };
    }

    // 按页面位置排序（从上到下）
    articlesWithUnfilledCards.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top;
    });

    // 如果有当前文章，找到它的位置，然后定位到下一篇
    let targetArticle = null;
    
    if (navigationState.currentArticle && document.contains(navigationState.currentArticle)) {
      // 当前文章还在DOM中
      const currentRect = navigationState.currentArticle.getBoundingClientRect();
      
      // 找到位于当前文章之后的第一篇有未填入卡片的文章
      // 判断标准：文章顶部位置在当前文章顶部之下超过100px（确保是不同的文章）
      for (const article of articlesWithUnfilledCards) {
        const articleRect = article.getBoundingClientRect();
        // 跳过当前文章（同一篇）和在当前文章上方的文章
        if (article === navigationState.currentArticle) {
          continue;
        }
        // 找到下一篇：位置在当前文章下方，或者是不同的文章
        if (articleRect.top > currentRect.top + 100) {
          targetArticle = article;
          break;
        }
      }
      
      // 如果没找到下一篇，说明当前文章是最后一篇，从头开始（循环）
      if (!targetArticle) {
        targetArticle = articlesWithUnfilledCards[0];
      }
    } else {
      // 没有当前文章，或当前文章已不在DOM中，取第一篇
      targetArticle = articlesWithUnfilledCards[0];
    }

    if (!targetArticle) {
      return { button: null, article: null };
    }

    // 在目标文章中找到第一个未填入的按钮
    const fillButtons = Array.from(targetArticle.querySelectorAll(`.${CARD_CLASS}:not(.used) button[data-action="fill"]`));
    
    if (fillButtons.length === 0) {
      return { button: null, article: null };
    }

    // 按位置排序，取第一个
    fillButtons.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top;
    });

    return { button: fillButtons[0], article: targetArticle };
  }

  // 定位到下一篇帖子的第一个"填入输入框"按钮
  async function navigateToNearest() {
    // 检查导航间隔
    const now = Date.now();
    if (now - navigationState.lastNavigationTime < navigationState.minNavigationInterval) {
      return false;
    }
    navigationState.lastNavigationTime = now;

    // 先刷新列表（确保获取最新的未填入帖子）
    refreshNavigationPosts();

    // 找到下一篇帖子的第一个"填入输入框"按钮
    const { button: nextButton, article: nextArticle } = findNextPostFirstFillButton();

    if (!nextButton) {
      // 没有找到未填入的帖子，显示提示
      showToast('No unfilled posts. Scroll down.\n暂无待填入帖子，请向下滚动加载更多');
      navigationState.currentArticle = null;
      updateNavigationUI();
      return false;
    }

    // 更新当前文章状态
    navigationState.currentArticle = nextArticle;

    // 流畅滚动到按钮位置
    const success = await smoothScrollToElement(nextButton);
    if (success) {
      // 高亮目标文章
      if (nextArticle) {
        highlightPost(nextArticle);
      }
      updateNavigationUI();
    }

    return success;
  }

  // 流畅滚动到元素（安全但流畅的滚动）
  async function smoothScrollToElement(element) {
    if (!element) return false;

    // 等待页面稳定（如果正在滚动）
    if (isScrolling()) {
      await waitForScrollStop();
      await sleep(50); // 短暂等待
    }

    // 计算目标位置
    const targetRect = element.getBoundingClientRect();
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;

    // 目标位置：元素顶部对齐到视口上方1/4处（更容易看到完整内容）
    const targetTop = currentScrollY + targetRect.top;
    const viewportTarget = currentScrollY + viewportHeight * 0.25;
    const distance = targetTop - viewportTarget;

    // 如果距离很小，直接返回
    if (Math.abs(distance) < 50) {
      return true;
    }

    // 使用原生 smooth scroll，更流畅
    // 分2步：主滚动 + 微调，减少卡顿感
    const mainDistance = distance * 0.92; // 主滚动完成92%
    
    window.scrollBy({
      top: mainDistance,
      behavior: 'smooth'
    });

    // 等待主滚动完成（根据距离估算时间，smooth scroll 大约 300-500ms）
    const scrollDuration = Math.min(400, Math.max(150, Math.abs(distance) / 3));
    await sleep(scrollDuration);

    // 微调确保精确定位
    const finalRect = element.getBoundingClientRect();
    const finalAdjust = finalRect.top - viewportHeight * 0.25;
    if (Math.abs(finalAdjust) > 30) {
      window.scrollBy({
        top: finalAdjust,
        behavior: 'smooth'
      });
      await sleep(100);
    }

    return true;
  }

  // 拟人化滚动到元素（模拟人类滚动行为）- 保留用于其他场景
  async function humanizedScrollToElement(element) {
    if (!element) return false;

    // 等待页面稳定
    if (isScrolling()) {
      await waitForScrollStop();
      await sleep(normalRandom(100, 30));
    }

    // 计算目标位置
    const targetRect = element.getBoundingClientRect();
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;

    // 目标位置：元素顶部对齐到视口上方1/3处
    const targetTop = currentScrollY + targetRect.top;
    const viewportTopThird = currentScrollY + viewportHeight * 0.33;
    const distance = targetTop - viewportTopThird;

    // 如果距离很小，直接返回
    if (Math.abs(distance) < 30) {
      return true;
    }

    // 拟人化滚动：分多步，每步有随机延迟
    const steps = Math.max(3, Math.min(8, Math.ceil(Math.abs(distance) / 300)));
    const baseStep = distance / steps;

    for (let i = 0; i < steps; i++) {
      // 每步距离有轻微随机波动
      const stepDistance = baseStep * (0.9 + Math.random() * 0.2);
      
      window.scrollBy({
        top: stepDistance,
        behavior: 'smooth'
      });

      // 拟人化延迟（每步之间有随机间隔）
      const delay = normalRandom(80, 20);
      await sleep(delay);
    }

    // 最后微调确保精确定位
    await sleep(normalRandom(50, 15));
    const finalRect = element.getBoundingClientRect();
    const finalAdjust = finalRect.top - viewportHeight * 0.33;
    if (Math.abs(finalAdjust) > 20) {
      window.scrollBy({
        top: finalAdjust,
        behavior: 'smooth'
      });
    }

    return true;
  }

  // 滚动到页面底部（触发X时间线刷新）
  async function scrollToBottom() {
    const startScrollY = window.scrollY;
    const documentHeight = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    const viewportHeight = window.innerHeight;
    const targetScrollY = documentHeight - viewportHeight;
    const distance = targetScrollY - startScrollY;

    if (distance > 0) {
      // 使用线性滚动到底部
      await progressiveScrollByDistance(distance);
      // 等待一下，让X有时间加载新内容
      await sleep(500);
      // ✨ 滚动到底部后，静默强制刷新徽章
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      articles.forEach(article => {
        article.dataset.xcommentBadgeMarked = '';
        const badge = article.querySelector('.xcomment-potential-badge');
        if (badge) badge.remove();
      });
      await autoMarkArticles();
    }
  }

  // 用户滚动检测已移除（自动播放功能已移除）

  // 自动播放功能已移除，按钮现在用于控制生成

  // 初始化导航功能
  async function initNavigation() {
    // 刷新未填入帖子列表
    refreshNavigationPosts();

    // 设置快捷键
    setupKeyboardShortcuts();

    // 初始化按钮状态（确保显示正确）
    setButtonsState({ startDisabled: false, stopDisabled: true });
  }

  // 刷新导航帖子列表（获取未填入的帖子）
  function refreshNavigationPosts() {
    navigationState.completedPosts = getUnfilledPosts();
    updateNavigationUI();
  }

  // 设置快捷键
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // 检查是否在 X 页面
      if (!window.location.hostname.includes('x.com')) return;

      // 检查是否在输入框中
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      )) {
        return; // 输入时禁用快捷键
      }

      // 检查控制台是否可见
      const panel = document.getElementById(PANEL_ID);
      if (!panel || panel.style.display === 'none') return;

      // 检查导航区域是否可见
      const navArea = document.getElementById('xcomment-navigation-area');
      if (!navArea || navArea.style.display === 'none') return;

      // 处理快捷键
      switch (e.key) {
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          navigateToNearest();
          break;
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          // 空格/K键用于开始/停止生成
          if (running) {
            stopBatch();
          } else {
            startBatch();
          }
          break;
        case 'Escape':
          e.preventDefault();
          const prevHighlight = document.querySelector('.xcomment-post-highlight');
          if (prevHighlight) {
            prevHighlight.classList.remove('xcomment-post-highlight');
          }
          break;
      }
    });
  }

  // ✅ 性能优化：清理已完成的任务，释放内存
  const MAX_COMPLETED_TASKS = 50; // 保留最近50个已完成任务供查看
  const MAX_KNOWN_IDS = 200; // 限制 knownTaskIds 的大小
  const MAX_COMPLETED_IDS = 500; // 限制 completedIds 的大小

  function cleanupCompletedTasks() {
    // 分离已完成和未完成的任务
    const completedTasks = tasks.filter(t => t.status === 'done' || t.status === 'accepted' || t.status === 'error');
    const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'accepted' && t.status !== 'error');

    // 如果已完成任务超过限制，移除最旧的
    if (completedTasks.length > MAX_COMPLETED_TASKS) {
      const tasksToRemove = completedTasks.slice(0, completedTasks.length - MAX_COMPLETED_TASKS);
      tasksToRemove.forEach(task => {
        // 从 taskElements 中移除对应的 DOM 元素（状态列表中的行）
        const row = taskElements.get(task.id);
        if (row && row.parentElement) {
          row.remove();
        }
        taskElements.delete(task.id);

        // ✅ 性能优化：清理任务关联的内联卡片
        // 卡片可能已随推文一起被 X 移除，但我们仍尝试清理
        if (task.tweetId) {
          const cards = document.querySelectorAll(`.${CARD_CLASS}[data-task-id="${task.id}"]`);
          cards.forEach(card => {
            if (card.parentElement) {
              card.remove();
            }
          });
        }

        // 确保释放 DOM 引用
        releaseTaskDomRef(task);
      });
      // 只保留最近的已完成任务
      tasks = [...activeTasks, ...completedTasks.slice(completedTasks.length - MAX_COMPLETED_TASKS)];
    }

    // 清理 knownTaskIds（保留当前任务的 ID）
    if (knownTaskIds.size > MAX_KNOWN_IDS) {
      const currentTaskIds = new Set(tasks.map(t => t.id));
      const idsToKeep = new Set();
      // 优先保留当前任务的 ID
      currentTaskIds.forEach(id => idsToKeep.add(id));
      // 如果还有空间，保留一些其他 ID
      knownTaskIds.forEach(id => {
        if (idsToKeep.size < MAX_KNOWN_IDS) {
          idsToKeep.add(id);
        }
      });
      knownTaskIds = idsToKeep;
    }

    // 清理 completedIds（保留最近的）
    if (completedIds.size > MAX_COMPLETED_IDS) {
      const idsArray = Array.from(completedIds);
      completedIds = new Set(idsArray.slice(idsArray.length - MAX_COMPLETED_IDS));
      // 异步保存到 storage
      chrome.storage.local.set({
        [COMPLETED_KEY]: { date: todayKey(), ids: Array.from(completedIds) }
      }).catch(() => { });
    }

    // ✅ 性能优化：额外清理页面上孤立的旧卡片（不属于任何当前任务的卡片）
    const currentTaskIdSet = new Set(tasks.map(t => t.id));
    const allCards = document.querySelectorAll(`.${CARD_CLASS}[data-task-id]`);
    allCards.forEach(card => {
      const cardTaskId = card.dataset.taskId;
      if (cardTaskId && !currentTaskIdSet.has(cardTaskId)) {
        // 这个卡片的任务已被清理，移除卡片
        card.remove();
      }
    });
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

  // ✅ v3.0新增：提取浏览量（Views/Impressions）
  function extractViewCount(article) {
    // ✅ 策略：X平台的统计按钮顺序固定：回复、转发、点赞、浏览量
    // 浏览量通常是第4个按钮，包含数字但没有其他明确标识

    // 方法1: 通过aria-label精确定位Views按钮
    const viewsButton = article.querySelector('a[href*="/analytics"]') ||
      article.querySelector('a[aria-label*="view" i]') ||
      article.querySelector('a[aria-label*="查看" i]') ||
      article.querySelector('[data-testid="app-text-transition-container"]:has(svg)');

    if (viewsButton) {
      const text = viewsButton.textContent || viewsButton.innerText || '';
      logger.debug(`找到Views按钮, 文本="${text}"`);

      // 提取数字（忽略其他文本）
      const match = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMm万wW])?/);
      if (match) {
        let num = parseFloat(match[1].replace(',', ''));
        const unit = match[2];
        logger.debug(`提取浏览量: 数字=${num}, 单位="${unit}"`);

        if (unit && (unit === 'K' || unit === 'k')) {
          num *= 1000;
        } else if (unit && (unit === '万' || unit === 'w' || unit === 'W')) {
          num *= 10000;
        } else if (unit && (unit === 'M' || unit === 'm')) {
          num *= 1000000;
        }

        const finalNum = Math.floor(num);
        logger.debug(`最终浏览量: ${finalNum}`);

        // 🚨 过滤异常值：浏览量不可能超过10亿
        if (finalNum > 1000000000) {
          logger.debug(`浏览量异常 (${finalNum})，可能提取错误`);
          return null;
        }

        return finalNum;
      }
    }


    // 方法2: 精确查找统计区域的第4个按钮（浏览量）
    // X平台结构：底部统计区域包含 回复、转发、点赞、浏览量
    const statsGroup = article.querySelector('[role="group"]');
    if (statsGroup) {
      // 找到所有包含数字的链接/按钮
      const allButtons = Array.from(statsGroup.querySelectorAll('a, button, div[role="button"]'));
      const buttonInfo = [];

      allButtons.forEach((btn, idx) => {
        const text = (btn.textContent || '').trim();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const numMatch = text.match(/^\s*(\d+(?:[.,]\d+)?)\s*([KkMm万wW])?\s*$/);

        if (numMatch || ariaLabel) {
          buttonInfo.push({
            index: idx,
            element: btn,
            text: text,
            ariaLabel: ariaLabel,
            hasNumber: !!numMatch,
            number: numMatch ? parseFloat(numMatch[1].replace(',', '')) : null,
            unit: numMatch ? numMatch[2] : null
          });
        }
      });

      logger.debug(`统计区域信息:`, buttonInfo.map(b => ({
        idx: b.index,
        text: b.text,
        aria: b.ariaLabel.slice(0, 30),
        num: b.number
      })));

      // 识别浏览量：不是回复/点赞/转发的最后一个数字按钮
      for (let i = buttonInfo.length - 1; i >= 0; i--) {
        const info = buttonInfo[i];

        // 跳过明确的交互按钮
        if (info.ariaLabel.includes('repl') || info.ariaLabel.includes('like') ||
          info.ariaLabel.includes('repost') || info.ariaLabel.includes('回复') ||
          info.ariaLabel.includes('喜欢') || info.ariaLabel.includes('转发') ||
          info.ariaLabel.includes('share') || info.ariaLabel.includes('分享') ||
          info.ariaLabel.includes('bookmark') || info.ariaLabel.includes('书签')) {
          continue;
        }

        if (info.hasNumber && info.number !== null) {
          let num = info.number;

          // 应用单位转换
          if (info.unit) {
            if (info.unit === 'K' || info.unit === 'k') num *= 1000;
            else if (info.unit === '万' || info.unit === 'w' || info.unit === 'W') num *= 10000;
            else if (info.unit === 'M' || info.unit === 'm') num *= 1000000;
          }

          // 过滤异常值
          if (num > 0 && num < 1000000000) {
            logger.debug(`✅ 通过位置识别浏览量: ${Math.floor(num)} (按钮${info.index})`);
            return Math.floor(num);
          }
        }
      }
    }

    // 方法3: 最保守方案 - 查找包含"views"文本的元素
    const viewTextElements = article.querySelectorAll('span, a, div');
    for (const el of viewTextElements) {
      const text = (el.textContent || '').trim();
      const lowerText = text.toLowerCase();

      // 必须包含view关键词且有数字
      if ((lowerText.includes('view') || lowerText.includes('查看')) && /\d/.test(text)) {
        const match = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMm万wW])?/);
        if (match) {
          let num = parseFloat(match[1].replace(',', ''));
          const unit = match[2];

          if (unit) {
            if (unit === 'K' || unit === 'k') num *= 1000;
            else if (unit === '万' || unit === 'w' || unit === 'W') num *= 10000;
            else if (unit === 'M' || unit === 'm') num *= 1000000;
          }

          if (num > 0 && num < 1000000000) {
            logger.debug(`通过文本匹配找到浏览量: ${Math.floor(num)}`);
            return Math.floor(num);
          }
        }
      }
    }

    // 提取失败，返回null（会在autoMarkArticles中使用默认值）
    // ✅ v1.0.5：降级为 debug（这是预期行为，不是真正的警告）
    const tweetText = article.querySelector('[data-testid="tweetText"]');
    const contentPreview = tweetText ? tweetText.textContent.slice(0, 30) : '未知内容';
    logger.debug(`无法提取浏览量 - "${contentPreview}..."`);
    return null;
  }

  // ✅ v3.0新增：内容倾向加分（0-10分）
  function calculateContentBonus(content, article) {
    if (!content) return 0;

    let bonus = 0;
    const lowerContent = content.toLowerCase();

    // 1. 明显问句 / 征集 / 求建议（+6~10）
    const questionKeywords = [
      '?', '？', '求', '请问', '你们怎么看', '谁有', '名单', '推荐',
      'どう思', 'おすすめ', 'recommend', 'what do you think', 'suggestions',
      '有没有', '怎么样', 'anyone', '大家', '请教'
    ];
    const hasQuestion = questionKeywords.some(kw => lowerContent.includes(kw.toLowerCase()));
    if (hasQuestion) {
      bonus += 8; // 问句类型最有互动价值
    }

    // 2. 明显争议 / 情绪 / 钓鱼（+5~9）
    const controversialKeywords = [
      '最垃圾', '最离谱', '都该', '傻', '气死', '震惊', '黑幕',
      '不要脸', '恶心', '厉害', '牛', '绝了', '离谱', '过分',
      'ridiculous', 'absurd', 'terrible', 'amazing', 'insane',
      'ありえない', 'やばい', 'すごい'
    ];
    const hasControversy = controversialKeywords.some(kw => lowerContent.includes(kw.toLowerCase()));
    if (hasControversy) {
      bonus += 7;
    }

    // 3. 有原生媒体（图片/视频/GIF）（+4~7）
    if (article) {
      const hasMedia = article.querySelector('video') ||
        article.querySelector('[data-testid="videoPlayer"]') ||
        article.querySelector('img[alt][src*="media"]');
      if (hasMedia) {
        bonus += 5;
      }
    }

    // 4. 轻度争议但没问号（+3~6）
    const mildKeywords = ['不同意', '觉得', '认为', '感觉', '可能', 'think', 'feel', 'maybe'];
    if (!hasQuestion && !hasControversy && mildKeywords.some(kw => lowerContent.includes(kw.toLowerCase()))) {
      bonus += 4;
    }

    // 限制在0-10分范围内
    return Math.min(bonus, 10);
  }

  // ✅ v3.0：计算时间得分（0-40分）
  function calculateTimeScore(hours) {
    if (hours === null || hours === undefined) return 24; // 默认中等（给10~14h区间的分数）

    // 按v3.0方案：
    // ≤0.5h: 12分（太早）
    // 0.5~2h: 32分（早期起势）
    // 2~6h: 40分（超级黄金窗口）⭐
    // 6~10h: 36分（仍强势）
    // 10~14h: 24分（中晚期长尾）
    // >14h: 0分（红线，已在硬过滤中处理）

    if (hours <= 0.5) {
      return 12;
    } else if (hours > 0.5 && hours <= 2) {
      return 32;
    } else if (hours > 2 && hours <= 6) {
      return 40; // 黄金窗口
    } else if (hours > 6 && hours <= 10) {
      return 36;
    } else if (hours > 10 && hours <= 14) {
      return 24;
    } else {
      return 0; // 超过14小时（硬过滤红线）
    }
  }

  // ✅ v3.0：计算竞争得分（0-40分）
  function calculateCompetitionScore(replyCount) {
    if (replyCount === null || replyCount === undefined) return 28; // 默认中等（对应51~90区间）

    // 按v3.0方案（阈值整体上浮，激进策略）：
    // 0~20: 40分（极蓝海）⭐
    // 21~50: 36分（优质回复仍能前排）
    // 51~90: 28分（中度卷）
    // 91~150: 18分（高竞争）
    // 151~180: 8分（红海边缘）
    // >180: 0分（红线，已在硬过滤中处理）

    if (replyCount <= 20) {
      return 40;
    } else if (replyCount <= 50) {
      return 36;
    } else if (replyCount <= 90) {
      return 28;
    } else if (replyCount <= 150) {
      return 18;
    } else if (replyCount <= 180) {
      return 8;
    } else {
      return 0; // 超过180（硬过滤红线）
    }
  }

  // ✅ v3.0：计算流量基础分（0-30分）
  function calculateViewScore(viewCount) {
    if (viewCount === null || viewCount === undefined) return 20; // 默认中等（对应2k~8k）

    // 按v3.0方案：
    // <500: 0分（红线，已在硬过滤中处理）
    // 500~2k: 12分（刚进流量池）
    // 2k~8k: 20分（中等起势）
    // 8k~30k: 26分（强势窗口）⭐
    // 30k~100k: 28分（已起飞）
    // >100k: 30分（超级乘车）

    if (viewCount < 500) {
      return 0; // 红线
    } else if (viewCount < 2000) {
      return 12;
    } else if (viewCount < 8000) {
      return 20;
    } else if (viewCount < 30000) {
      return 26; // 强势窗口
    } else if (viewCount < 100000) {
      return 28;
    } else {
      return 30; // 超级乘车
    }
  }

  // ✅ v3.0：计算潜力指数（总分120，四维度评分）
  async function calculatePotentialScore(task) {
    // 获取用户自定义权重（默认值 = 作者方法论）
    const weightSettings = await chrome.storage.sync.get([
      'potentialTimeWeight',
      'potentialCompetitionWeight',
      'potentialViewWeight',
      'potentialContentWeight'
    ]);
    
    // 兼容旧格式：如果值<=1说明是旧的比例格式，使用默认值
    function normalizeWeight(value, defaultVal) {
      if (value === undefined || value === null) return defaultVal;
      if (value <= 1) return defaultVal; // 旧格式，使用默认值
      return value;
    }
    
    // 默认权重：时间40 + 竞争40 + 流量30 + 倾向10 = 120分
    const timeWeight = normalizeWeight(weightSettings.potentialTimeWeight, 40);
    const competitionWeight = normalizeWeight(weightSettings.potentialCompetitionWeight, 40);
    const viewWeight = normalizeWeight(weightSettings.potentialViewWeight, 30);
    const contentWeight = normalizeWeight(weightSettings.potentialContentWeight, 10);
    
    // 计算各维度的归一化得分（0~1）
    const timeRatio = calculateTimeScore(task.postTime) / 40;
    const competitionRatio = calculateCompetitionScore(task.replyCount) / 40;
    const viewRatio = calculateViewScore(task.viewCount) / 30;
    const contentRatio = calculateContentBonus(task.content, task.article) / 10;
    
    // 按用户权重加权计算总分
    const totalScore = 
      timeRatio * timeWeight +
      competitionRatio * competitionWeight +
      viewRatio * viewWeight +
      contentRatio * contentWeight;

    return Math.round(totalScore);
  }

  // ✅ v3.0：获取潜力等级（基于120分制的新阈值）
  async function getPotentialLevel(score) {
    // 从设置中读取阈值（120分制）
    const settings = await chrome.storage.sync.get([
      'potentialMustGrabThreshold',
      'potentialStrongThreshold',
      'potentialTryThreshold'
    ]);

    // 使用默认值：≥95必抢、≥80强推、≥65试水
    const mustGrabThreshold = settings.potentialMustGrabThreshold ?? 95;
    const strongThreshold = settings.potentialStrongThreshold ?? 80;
    const tryThreshold = settings.potentialTryThreshold ?? 65;

    if (score >= mustGrabThreshold) {
      return 'high'; // 3条回复（必抢）⭐⭐⭐
    } else if (score >= strongThreshold) {
      return 'medium'; // 2条回复（强推）⭐⭐
    } else if (score >= tryThreshold) {
      return 'low'; // 1条回复（试水）⭐
    } else {
      return 'skip'; // 跳过
    }
  }

  // ✨ 在帖子上添加/更新潜力状态徽章
  function updateArticleBadge(article, options = {}) {
    if (!article) return;

    const {
      potentialLevel = null,    // 'high', 'medium', 'low', 'skip'
      status = 'pending',        // 'pending', 'generating', 'done', 'skipped'
      score = null               // 潜力分数
    } = options;

    // 查找或创建徽章元素
    let badge = article.querySelector('.xcomment-potential-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'xcomment-potential-badge';

      // 找到合适的容器（推文内容区域）
      let container = null;

      // 方法1: 尝试找到推文主体容器
      const tweetBody = article.querySelector('[data-testid="tweet"]');
      if (tweetBody) {
        container = tweetBody;
      }

      // 方法2: 如果没找到，使用article本身
      if (!container) {
        container = article;
      }

      // 确保容器有相对定位和overflow可见
      container.style.position = 'relative';
      container.style.overflow = 'visible';

      // 插入徽章为第一个子元素
      if (container.firstChild) {
        container.insertBefore(badge, container.firstChild);
      } else {
        container.appendChild(badge);
      }

      logger.debug('✅ 徽章已创建并插入');
    }

    // 更新徽章的潜力等级class
    badge.classList.remove('high', 'medium', 'low', 'skip', 'generating');
    if (potentialLevel) {
      badge.classList.add(potentialLevel);
    }

    // 根据状态更新徽章内容和样式
    let statusIcon = '';
    let statusText = '';

    switch (status) {
      case 'pending':
        statusIcon = '⏳';
        statusText = '待处理';
        break;
      case 'generating':
        statusIcon = '<span class="status-dot"></span>';
        statusText = '生成中';
        badge.classList.add('generating');
        break;
      case 'done':
        statusIcon = '✅';
        statusText = '已生成';
        break;
      case 'skipped':
        statusIcon = '⏭️';
        statusText = '已跳过';
        break;
      case 'accepted':
        statusIcon = '✓';
        statusText = '已填入';
        break;
      default:
        statusIcon = '⏳';
        statusText = '待处理';
    }

    // 构建潜力等级标签（简化显示）
    let levelLabel = '';
    let levelName = '';
    if (potentialLevel) {
      const levelLabels = {
        high: '🔥',
        medium: '✨',
        low: '💡',
        skip: '⏭️'
      };
      const levelNames = {
        high: 'HOT',
        medium: 'GOOD',
        low: 'TRY',
        skip: 'SKIP'
      };
      levelLabel = levelLabels[potentialLevel] || '';
      levelName = levelNames[potentialLevel] || '';
    }

    // 更新徽章内容（极简版 - 只显示等级和分数）
    const scoreText = score !== null ? `${score}` : '';

    badge.innerHTML = `
      ${statusIcon}
      <span>${levelLabel}${levelName}</span>
      ${scoreText ? `<span style="opacity:0.7">${scoreText}</span>` : ''}
    `;

    // 添加title提示（悬停显示详细信息）
    const dataNote = score === null ? ' (估算)' : '分';
    badge.title = `${levelName} ${score !== null ? score + '分' : '估算'} - ${statusText}`;

    // 调试：确保徽章可见
    const computedStyle = window.getComputedStyle(badge);
    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
      // ✅ v1.0.5：降级为 debug（调试信息）
      logger.debug('徽章被隐藏了', {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        zIndex: computedStyle.zIndex
      });
    }
  }

  // 拆分回复为多条（智能拆分，避免逗号开头）
  function splitCommentIntoReplies(comment, count) {
    // 🔥 先检查是否有 --- 分隔符（无论 count 是多少都要处理）
    const dashParts = comment.split(/\s*---\s*/).filter(p => p.trim());
    
    // 如果 AI 生成了多条但只需要1条，取第一条
    if (count <= 1) {
      return dashParts.length > 1 ? [dashParts[0].trim()] : [comment];
    }

    // 🔥 按 --- 分隔符拆分（提示词明确要求的格式）
    if (dashParts.length >= count) {
      const replies = dashParts.slice(0, count).map(p => p.trim());
      if (replies.length === count && replies.every(r => r.length > 0)) {
        return replies;
      }
    }
    // 如果 --- 拆分结果不够，但有内容，也返回（可能 AI 只生成了部分）
    if (dashParts.length > 1 && dashParts.every(p => p.length > 0)) {
      return dashParts.map(p => p.trim());
    }

    // 优先方案1：按双换行拆分（AI如果用\n\n分隔）
    const paragraphs = comment.split(/\n\s*\n+/).filter(p => p.trim());
    if (paragraphs.length >= count) {
      // 直接使用段落，每段作为一条回复
      const replies = paragraphs.slice(0, count).map(p => p.trim());
      if (replies.length === count && replies.every(r => r.length > 0)) {
        return replies;
      }
    }

    // 备用方案1：按句号拆分（AI如果用句号分隔）
    // 优先使用句号+换行或句号+空格作为分隔符
    const sentenceParts = comment.split(/([。！？.!?][\s\n]*)/);
    const sentences = [];
    for (let i = 0; i < sentenceParts.length; i += 2) {
      const sentence = sentenceParts[i] + (sentenceParts[i + 1] || '');
      const trimmed = sentence.trim();
      if (trimmed && trimmed.length > 5) {  // 过滤太短的片段
        sentences.push(trimmed);
      }
    }

    // 如果句子数量正好等于所需数量，直接返回
    if (sentences.length === count) {
      return sentences.map(s => s.replace(/^[，,。.！!？?；;：:\s]+/, '').trim());
    }

    // 如果句子数量>=所需数量，平均分配
    if (sentences.length >= count) {
      const sentencesPerReply = Math.ceil(sentences.length / count);
      const replies = [];
      for (let i = 0; i < count; i++) {
        const start = i * sentencesPerReply;
        const end = Math.min(start + sentencesPerReply, sentences.length);
        let replyText = sentences.slice(start, end).join(' ').trim();
        replyText = replyText.replace(/^[，,。.！!？?；;：:\s]+/, '');
        if (replyText && replyText.length > 0) {
          replies.push(replyText);
        }
      }
      if (replies.length > 0) {
        return replies.slice(0, count);
      }
    }

    // 如果句子数正好等于所需数量，直接返回
    if (sentences.length === count) {
      return sentences.map(s => s.replace(/^[，,。.！!？?；;：:\s]+/, '').trim()).filter(s => s.length > 0);
    }

    // 如果句子数>=所需数量，平均分配
    if (sentences.length >= count) {
      const replies = [];
      const sentencesPerReply = Math.ceil(sentences.length / count);

      for (let i = 0; i < count; i++) {
        const start = i * sentencesPerReply;
        const end = Math.min(start + sentencesPerReply, sentences.length);
        let replyText = sentences.slice(start, end).join(' ').trim();
        // 清理开头的标点
        replyText = replyText.replace(/^[，,。.！!？?；;：:\s]+/, '');
        if (replyText && replyText.length > 0) {
          replies.push(replyText);
        }
      }

      if (replies.length >= count) {
        return replies.slice(0, count);
      }
    }

    // 兜底：如果拆分失败，根据count智能切分
    // 按照平均长度切分（确保至少有count条）
    const avgLength = Math.floor(comment.length / count);
    if (avgLength < 10) {
      // 内容太短，无法拆分，返回原回复
      return [comment];
    }

    const replies = [];
    let remaining = comment;
    for (let i = 0; i < count - 1; i++) {
      // 在平均位置附近找合适的断点（空格、逗号、句号）
      let breakPoint = avgLength * (i + 1);
      // 向后搜索最近的标点或空格
      for (let j = breakPoint; j < Math.min(breakPoint + 20, remaining.length); j++) {
        if (/[\s，,。.！!？?；;：:]/.test(remaining[j])) {
          breakPoint = j + 1;
          break;
        }
      }

      const part = remaining.substring(0, breakPoint).trim();
      if (part) {
        replies.push(part.replace(/^[，,。.！!？?；;：:\s]+/, ''));
      }
      remaining = remaining.substring(breakPoint).trim();
    }

    // 最后一段
    if (remaining) {
      replies.push(remaining.replace(/^[，,。.！!？?；;：:\s]+/, ''));
    }

    // 确保返回count条
    if (replies.length < count) {
      // 如果还是不够，返回原回复
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
      'filterVerifiedOnly'
    ]);

    const verifiedOnly = filterSettings.filterVerifiedOnly ?? true;

    const list = [];
    let skipped = {
      dialog: 0,
      marked: 0,
      noReply: 0,
      noContent: 0,
      self: 0,
      completed: 0,
      notVerified: 0,
      // ✅ v3.0硬过滤统计（基于阈值的自动筛选）
      viewsTooLow: 0,
      timeTooOld: 0,
      replyTooMany: 0
    };

    // ✨ 提前计算所有潜力分数，用于初始徽章显示
    const candidatesWithScore = [];

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

      // ✅ v3.0：提取所有指标（包括Views）
      const postTime = extractPostTime(article);
      const replyCount = extractReplyCount(article);
      const viewCount = extractViewCount(article);

      // 🐛 调试：记录提取的指标
      logger.debug(`推文指标 - Views: ${viewCount}, 时间: ${postTime}h, 回复: ${replyCount}, 内容: "${content.slice(0, 50)}..."`);

      // ✅ v3.0硬过滤红线1：Views < 500 或提取失败 → 直接跳过（置信度9/10）
      // 重要：提取失败（null）也视为低Views，激进策略要求必须有明确的流量证据
      if (viewCount === null || viewCount < 500) {
        logger.debug(`过滤: 浏览量不足 (${viewCount}) - 已跳过`);
        skipped.viewsTooLow++;
        return;
      }
      logger.debug(`过滤: 浏览量符合 (${viewCount} >= 500) - 通过`);


      // ✅ v3.0硬过滤红线2：时间 > 14小时 → 直接跳过（置信度8.5/10）
      if (postTime !== null && postTime > 14) {
        skipped.timeTooOld++;
        return;
      }

      // ✅ v3.0硬过滤红线3：回复数 > 180 → 直接跳过（置信度8/10）
      if (replyCount !== null && replyCount > 180) {
        skipped.replyTooMany++;
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

      // ✅ 构建候选任务（新增viewCount字段）
      const candidate = {
        id: dedupKey || `${Date.now()}-${idx}`,
        tweetId,
        tweetUrl,
        article,
        content,
        authorHandle: handle,
        postTime: postTime,
        replyCount: replyCount,
        viewCount: viewCount, // ✅ v3.0新增
        likeCount: extractLikeCount(article),
        isVerified: isVerified,
        postType: extractPostType(article)
      };

      // ✅ 检查是否已经完成过（使用持久化的完成记录）
      if (isCompleted(candidate)) {
        skipped.completed++;
        // 即使已完成，也标记该article，避免重复检查
        article.dataset.xcommentBatchDone = '1';
        return;
      }

      // ✨ 立即计算潜力分数并显示徽章
      candidatesWithScore.push(candidate);
    });

    // ✨ 批量计算潜力分数并显示初始徽章
    for (const candidate of candidatesWithScore) {
      const potentialScore = await calculatePotentialScore(candidate);
      const potentialLevel = await getPotentialLevel(potentialScore);
      candidate.potentialScore = potentialScore;
      candidate.potentialLevel = potentialLevel;

      // 立即在帖子上显示"待处理"徽章
      if (candidate.article) {
        updateArticleBadge(candidate.article, {
          potentialLevel: potentialLevel,
          status: 'pending',
          score: potentialScore
        });
      }

      list.push(candidate);
    }

    return list;
  }

  function updateCounter() {
    const counter = document.getElementById('xcomment-batch-counter');
    if (counter) {
      const total = tasks.length;
      counter.textContent = `${total} Task${total !== 1 ? 's' : ''}`;
    }
  }

  function updateSummary() {
    const taskCounter = document.getElementById('xcomment-batch-counter');
    const taskStats = document.getElementById('xcomment-task-stats');
    const statusBar = document.getElementById('xcomment-status-bar');
    const playBtn = document.getElementById('xcomment-nav-play');
    
    if (!taskCounter) return;
    
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const runningCount = tasks.filter((t) => t.status === 'in_progress').length;
    // 使用会话计数器（不受清理影响）
    const done = sessionStats.generated;
    const failed = sessionStats.failed;
    const total = pending + runningCount + done + failed;

    // 更新任务计数徽章
    taskCounter.textContent = `${total} Task${total !== 1 ? 's' : ''}`;

    // 更新任务统计
    if (taskStats) {
      const waitEl = taskStats.querySelector('.wait strong');
      const runEl = taskStats.querySelector('.run strong');
      const doneEl = taskStats.querySelector('.done strong');
      const failEl = taskStats.querySelector('.fail strong');
      if (waitEl) waitEl.textContent = pending;
      if (runEl) runEl.textContent = runningCount;
      if (doneEl) doneEl.textContent = done;
      if (failEl) failEl.textContent = failed;
    }

    // 更新状态条
    if (statusBar) {
      statusBar.className = 'status-bar';
      if (running && runningCount > 0) {
        statusBar.className = 'status-bar running';
        statusBar.querySelector('.status-text').textContent = 'Running...';
      } else if (running && runningCount === 0 && pending === 0) {
        statusBar.className = 'status-bar paused';
        statusBar.querySelector('.status-text').textContent = 'Paused';
      } else if (failed > 0 && runningCount === 0) {
        statusBar.className = 'status-bar error';
        statusBar.querySelector('.status-text').textContent = 'Error';
      } else {
        statusBar.querySelector('.status-text').textContent = 'Ready';
      }
    }

    // 更新主按钮状态
    if (playBtn) {
      playBtn.className = 'primary-btn';
      const btnIcon = playBtn.querySelector('.btn-icon');
      const btnText = playBtn.querySelector('.btn-text');
      
      if (running && runningCount > 0) {
        playBtn.classList.add('running');
        if (btnIcon) btnIcon.textContent = '⏸️';
        if (btnText) btnText.textContent = 'Pause';
      } else if (running && runningCount === 0 && pending > 0) {
        playBtn.classList.add('paused');
        if (btnIcon) btnIcon.textContent = '▶';
        if (btnText) btnText.textContent = 'Resume';
      } else {
        if (btnIcon) btnIcon.textContent = '▶';
        if (btnText) btnText.textContent = 'Start';
      }
    }
  }

  function renderStatus(task) {
    // ✅ 简化：任务状态已集成到帖子内部显示，这里只更新汇总统计
    updateSummary();
  }

  async function refreshTasks(options = {}) {
    const { reset = false } = options;
    const list = await collectTweets();
    if (reset) {
      tasks = [];
      knownTaskIds.clear();
      taskElements.clear();
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
        preview: item.content.slice(0, 80),
        // ✨ 保留潜力分数和等级
        potentialScore: item.potentialScore,
        potentialLevel: item.potentialLevel
      };
      tasks.push(task);
      renderStatus(task);

      // ✨ 确保徽章显示（防止滚动时丢失）
      if (item.article && item.potentialScore !== undefined) {
        updateArticleBadge(item.article, {
          potentialLevel: item.potentialLevel,
          status: 'pending',
          score: item.potentialScore
        });
      }

      added += 1;
    });
    updateCounter();
    updateSummary();
    // ✅ 性能优化：每次刷新时检查是否需要清理
    if (tasks.length > MAX_COMPLETED_TASKS * 2) {
      cleanupCompletedTasks();
    }
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

    // ✅ 使用节流的 MutationObserver，减少触发频率
    let mutationTimeout = null;
    let pendingRefresh = false;

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
        pendingRefresh = true;

        if (mutationTimeout) {
          return;
        }

        mutationTimeout = setTimeout(() => {
          if (pendingRefresh) {
            scheduleRefresh();
            pendingRefresh = false;
          }
          mutationTimeout = null;
        }, 1000); // 节流：合并 1 秒内的所有变化
      }
    });

    // ✅ 只监听主时间线容器，不监听整个 body
    const timelineRoot = document.querySelector('#react-root') || document.body;
    mutationObserver.observe(timelineRoot, { childList: true, subtree: false });

    // ✅ v1.0.5：使用正态分布的刷新间隔，更自然
    let nextRefreshTime = Date.now() + getAdaptiveRefreshInterval();

    autoTimer = setInterval(async () => {
      if (!running || stopRequested || autoPaused) return;

      // 检查是否到达刷新时间
      if (Date.now() < nextRefreshTime) return;

      const added = await refreshTasks({ reset: false });
      if (added > 0) {
        launchNext();
      }

      // ✅ v1.0.5：使用自适应刷新间隔
      nextRefreshTime = Date.now() + getAdaptiveRefreshInterval();
    }, 1000); // 每秒检查一次，但实际刷新间隔是自适应的

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
    // ✅ 性能优化：使用 getTaskArticle 获取 article
    let target = getTaskArticle(task);
    if (!target && task.tweetId) {
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

  // 检查 AI 接口配置是否完整
  async function checkApiConfig() {
    try {
      const config = await chrome.storage.sync.get([
        'aiProvider',
        'openaiApiKey',
        'proxyList'
      ]);

      const provider = config.aiProvider || 'custom'; // 默认为代理站

      let isConfigured = false;

      if (provider === 'openai') {
        // 检查 OpenAI 官方配置
        isConfigured = !!(config.openaiApiKey && config.openaiApiKey.trim().length > 0);
      } else {
        // 检查代理站配置
        const proxyList = config.proxyList || [];
        // 至少有一个启用的代理站且配置了 API Key
        isConfigured = proxyList.some(proxy =>
          proxy.enabled !== false &&
          proxy.apiKey &&
          proxy.apiKey.trim().length > 0 &&
          proxy.baseUrl &&
          proxy.baseUrl.trim().length > 0
        );
      }

      // 显示或隐藏配置提示
      const notice = document.getElementById('xcomment-config-notice');
      if (notice) {
        if (isConfigured) {
          notice.classList.remove('show');
          // 延迟隐藏，等待动画完成
          setTimeout(() => {
            if (!notice.classList.contains('show')) {
              notice.style.display = 'none';
            }
          }, 300);
        } else {
          notice.style.display = 'block';
          // 触发重排以启动动画
          setTimeout(() => {
            notice.classList.add('show');
          }, 10);
        }
      }

      return isConfigured;
    } catch (e) {
      return false;
    }
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
    // 更新导航区域的开始/暂停按钮（替代原来的开始/停止按钮）
    const navPlayBtn = document.getElementById('xcomment-nav-play');
    if (navPlayBtn) {
      if (running) {
        // 正在运行，显示"Stop"
        navPlayBtn.textContent = '⏸ Stop';
        navPlayBtn.title = 'Stop (Space or K)';
        navPlayBtn.disabled = !!stopDisabled;
      } else {
        // 未运行，显示"Start"
        navPlayBtn.textContent = '▶ Start';
        navPlayBtn.title = 'Start (Space or K)';
        navPlayBtn.disabled = !!startDisabled;
      }
    }
  }

  function buildPromptBody(template, task, config, potentialLevel = 'low') {
    const includeAuthor = config.includeAuthor !== false;
    const includeTone = config.includeTone !== false;
    const postLanguage = detectPostLanguage(task.content);
    const locale = mapLanguageToLocale(postLanguage);
    // 语言指令：优先使用中文，保留专有名词
    const languageInstruction = '使用中文回复（可保留原帖中的专有名词如游戏名、人名等）';

    let toneValue = '';
    let toneLabel = '';
    if (includeTone) {
      toneValue = currentEmotion?.tone || '';
      toneLabel = currentEmotion?.name || '';
    }

    // 根据潜力等级添加长度和拆分提示
    let lengthInstruction = '';
    if (potentialLevel === 'high') {
      lengthInstruction = postLanguage === '英语或其他语言'
        ? '\n\n[IMPORTANT: This reply may need to be split into 3 parts]\n- Generate a longer, content-rich reply (150-250 characters suggested, with multiple viewpoints or details).\n- The reply should naturally contain multiple complete semantic paragraphs, each can be an independent reply.\n- Avoid breaking at commas, prioritize natural breaks at complete viewpoints or topic transitions.\n- Ensure each split reply starts with a complete sentence, not with commas, periods or other punctuation.'
        : '\n\n【重要：此回复可能需要拆分成3条发送】\n- 生成一条较长的、内容丰富的回复（建议150-250字符，包含多个观点或细节）。\n- 回复应该自然地包含多个完整的语义段落，每个段落可以独立成一条回复。\n- 避免在逗号处断开，优先在完整的观点或话题转换处自然分段。\n- 确保每条拆分后的回复开头都是完整的句子，不要以逗号、句号或其他标点开头。';
    } else if (potentialLevel === 'medium') {
      lengthInstruction = postLanguage === '英语或其他语言'
        ? '\n\n[IMPORTANT: This reply may need to be split into 2 parts]\n- Generate a medium-length reply (100-180 characters suggested, with 2-3 viewpoints or details).\n- The reply should naturally contain 2 complete semantic paragraphs, each can be an independent reply.\n- Avoid breaking at commas, prioritize natural breaks at complete viewpoint transitions.\n- Ensure each split reply starts with a complete sentence, not with commas, periods or other punctuation.'
        : '\n\n【重要：此回复可能需要拆分成2条发送】\n- 生成一条中等长度的回复（建议100-180字符，包含2-3个观点或细节）。\n- 回复应该自然地包含2个完整的语义段落，每个段落可以独立成一条回复。\n- 避免在逗号处断开，优先在完整的观点转换处自然分段。\n- 确保每条拆分后的回复开头都是完整的句子，不要以逗号、句号或其他标点开头。';
    }

    // 潜力等级相关变量
    const levelLabels = { high: 'HOT', medium: 'GOOD', low: 'TRY', skip: 'SKIP' };
    const replyCounts = { high: 3, medium: 2, low: 1, skip: 0 };
    const potentialLevelLabel = levelLabels[potentialLevel] || 'TRY';
    const replyCountValue = replyCounts[potentialLevel] || 1;

    // 获取人设配置（异步，但在这里我们用同步方式从已加载的配置中取）
    const personaDesc = config.persona || '23岁自由设计师，审美敏锐，表达直接，偶尔毒舌';

    const templateHasVar = templateHasVars(template, RESPONSE_TEMPLATE_KEYS);
    let body = replaceTemplateVars(template, {
      persona: personaDesc,
      author_handle: includeAuthor && task.authorHandle ? `@${task.authorHandle}` : '',
      content: task.content,
      reply_content: task.content,
      original_post_text: task.content,
      comments_summary: '',
      lang_instruction: languageInstruction,
      tone: toneValue,
      tone_label: toneLabel,
      locale,
      potential_level: potentialLevelLabel,
      reply_count: String(replyCountValue),
      post_type: task.postType || 'text'
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

  // 预设人设映射
  const PERSONA_PRESETS = {
    designer: '23岁自由设计师，审美敏锐，表达直接，偶尔毒舌，喜欢收集好图和吐槽烂设计',
    student: '高中生，中二热血，爱用网络梗和颜文字，对感兴趣的话题超有热情',
    otaku: '二次元宅，追番狂人，懂各种梗和黑话，对喜欢的作品共情能力超强',
    foodie: '美食博主，热爱分享生活，说话亲切，对好吃的东西毫无抵抗力',
    tech: '程序员，理性简洁，偶尔技术吐槽，对效率和逻辑有执念'
  };

  async function loadTemplateConfig() {
    try {
      // ✅ 从两个 storage 位置读取：local 用于大型模板，sync 用于小配置
      const [templates, config] = await Promise.all([
        chrome.storage.local.get(['defaultPromptTemplate']),
        chrome.storage.sync.get([
          'replyPromptTemplate',
          'includeAuthorHandleInPrompt',
          'includeToneInPrompt',
          'personaPreset',
          'customPersona'
        ])
      ]);
      
      // 获取人设描述
      const personaPreset = config.personaPreset || 'designer';
      const persona = personaPreset === 'custom'
        ? (config.customPersona || PERSONA_PRESETS.designer)
        : (PERSONA_PRESETS[personaPreset] || PERSONA_PRESETS.designer);
      
      return {
        template:
          templates.defaultPromptTemplate ||
          config.replyPromptTemplate ||
          DEFAULT_TEMPLATE,
        includeAuthor: config.includeAuthorHandleInPrompt !== false,
        includeTone: config.includeToneInPrompt !== false,
        persona: persona
      };
    } catch (e) {
      return {
        template: DEFAULT_TEMPLATE,
        includeAuthor: true,
        includeTone: true,
        persona: PERSONA_PRESETS.designer
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
    // ✅ 性能优化：使用 getTaskArticle 获取 article（可能需要重新查找）
    let article = getTaskArticle(task);
    if (!article) {
      // 尝试重新绑定文章
      article = findArticleByTweetId(task.tweetId);
      if (article) {
        task.article = article; // 临时缓存供后续使用
      }
    }

    // ✅ 检查是否已有相同 index 的卡片（精确防重复）
    if (article) {
      const existingIndexCard = article.querySelector(
        `.${CARD_CLASS}[data-task-id="${task.id}"][data-reply-index="${index}-${total}"]`
      );
      if (existingIndexCard) {
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

    // ✅ 性能优化：保存 tweetId 用于事件处理器中重新查找 article
    const taskTweetId = task.tweetId;

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
        // ✅ 更新导航状态：记录当前正在操作的文章
        const currentArticle = getTaskArticle(task) || findArticleByTweetId(taskTweetId);
        navigationState.currentArticle = currentArticle;
        
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
          // ✅ 性能优化：在事件处理时重新查找 article，避免闭包持有旧引用
          const currentArticle = getTaskArticle(task) || findArticleByTweetId(taskTweetId);
          
          // ✅ 更新导航状态：记录当前正在操作的文章，用于 Next 按钮定位下一篇
          navigationState.currentArticle = currentArticle;
          
          let inputEl = await openReplyAndFindInput(currentArticle);
          if (!inputEl) {
            inputEl = findReplyInputForArticle(currentArticle);
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
            if (currentArticle && index === total) {
              // 随机延迟3-5秒，模拟真实用户在阅读评论后点赞的行为
              const randomDelay = 3000 + Math.random() * 2000; // 3000-5000ms之间的随机延迟
              // ✅ 性能优化：不在闭包中持有 article 引用，使用 tweetId 重新查找
              setTimeout(() => {
                const articleForLike = findArticleByTweetId(taskTweetId);
                if (articleForLike) {
                  autoLikeTweet(articleForLike);
                }
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
    if (article) {
      if (article.dataset) {
        article.dataset.xcommentBatchDone = '1';
      }
    }

    // ✅ 如果无法找到推文元素，则无法添加卡片
    if (!article) {
      // ✅ v1.0.5：降级为 debug（用户快速滚动时这是预期行为）
      logger.debug('无法添加内联卡片：推文元素不存在', task.tweetId);
      return;
    }

    const textEl = article.querySelector('[data-testid="tweetText"]');
    if (textEl && textEl.parentElement) {
      textEl.parentElement.appendChild(card);
    } else {
      article.appendChild(card);
    }
  }

  async function processTask(task) {
    // 初始化重试次数
    if (task.retryCount === undefined) {
      task.retryCount = 0;
    }

    // ✅ 防止重复处理：如果已完成，直接返回
    if (task.status === 'done' && task.retryCount === 0) {
      activeCount -= 1;
      return;
    }

    // ✅ 防止重复处理：如果已填入，直接返回
    if (task.status === 'accepted' && task.retryCount === 0) {
      activeCount -= 1;
      return;
    }

    // ✅ 检查推文是否已有回复卡片（最强防御，仅针对非重试）
    // ✅ 性能优化：使用 getTaskArticle 获取 article
    const taskArticle = getTaskArticle(task);
    if (taskArticle && task.retryCount === 0) {
      const existingCards = taskArticle.querySelectorAll(`.${CARD_CLASS}[data-task-id="${task.id}"]`);
      if (existingCards.length > 0) {
        task.status = 'done';
        activeCount -= 1;
        await markCompleted(task);
        releaseTaskDomRef(task);
        return;
      }
    }

    // ✅ 立即标记推文为已处理，避免重复生成（在所有操作之前）
    if (taskArticle && taskArticle.dataset) {
      taskArticle.dataset.xcommentBatchDone = '1';
    }

    // ✅ 立即添加到已知任务集合，防止并发重复
    knownTaskIds.add(task.id);

    // ✅ 预先标记为已完成，防止页面刷新时重复处理
    await markCompleted(task);

    task.statusLabel = '生成中...';
    renderStatus(task);
    try {
      // ✨ 如果还没有计算潜力指数，现在计算（兜底逻辑）
      if (task.potentialScore === undefined) {
        const potentialScore = await calculatePotentialScore(task);
        const potentialLevel = await getPotentialLevel(potentialScore);
        task.potentialScore = potentialScore;
        task.potentialLevel = potentialLevel;
      }

      const potentialScore = task.potentialScore;
      const potentialLevel = task.potentialLevel;

      // ✨ 在帖子上显示"生成中"状态和潜力等级
      if (taskArticle) {
        updateArticleBadge(taskArticle, {
          potentialLevel: potentialLevel,
          status: 'generating',
          score: potentialScore
        });
      }

      // ✅ 潜力等级已经通过阈值系统自动筛选（high/medium/low），无需额外检查

      // ✅ v3.0：根据潜力等级决定回复数量
      // high(≥95): 3条 | medium(80~94): 2条 | low(65~79): 1条 | skip(<65): 跳过
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
      sessionStats.generated++; // 会话计数
      renderStatus(task);
      recordStat({ total: 1, success: 1 });

      // ✨ 在帖子上显示"已生成"状态
      if (taskArticle) {
        updateArticleBadge(taskArticle, {
          potentialLevel: task.potentialLevel,
          status: 'done',
          score: task.potentialScore
        });
      }

      // ✅ 性能优化：任务完成后释放 DOM 引用
      releaseTaskDomRef(task);
      activeCount -= 1;

      // ✅ 性能优化：定期清理已完成任务
      taskProcessCount++;
      if (taskProcessCount >= CLEANUP_INTERVAL) {
        taskProcessCount = 0;
        cleanupCompletedTasks();
      }

      launchNext();
    } catch (error) {
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
      sessionStats.generated++; // 会话计数（fallback也算生成）
      renderStatus(task);
      recordStat({ total: 1, success: 1 }); // 算作成功，因为有fallback

      // ✨ 在帖子上显示"已生成"状态（fallback也算生成）
      if (taskArticle) {
        updateArticleBadge(taskArticle, {
          potentialLevel: task.potentialLevel,
          status: 'done',
          score: task.potentialScore
        });
      }

      // ✅ 性能优化：任务完成后释放 DOM 引用
      releaseTaskDomRef(task);
      activeCount -= 1;

      // ✅ 性能优化：定期清理已完成任务
      taskProcessCount++;
      if (taskProcessCount >= CLEANUP_INTERVAL) {
        taskProcessCount = 0;
        cleanupCompletedTasks();
      }

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
    // ✅ 性能优化：使用 getTaskArticle 获取 article
    const next = tasks.find((t) => {
      if (t.status !== 'pending') return false;
      // 额外检查：确保任务没有已生成的卡片
      const taskArt = getTaskArticle(t);
      if (!taskArt) return true; // article 不存在，可以处理
      return taskArt.querySelectorAll(`.${CARD_CLASS}[data-task-id="${t.id}"]`).length === 0;
    });
    if (!next) {
      // 🔥 修复：不自动停止，保持运行状态，继续监控新任务
      // 只有用户手动点击"停止"按钮时才会停止批处理
      return;
    }

    // ✅ 立即标记为正在处理，防止重复启动
    next.status = 'in_progress';
    activeCount += 1;
    processTask(next);
    // ✅ v1.0.5：使用自适应并发数和正态分布延迟
    if (activeCount < getAdaptiveConcurrency()) {
      setTimeout(() => launchNext(), humanLikeDelay('task'));
    }
  }

  async function startBatch() {
    if (running) return;

    // 检查配置是否完整
    const configured = await checkApiConfig();
    if (!configured) {
      // 显示配置提示并震动吸引注意
      const notice = document.getElementById('xcomment-config-notice');
      if (notice) {
        notice.style.display = 'block';
        notice.classList.add('show');
        // 添加震动效果
        notice.style.animation = 'shake 0.6s ease';
        setTimeout(() => {
          if (notice && notice.style) {
            notice.style.animation = '';
          }
        }, 600);
      }
      return; // 阻止启动
    }

    await refreshTasks({ reset: true });
    running = true;
    stopRequested = false;
    autoPaused = false;
    // 重置会话统计计数器
    sessionStats = { generated: 0, failed: 0, filled: 0 };
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
    // ✅ 性能优化：批处理结束后清理已完成的任务
    cleanupCompletedTasks();
  }

  // ✅ 性能优化：清理已完成的任务，释放内存
  function cleanupCompletedTasks() {
    const completedTasks = tasks.filter(t => t.status === 'done' || t.status === 'error');
    // ✅ 性能优化：降低阈值从50到30，更频繁清理，减少内存占用
    if (completedTasks.length > 30) { // 保留最近 30 个已完成任务
      const tasksToRemove = completedTasks.slice(0, completedTasks.length - 30);
      tasksToRemove.forEach(task => {
        const index = tasks.indexOf(task);
        if (index > -1) {
          tasks.splice(index, 1);
        }
        // 清理 DOM 引用
        if (taskElements.has(task.id)) {
          const el = taskElements.get(task.id);
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
          taskElements.delete(task.id);
        }
        // 清理 ID 追踪
        knownTaskIds.delete(task.id);
      });
      logger.debug(`清理了 ${tasksToRemove.length} 个已完成任务，释放内存`);
    }
  }

  // ✅ 性能优化：定期清理任务（每处理10个任务后清理一次）
  let taskProcessCount = 0;
  const CLEANUP_INTERVAL = 10;

  // ✨ 自动为页面上的所有帖子添加潜力徽章（不依赖批处理启动）
  // ✅ 性能优化：添加缓存，避免重复查询已处理的 article
  const processedArticleCache = new WeakSet();
  let lastArticleQueryTime = 0;
  const ARTICLE_QUERY_THROTTLE = 2000; // 2秒内最多查询一次所有 article

  async function autoMarkArticles() {
    const now = Date.now();
    // ✅ 性能优化：节流 DOM 查询，避免频繁全量扫描
    if (now - lastArticleQueryTime < ARTICLE_QUERY_THROTTLE) {
      return;
    }
    lastArticleQueryTime = now;

    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

    // 筛选需要处理的帖子
    const articlesToMark = articles.filter(article => {
      // 跳过对话框中的
      if (article.closest('div[role="dialog"]')) return false;

      // 跳过没有内容的
      const content = extractContent(article);
      if (!content) return false;

      // ✅ 修复：检查徽章是否存在，如果不存在则需要重新标记
      const existingBadge = article.querySelector('.xcomment-potential-badge');
      if (existingBadge) {
        // 徽章存在，跳过
        return false;
      }

      // 徽章不存在（可能被X的DOM更新移除了），需要重新标记
      // 清除旧的标记状态
      article.dataset.xcommentBadgeMarked = '';
      processedArticleCache.delete(article);

      return true;
    });

    logger.debug(`发现 ${articlesToMark.length} 个待标记帖子`);

    // 并行处理所有帖子（提高性能）
    await Promise.all(articlesToMark.map(async (article) => {
      // 立即标记，避免重复处理
      article.dataset.xcommentBadgeMarked = '1';

      try {
        // 提取基本信息
        const content = extractContent(article);
        let postTime = extractPostTime(article);
        let replyCount = extractReplyCount(article);
        let viewCount = extractViewCount(article);

        // ✅ 改进：对于提取失败的数据，使用默认值而不是跳过
        // 这样即使数据不完整，也能显示徽章
        const hasValidData = viewCount !== null || postTime !== null || replyCount !== null;

        // 如果完全没有数据，尝试使用默认值
        if (!hasValidData) {
          logger.debug(`帖子数据不完整，使用默认值 - 内容: "${content.slice(0, 30)}..."`);
          viewCount = viewCount || 1000;  // 默认1000浏览
          postTime = postTime !== null ? postTime : 5;  // 默认5小时前
          replyCount = replyCount !== null ? replyCount : 20;  // 默认20个回复
        }

        // ✅ 宽松过滤：只过滤明显不符合的
        // 对于null值，使用默认值计算
        const effectiveViewCount = viewCount || 1000;
        const effectivePostTime = postTime !== null ? postTime : 5;
        const effectiveReplyCount = replyCount !== null ? replyCount : 20;

        // 从设置中读取硬过滤阈值
        const filterSettings = await chrome.storage.sync.get([
          'filterMinViews',
          'filterMaxHours',
          'filterMaxReplies'
        ]);
        const minViews = filterSettings.filterMinViews ?? 500;
        const maxHours = filterSettings.filterMaxHours ?? 14;
        const maxReplies = filterSettings.filterMaxReplies ?? 180;

        // 只过滤明确超标的（保留边界情况）
        let shouldSkip = false;
        let skipReason = '';

        if (viewCount !== null && viewCount < minViews) {
          shouldSkip = true;
          skipReason = `Views < ${minViews}`;
        } else if (postTime !== null && postTime > maxHours) {
          shouldSkip = true;
          skipReason = `Time > ${maxHours}h`;
        } else if (replyCount !== null && replyCount > maxReplies) {
          shouldSkip = true;
          skipReason = `Replies > ${maxReplies}`;
        }

        // 构建临时任务对象用于计算潜力
        const tempTask = {
          content,
          postTime: effectivePostTime,
          replyCount: effectiveReplyCount,
          viewCount: effectiveViewCount,
          likeCount: extractLikeCount(article) || 0,
          article
        };

        // 计算潜力
        const potentialScore = await calculatePotentialScore(tempTask);
        const potentialLevel = await getPotentialLevel(potentialScore);

        // ✅ 即使被硬过滤，也显示徽章（标记为skip状态）
        if (shouldSkip) {
          logger.debug(`跳过帖子: ${skipReason} - "${content.slice(0, 30)}..."`);
          updateArticleBadge(article, {
            potentialLevel: 'skip',
            status: 'skipped',
            score: potentialScore
          });
        } else {
          // 显示正常徽章
          updateArticleBadge(article, {
            potentialLevel: potentialLevel,
            status: 'pending',
            score: potentialScore
          });
          logger.debug(`✅ 标记帖子: ${potentialLevel} (${potentialScore}分) - "${content.slice(0, 30)}..."`);
        }
      } catch (e) {
        // 计算失败，仍然显示一个默认徽章
        // ✅ v1.0.5：降级为 debug（有回退处理，不影响用户）
        logger.debug('徽章计算失败，显示默认徽章:', e);
        updateArticleBadge(article, {
          potentialLevel: 'low',
          status: 'pending',
          score: null
        });
      }
    }));
  }

  // ✨ 启动自动徽章监控（独立于批处理）
  let badgeObserver = null;
  let badgeRefreshTimeout = null;
  let badgeCheckInterval = null; // ✅ 性能优化：保存定时器引用
  let badgeScrollHandler = null; // ✅ 性能优化：保存滚动监听器引用
  let badgeScrollTimeout = null;

  function startBadgeMonitor() {
    // ✅ 性能优化：防止重复启动
    if (badgeObserver || badgeCheckInterval) {
      return;
    }

    logger.debug('启动自动徽章监控系统');

    // 立即标记一次
    autoMarkArticles();

    // ✅ 性能优化：使用 subtree: false，只监听直接子元素变化，减少90%的监听事件
    const timelineRoot = document.querySelector('#react-root') || document.body;
    badgeObserver = new MutationObserver((mutations) => {
      let hasNewArticle = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              // 检查是否是article或包含article
              if (node.matches && node.matches('article[data-testid="tweet"]')) {
                hasNewArticle = true;
                break;
              } else if (node.querySelector && node.querySelector('article[data-testid="tweet"]')) {
                hasNewArticle = true;
                break;
              }
            }
          }
        }
        if (hasNewArticle) break;
      }

      if (!hasNewArticle) return;

      // 节流：避免频繁计算
      if (badgeRefreshTimeout) return;
      badgeRefreshTimeout = setTimeout(() => {
        badgeRefreshTimeout = null;
        logger.debug('检测到新帖子，触发标记');
        autoMarkArticles();
      }, 500); // 500ms内最多执行一次
    });

    // ✅ 性能优化：只监听 timelineRoot 的直接子元素，不使用 subtree: true
    badgeObserver.observe(timelineRoot, {
      childList: true,
      subtree: false
    });

    // 滚动时也触发（使用节流优化性能）
    badgeScrollHandler = () => {
      if (badgeScrollTimeout) return;
      badgeScrollTimeout = setTimeout(() => {
        badgeScrollTimeout = null;
        logger.debug('滚动触发，检查新帖子');
        autoMarkArticles();
      }, 600); // 滚动停止600ms后执行
    };
    window.addEventListener('scroll', badgeScrollHandler, { passive: true });

    // ✅ 性能优化：保存定时器引用，便于清理
    badgeCheckInterval = setInterval(() => {
      logger.debug('定时检查未标记帖子');
      autoMarkArticles();
    }, 5000); // 每5秒检查一次

    // ✨ 静默强制刷新徽章：每30秒自动清除并重新标记（确保徽章准确性）
    const forceRefreshInterval = setInterval(async () => {
      logger.debug('静默强制刷新徽章');
      // 清除所有已标记的状态，强制重新标记
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      articles.forEach(article => {
        article.dataset.xcommentBadgeMarked = '';
        const badge = article.querySelector('.xcomment-potential-badge');
        if (badge) badge.remove();
      });
      // 重新标记
      await autoMarkArticles();
    }, 30000); // 每30秒自动强制刷新一次

    // 保存强制刷新定时器引用，便于清理
    if (!window._badgeForceRefreshInterval) {
      window._badgeForceRefreshInterval = forceRefreshInterval;
    }
  }

  // ✅ 性能优化：添加清理函数
  function stopBadgeMonitor() {
    if (badgeObserver) {
      badgeObserver.disconnect();
      badgeObserver = null;
    }
    if (badgeCheckInterval) {
      clearInterval(badgeCheckInterval);
      badgeCheckInterval = null;
    }
    // 清理强制刷新定时器
    if (window._badgeForceRefreshInterval) {
      clearInterval(window._badgeForceRefreshInterval);
      window._badgeForceRefreshInterval = null;
    }
    if (badgeRefreshTimeout) {
      clearTimeout(badgeRefreshTimeout);
      badgeRefreshTimeout = null;
    }
    if (badgeScrollTimeout) {
      clearTimeout(badgeScrollTimeout);
      badgeScrollTimeout = null;
    }
    if (badgeScrollHandler) {
      window.removeEventListener('scroll', badgeScrollHandler);
      badgeScrollHandler = null;
    }
    logger.debug('已停止自动徽章监控系统');
  }

  // ✅ v1.0.5：风险重置定时器
  let riskResetInterval = null;

  async function init() {
    try {
      ensureStyles();
      createPanel();
      await loadCompletedCache();
      await loadEmotions();
      renderEmotions();
      await refreshTasks();
      enableToggleDrag();

      // 检查 AI 接口配置
      await checkApiConfig();

      // ✅ 默认展开面板
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.add('visible');
        syncPanelPosition();
      }

      // ✨ 启动自动徽章监控（不依赖批处理）
      startBadgeMonitor();

      // ✅ v1.0.5：每分钟重置风险计数
      riskResetInterval = setInterval(() => {
        operationCount = 0;
        if (riskLevel === 'high') {
          riskLevel = 'medium';
        } else if (riskLevel === 'medium') {
          riskLevel = 'low';
        }
      }, 60000);

      // 初始化导航功能（延迟执行，确保面板已创建）
      setTimeout(() => {
        if (typeof initNavigation === 'function') {
          initNavigation().catch(() => { });
        }
      }, 1500);

    } catch (error) {
      // 初始化失败，静默处理
      logger.error('初始化失败:', error);
    }

    // 监听情绪变化，实时更新选择器
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[EMO_STORAGE_KEY]) {
        loadEmotions().then(renderEmotions);
      }
      // 监听配置变化，实时更新配置提示
      if (area === 'sync' && (changes.aiProvider || changes.openaiApiKey || changes.proxyList)) {
        checkApiConfig().catch(() => { });
      }
    });

    // ✅ 性能优化：节流 ensureStyles 调用，避免频繁重绘
    function throttledEnsureStyles() {
      if (themeStyleTimeout) return;
      themeStyleTimeout = setTimeout(() => {
        themeStyleTimeout = null;
        ensureStyles();
      }, 200); // 最多每200ms执行一次
    }

    // 监听主题变化（通过body的background-color变化检测）
    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          // 检测到style变化，重新应用样式（节流）
          throttledEnsureStyles();
          break;
        }
      }
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['style']
    });

    // 也监听整个文档的背景色变化（通过class变化间接检测）
    classObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme')) {
          throttledEnsureStyles();
          break;
        }
      }
    });

    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style']
    });

    // ✅ 性能优化：页面可见性变化时暂停/恢复 observer
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 页面隐藏时断开主题监听器
        if (themeObserver) themeObserver.disconnect();
        if (classObserver) classObserver.disconnect();
        // 也暂停批处理的自动刷新
        if (running && !autoPaused) {
          pauseAutoWatch();
        }
        // ✅ 性能优化：页面隐藏时暂停徽章监控
        stopBadgeMonitor();
      } else {
        // 页面可见时重新连接
        if (themeObserver) {
          themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['style']
          });
        }
        if (classObserver) {
          classObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme', 'style']
          });
        }
        // 重新应用样式（主题可能已变化）
        ensureStyles();
        // 恢复批处理
        if (running && autoPaused) {
          resumeAutoWatch();
        }
        // ✅ 性能优化：页面可见时恢复徽章监控
        startBadgeMonitor();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
