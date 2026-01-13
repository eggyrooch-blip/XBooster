(() => {
  // 多种工具栏选择器，按优先级排序
  const TOOLBAR_SELECTORS = [
    'div[data-testid="toolBar"]',
    'div[data-testid="toolbar"]',
    'div[role="toolbar"]'
  ];
  const BUTTON_CLASS = 'xcomment-gpt-button';
  const BUTTON_LOADING_CLASS = 'xcomment-gpt-button-loading';
  const BUTTON_ERROR_CLASS = 'xcomment-gpt-button-error';
  const FALLBACK_ROW_CLASS = 'xcomment-gpt-fallback-row';
  const LOADING_EMOJI = '🎲';
  const BUTTON_ICON_URL = chrome.runtime.getURL('icons/icon48.png');
  const BUTTONISH_SELECTOR =
    'button:not(.xcomment-gpt-button), div[role="button"]:not(.xcomment-gpt-button), a[role="button"]:not(.xcomment-gpt-button)';
  const STYLE_ID = 'xcomment-gpt-style';
  const LAST_TOPIC_KEY = 'xcomment_last_topic';

  // ✅ 使用动态加载的情绪配置
  let EMOTIONS = [];
  let currentEmotion = null;

  // 加载情绪配置
  async function loadEmotionsConfig() {
    try {
      const response = await fetch(chrome.runtime.getURL('emotions.json'));
      EMOTIONS = await response.json();
      console.log('[XBooster] 情绪配置加载成功:', EMOTIONS.length, '种');
      
      // 读取当前选择的情绪
      const storage = await chrome.storage.sync.get(['currentEmotion']);
      currentEmotion = storage.currentEmotion || EMOTIONS[0]; // 默认第一个
      console.log('[XBooster] 当前情绪:', currentEmotion.emoji, currentEmotion.name);
      
      return true;
    } catch (error) {
      console.error('[XBooster] 加载情绪配置失败:', error);
      // 回退到默认情绪
      EMOTIONS = [
        { id: 'friendly', name: '友好', emoji: '😊', tone: 'friendly', description: '温暖、支持、积极' }
      ];
      currentEmotion = EMOTIONS[0];
      return false;
    }
  }

  // ✅ 更新按钮 emoji 的辅助函数
  function updateButtonEmoji(buttonEl, emotion) {
    if (!buttonEl || !emotion) {
      return;
    }
    if (buttonEl.dataset.xcommentLoading === '1') {
      return;
    }
    buttonEl.textContent = '';
    buttonEl.style.backgroundImage = `url(${BUTTON_ICON_URL})`;
    buttonEl.style.backgroundRepeat = 'no-repeat';
    buttonEl.style.backgroundPosition = 'center';
    buttonEl.style.backgroundSize = '22px 22px';
    buttonEl.setAttribute('aria-label', `AI 生成推文/回复 (${emotion.name})`);
    buttonEl.title = `当前情绪: ${emotion.name}`;
    console.log('[XBooster] 按钮已更新为静态 Logo, 情绪:', emotion.name);
  }

  function applyButtonLabel(buttonEl) {
    if (!buttonEl) {
      return;
    }
    if (currentEmotion) {
      updateButtonEmoji(buttonEl, currentEmotion);
      return;
    }
    buttonEl.textContent = '';
    buttonEl.style.backgroundImage = `url(${BUTTON_ICON_URL})`;
    buttonEl.style.backgroundRepeat = 'no-repeat';
    buttonEl.style.backgroundPosition = 'center';
    buttonEl.style.backgroundSize = '22px 22px';
    buttonEl.setAttribute('aria-label', 'AI 生成推文/回复');
    buttonEl.title = 'AI 生成推文/回复';
  }

  function setButtonLoadingState(buttonEl, isLoading) {
    if (!buttonEl) {
      return;
    }
    if (isLoading) {
      buttonEl.dataset.xcommentLoading = '1';
      buttonEl.classList.add(BUTTON_LOADING_CLASS);
      buttonEl.style.backgroundImage = 'none';
      buttonEl.textContent = LOADING_EMOJI;
      buttonEl.setAttribute('aria-label', 'AI 正在生成...');
      buttonEl.title = 'AI 正在生成...';
      return;
    }
    buttonEl.removeAttribute('data-xcomment-loading');
    buttonEl.classList.remove(BUTTON_LOADING_CLASS);
    applyButtonLabel(buttonEl);
  }

  // ✅ 监听情绪变化,实时更新所有按钮
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.currentEmotion) {
      const newEmotion = changes.currentEmotion.newValue;
      if (newEmotion) {
        currentEmotion = newEmotion;
        console.log('[XBooster] 情绪已更新:', newEmotion.emoji, newEmotion.name);
        
        // 更新页面上所有的按钮
        document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(btn => {
          updateButtonEmoji(btn, newEmotion);
        });
      }
    }
  });

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_CLASS} {
        min-width: 36px;
        min-height: 36px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: rgb(29, 155, 240);
        font-weight: 700;
        font-size: 20px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        transition: transform 0.2s ease, background-color 0.2s ease;
        line-height: 1;
      }

      .${BUTTON_CLASS}:hover {
        background-color: rgba(29, 155, 240, 0.1);
        transform: scale(1.1);
      }
      
      .${BUTTON_CLASS}:active {
        transform: scale(0.95);
      }

      .${BUTTON_LOADING_CLASS} {
        animation: xcomment-gpt-spin 0.9s linear infinite;
        pointer-events: none;
        transform-origin: 50% 50%;
      }

      .${BUTTON_ERROR_CLASS} {
        color: rgb(244, 33, 46);
      }

      .${FALLBACK_ROW_CLASS} {
        display: flex;
        justify-content: flex-end;
        margin-top: 8px;
        gap: 8px;
      }

      @keyframes xcomment-gpt-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;

    const target = document.head || document.documentElement;
    target.appendChild(style);
  }

  function findClosestInput(el) {
    // 方法1: 在当前元素中查找
    const inputEl = el.querySelector('div[data-testid^="tweetTextarea_"][contenteditable="true"]');
    if (inputEl) {
      return inputEl;
    }
    
    // 方法2: 查找 role="textbox" 的元素
    const textboxEl = el.querySelector('div[role="textbox"][contenteditable="true"]');
    if (textboxEl) {
      return textboxEl;
    }

    if (!el.parentElement) {
      return null;
    }

    return findClosestInput(el.parentElement);
  }

  function isEditableInput(el) {
    if (!el || !(el instanceof HTMLElement)) {
      return false;
    }
    if (el.getAttribute('contenteditable') !== 'true') {
      return false;
    }
    const role = el.getAttribute('role');
    const testId = el.getAttribute('data-testid') || '';
    return role === 'textbox' || testId.startsWith('tweetTextarea_');
  }
  
  // 通过输入框反向查找工具栏
  function findToolbarFromInput(inputEl) {
    if (!inputEl) {
      return null;
    }
    
    // 向上查找，寻找包含工具栏按钮的容器
    let current = inputEl.parentElement;
    let depth = 0;
    const maxDepth = 15;
    
    while (current && depth < maxDepth) {
      const toolbarCandidate = current.querySelector(
        'div[data-testid="toolBar"], div[data-testid="toolbar"], div[role="toolbar"]'
      );
      if (toolbarCandidate) {
        return toolbarCandidate;
      }

      // 查找包含常见工具栏按钮的容器（图片、GIF、投票等）
      const hasToolbarButtons = current.querySelector(
        '[data-testid*="media"], [data-testid*="poll"], [data-testid*="gif"], [data-testid*="emoji"], [aria-label*="Media"], [aria-label*="GIF"], [aria-label*="Emoji"]'
      );
      if (hasToolbarButtons) {
        // 找到包含按钮的父容器，继续向上查找包含所有工具栏元素的容器
        let toolbar = current;
        let innerDepth = 0;
        while (toolbar && innerDepth < 5) {
          const buttons = toolbar.querySelectorAll(BUTTONISH_SELECTOR);
          if (buttons.length >= 2) { // 工具栏通常有多个按钮（至少2个）
            return toolbar;
          }
          toolbar = toolbar.parentElement;
          innerDepth++;
        }
        return current;
      }
      current = current.parentElement;
      depth++;
    }
    
    return null;
  }
  
  // 查找所有可能的输入框
  function findAllInputs() {
    const inputs = [];
    // 方法1: 通过 data-testid
    const testIdInputs = document.querySelectorAll('div[data-testid^="tweetTextarea_"][contenteditable="true"]');
    testIdInputs.forEach((el) => {
      if (isEditableInput(el) && !inputs.includes(el)) {
        inputs.push(el);
      }
    });
    
    // 方法2: 通过 role="textbox"
    const textboxInputs = document.querySelectorAll('div[role="textbox"][contenteditable="true"]');
    textboxInputs.forEach((el) => {
      if (isEditableInput(el) && !inputs.includes(el)) {
        inputs.push(el);
      }
    });
    
    return inputs;
  }

  // HTML 转义函数，用于备用方案
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 将文本写入 X/Twitter 输入框
   * 主方案: 使用 paste 事件 (基于 tweetGPT 源码)
   * 备用方案: 使用 innerHTML + HTML 转义
   */
  function setInputText(inputEl, text) {
    if (!inputEl) {
      console.warn('[XBooster] setInputText: inputEl is null');
      return;
    }

    console.log('[XBooster] 开始写入文本，长度:', text.length, '预览:', text.substring(0, 50));

    // 主方案: 使用 paste 事件 (来自 tweetGPT 源码)
    // 优点: 自动处理 HTML 转义，完整触发 DraftJS 状态更新，可正常提交
    try {
      inputEl.focus();
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', text);
      
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
      });
      
      const dispatched = inputEl.dispatchEvent(pasteEvent);
      dataTransfer.clearData();
      
      if (dispatched) {
        console.log('[XBooster] ✅ 使用 paste 方法写入成功');
        return;
      }
    } catch (error) {
      console.warn('[XBooster] ⚠️ paste 方法失败，使用备用方案:', error);
    }

    // 备用方案: 改进的 innerHTML 方法
    const textWrapper = inputEl.querySelector('[data-text="true"]')?.parentElement;
    if (textWrapper) {
      const escapedText = escapeHtml(text);
      textWrapper.innerHTML = `<span data-text="true">${escapedText}</span>`;
      
      // 触发多个事件确保 React/DraftJS 状态更新
      textWrapper.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      textWrapper.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('[XBooster] ✅ 使用 innerHTML 备用方案写入成功');
    } else {
      console.error('[XBooster] ❌ 无法找到文本容器，写入失败');
    }
  }

  function findReplyText(toolbarEl) {
    const dialog = toolbarEl.closest('div[role="dialog"]');
    let replyArticle = null;

    if (dialog) {
      replyArticle = dialog.querySelector('article[data-testid="tweet"]');
    } else {
      replyArticle = document.querySelector('article[data-testid="tweet"][tabindex="-1"]');
    }

    if (!replyArticle) {
      return undefined;
    }

    const textEl = replyArticle.querySelector('div[data-testid="tweetText"]');
    if (!textEl || !textEl.textContent) {
      return undefined;
    }

    const tweetText = textEl.textContent.trim();
    if (!tweetText) {
      return undefined;
    }

    // 尝试在同一条推文中找到作者 handle（例如 @eggyrooch）
    let handle = '';
    const spans = replyArticle.querySelectorAll('span');
    spans.forEach((span) => {
      if (handle) {
        return;
      }
      const text = (span.textContent || '').trim();
      if (
        text.startsWith('@') &&
        !/\s/.test(text) &&
        text.length > 1 &&
        text.length < 50
      ) {
        handle = text;
      }
    });

    if (handle) {
      return `${handle}: ${tweetText}`;
    }

    return tweetText;
  }

  function showError(buttonEl) {
    buttonEl.classList.add(BUTTON_ERROR_CLASS);
    setTimeout(() => {
      buttonEl.classList.remove(BUTTON_ERROR_CLASS);
    }, 3000);
  }

  async function maybePromptTopic(hasReply) {
    if (hasReply) {
      return { topic: undefined, cancelled: false };
    }

    const stored = await chrome.storage.local.get([LAST_TOPIC_KEY]);
    const lastTopic = stored[LAST_TOPIC_KEY] || '';
    const input = window.prompt('主题或草稿（用于生成新推文）', lastTopic);
    if (input === null) {
      return { topic: undefined, cancelled: true };
    }

    const topic = input.trim() || 'X';
    await chrome.storage.local.set({ [LAST_TOPIC_KEY]: topic });
    return { topic, cancelled: false };
  }

  function detectLocaleFromText(text) {
    if (!text) {
      return navigator.language || 'en';
    }

    const chinesePattern = /[\u4e00-\u9fa5]/;
    const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/;
    const koreanPattern = /[\uac00-\ud7a3]/;

    if (chinesePattern.test(text)) {
      return 'zh-CN';
    }
    if (japanesePattern.test(text)) {
      return 'ja';
    }
    if (koreanPattern.test(text)) {
      return 'ko';
    }
    return 'en';
  }

  function generateText(props) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'generateTweet', props }, (response) => {
        if (chrome.runtime.lastError) {
          const message = chrome.runtime.lastError.message || 'Extension error';
          if (message.includes('Extension context invalidated')) {
            reject(new Error('扩展已更新，请刷新页面后重试'));
            return;
          }
          reject(new Error(message));
          return;
        }
        if (!response) {
          reject(new Error('No response from background.'));
          return;
        }
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.text || '');
      });
    });
  }

  const SETTINGS_HINT =
    '请先在扩展设置中配置 API Key / URL\n\n点击浏览器工具栏中的扩展图标，然后点击"设置"按钮';
  const CONTEXT_INVALIDATED_HINT = '扩展已更新，请刷新页面后重试';

  function isContextInvalidated(error) {
    const message = error && error.message ? error.message : '';
    return message.includes('Extension context invalidated') || message.includes('扩展已更新');
  }

  // 检查 API 配置是否完整
  async function checkApiKey() {
    const result = await chrome.storage.sync.get([
      'aiProvider',
      'openaiApiKey',
      'customApiKey',
      'customApiBaseUrl',
      'proxyList'
    ]);
    const provider = result.aiProvider || 'openai';
    if (provider === 'custom') {
      // 支持代理站列表（与 background.js 逻辑保持一致）
      const proxies = Array.isArray(result.proxyList) ? result.proxyList : [];
      const enabledProxy = proxies.find((p) => p && p.enabled !== false && p.baseUrl && p.apiKey);
      if (enabledProxy) {
        return true;
      }
      // 回退到单个自定义配置
      return !!result.customApiKey && !!result.customApiBaseUrl;
    }
    return !!result.openaiApiKey;
  }

  async function handleGenerate(toolbarEl, buttonEl, type) {
    setButtonLoadingState(buttonEl, true);
    try {
      if (!chrome?.runtime?.id) {
        throw new Error(CONTEXT_INVALIDATED_HINT);
      }

      // 先检查 API 配置
      let hasApiConfig = false;
      try {
        hasApiConfig = await checkApiKey();
      } catch (error) {
        if (isContextInvalidated(error)) {
          alert(CONTEXT_INVALIDATED_HINT);
          return;
        }
        throw error;
      }
      if (!hasApiConfig) {
        alert(SETTINGS_HINT);
        return;
      }

      // ✅ 读取当前选择的情绪
      let currentEmotion = null;
      try {
        const storage = await chrome.storage.sync.get(['currentEmotion']);
        currentEmotion = storage.currentEmotion;
        if (currentEmotion) {
          console.log('[XBooster] 当前情绪:', currentEmotion.emoji, currentEmotion.name, currentEmotion.tone);
        }
      } catch (error) {
        console.warn('[XBooster] 读取情绪失败:', error);
      }

      const replyTo = findReplyText(toolbarEl);
      const topicResult = await maybePromptTopic(!!replyTo);
      if (topicResult.cancelled) {
        return;
      }

      const locale = replyTo ? detectLocaleFromText(replyTo) : (navigator.language || 'en');
      const text = await generateText({
        type: currentEmotion ? currentEmotion.tone : type, // ✅ 使用当前情绪的 tone
        topic: topicResult.topic,
        replyTo,
        locale
      });

      if (!text) {
        throw new Error('Empty response.');
      }

      const inputEl = findClosestInput(toolbarEl);
      if (!inputEl) {
        throw new Error('Tweet input not found.');
      }

      setInputText(inputEl, text);
    } catch (error) {
      console.error('X comment tweet generation failed:', error);
      // 如果错误信息包含 API Key/URL，显示友好提示
      if (error.message && error.message.includes('扩展已更新')) {
        alert(CONTEXT_INVALIDATED_HINT);
      } else if (
        error.message &&
        (error.message.includes('API Key') || error.message.includes('API URL'))
      ) {
        alert(SETTINGS_HINT);
      } else {
        showError(buttonEl);
        setTimeout(() => {
          alert('生成失败: ' + error.message);
        }, 100);
      }
    } finally {
      setButtonLoadingState(buttonEl, false);
    }
  }

  function addButtonToToolbar(toolbarEl) {
    if (!toolbarEl) {
      console.log('addButtonToToolbar: toolbarEl 为空');
      return;
    }
    
    // 检查是否已经添加了按钮
    if (toolbarEl.querySelector(`.${BUTTON_CLASS}`)) {
      console.log('addButtonToToolbar: 按钮已存在');
      return;
    }

    // 查找输入框
    const inputEl = findClosestInput(toolbarEl);
    if (!inputEl) {
      // 如果找不到输入框，尝试通过工具栏反向查找
      const foundInput = toolbarEl.querySelector(
        'div[data-testid^="tweetTextarea_"][contenteditable="true"], div[role="textbox"][contenteditable="true"]'
      );
      if (!foundInput) {
        console.log('addButtonToToolbar: 未找到输入框，跳过');
        return;
      }
    }

    console.log('addButtonToToolbar: 开始添加按钮', toolbarEl);

    const buttonEl = document.createElement('button');
    buttonEl.type = 'button';
    buttonEl.className = BUTTON_CLASS;
    applyButtonLabel(buttonEl);

    buttonEl.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log('按钮被点击, 当前情绪:', currentEmotion?.name);
      try {
        await handleGenerate(toolbarEl, buttonEl, currentEmotion ? currentEmotion.tone : 'friendly');
      } catch (error) {
        console.error('按钮生成失败:', error);
      }
    });

    // 标记已修正，避免被重复处理
    buttonEl.dataset.xcommentPatched = '1';

    // 尝试多种方式添加按钮
    // 方法1: 添加到第一个子元素
    const container = toolbarEl.firstElementChild || toolbarEl;
    if (container && container.nodeType === Node.ELEMENT_NODE) {
      container.appendChild(buttonEl);
      console.log('按钮已添加到第一个子元素', container);
      return;
    }
    
    // 方法2: 直接添加到工具栏
    toolbarEl.appendChild(buttonEl);
    console.log('按钮已直接添加到工具栏', toolbarEl);
  }
  
  // 为输入框添加按钮（通过输入框反向查找工具栏）
  function addButtonToInput(inputEl) {
    if (!inputEl) {
      console.log('addButtonToInput: inputEl 为空');
      return;
    }

    if (!isEditableInput(inputEl)) {
      return;
    }
    
    console.log('addButtonToInput: 开始处理输入框', inputEl);
    
    // 检查是否已经添加了按钮（在输入框附近）
    const scopeEl =
      inputEl.closest('form') ||
      inputEl.closest('div[role="dialog"]') ||
      inputEl.closest('[data-testid="tweetTextarea_0RichTextInputContainer"]') ||
      inputEl.parentElement;
    const existingButton = scopeEl ? scopeEl.querySelector(`.${BUTTON_CLASS}`) : null;
    if (existingButton) {
      console.log('addButtonToInput: 按钮已存在');
      return;
    }
    
    // 查找工具栏
    const toolbarEl = findToolbarFromInput(inputEl);
    if (toolbarEl) {
      console.log('addButtonToInput: 找到工具栏', toolbarEl);
      addButtonToToolbar(toolbarEl);
    } else {
      console.log('addButtonToInput: 未找到工具栏，尝试在父容器中添加');
      // 如果找不到工具栏，尝试在输入框的父容器中添加
      let container = inputEl.parentElement;
      let depth = 0;
      while (container && depth < 10) {
        // 查找包含其他按钮的容器
        const hasButtons = container.querySelector(BUTTONISH_SELECTOR);
        if (hasButtons) {
          // 检查是否已有 GPT 按钮
          if (!container.querySelector(`.${BUTTON_CLASS}`)) {
            console.log('addButtonToInput: 在父容器中添加按钮', container);
            const buttonEl = document.createElement('button');
            buttonEl.type = 'button';
            buttonEl.className = BUTTON_CLASS;
            applyButtonLabel(buttonEl);
            buttonEl.addEventListener('click', async (event) => {
              event.preventDefault();
              event.stopPropagation();
              console.log('按钮被点击（从输入框添加）, 当前情绪:', currentEmotion?.name);
              try {
                await handleGenerate(container, buttonEl, currentEmotion ? currentEmotion.tone : 'friendly');
              } catch (error) {
                console.error('按钮生成失败:', error);
              }
            });
            buttonEl.dataset.xcommentPatched = '1';
            container.appendChild(buttonEl);
          }
          return;
        }
        container = container.parentElement;
        depth++;
      }
      const anchor = inputEl.closest('div[role="textbox"]') || inputEl;
      const parent = anchor.parentElement;
      if (parent && !parent.querySelector(`.${FALLBACK_ROW_CLASS}`)) {
        const fallbackRow = document.createElement('div');
        fallbackRow.className = FALLBACK_ROW_CLASS;
        parent.insertBefore(fallbackRow, anchor.nextSibling);
        addButtonToToolbar(fallbackRow);
        console.log('addButtonToInput: 使用降级容器添加按钮', fallbackRow);
        return;
      }
      console.log('addButtonToInput: 未找到合适的容器添加按钮');
    }
  }

  function handleMutations(mutations) {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        
        // 方法1: 检查是否是工具栏
        for (const selector of TOOLBAR_SELECTORS) {
          if (node.matches && node.matches(selector)) {
            addButtonToToolbar(node);
            return;
          }
        }
        
        // 方法2: 在节点内查找工具栏
        for (const selector of TOOLBAR_SELECTORS) {
          const toolbars = node.querySelectorAll ? node.querySelectorAll(selector) : [];
          toolbars.forEach((toolbar) => {
            addButtonToToolbar(toolbar);
          });
        }
        
        // 方法3: 检查是否是输入框
        if (isEditableInput(node)) {
          addButtonToInput(node);
        }
      });
    });
  }

  function init() {
    console.log('x-inline.js 初始化开始');
    ensureStyles();

    // 清理旧按钮（可能来自旧版本的残留）
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((btn) => {
      btn.remove();
    });

    // 方法1: 查找所有已知的工具栏选择器
    for (const selector of TOOLBAR_SELECTORS) {
      const toolbars = document.querySelectorAll(selector);
      console.log(`找到 ${toolbars.length} 个工具栏（通过选择器 ${selector}）`);
      toolbars.forEach((toolbar) => {
        addButtonToToolbar(toolbar);
      });
    }
    
    // 方法2: 查找所有输入框并尝试添加按钮
    const allInputs = findAllInputs();
    console.log(`总共找到 ${allInputs.length} 个输入框`);
    allInputs.forEach(input => {
      addButtonToInput(input);
    });

    const root = document.querySelector('#react-root') || document.body;
    const observer = new MutationObserver(handleMutations);
    observer.observe(root, { childList: true, subtree: true });
    console.log('MutationObserver 已启动');
    
    // 定期检查输入框（处理动态加载的情况）
    setInterval(() => {
      const inputs = findAllInputs();
      inputs.forEach(input => {
        const hasButton = input.closest('div')?.querySelector(`.${BUTTON_CLASS}`);
        if (!hasButton) {
          console.log('定期检查：发现新输入框，添加按钮');
          addButtonToInput(input);
        }
      });
    }, 2000);
    
    console.log('x-inline.js 初始化完成');
  }

  // ✅ 初始化：先加载情绪配置,再启动主程序
  async function initialize() {
    await loadEmotionsConfig();
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
