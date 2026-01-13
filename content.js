// 检测是否在帖子详情页
function isPostDetailPage() {
  const url = window.location.href;
  return url.includes('/status/') || url.match(/\/[^\/]+\/status\/\d+/);
}

// ✅ 新增：检测页面场景类型
function detectPageContext() {
  const url = window.location.href;
  const pathname = window.location.pathname;
  
  // 帖子详情页
  if (pathname.includes('/status/')) {
    return {
      type: 'post_detail',
      label: '帖子详情',
      canRead: true,
      icon: '📄'
    };
  }
  
  // 首页
  if (pathname === '/home' || pathname === '/') {
    return {
      type: 'home',
      label: '首页',
      canRead: false, // 首页没有特定帖子上下文
      icon: '🏠'
    };
  }
  
  // 用户主页
  if (pathname.match(/^\/[^\/]+\/?$/) && !['home', 'explore', 'notifications', 'messages', 'search', 'compose'].includes(pathname.slice(1))) {
    return {
      type: 'profile',
      label: '用户主页',
      canRead: true, // 可以尝试读取置顶或最新推文
      icon: '👤'
    };
  }
  
  // 探索页
  if (pathname.includes('/explore')) {
    return {
      type: 'explore',
      label: '探索',
      canRead: false,
      icon: '🔍'
    };
  }
  
  // 搜索结果页
  if (pathname.includes('/search')) {
    return {
      type: 'search',
      label: '搜索结果',
      canRead: true, // 可以读取搜索关键词
      icon: '🔎'
    };
  }
  
  // 其他页面
  return {
    type: 'other',
    label: '其他页面',
    canRead: false,
    icon: '📱'
  };
}

// 找到主帖子 article（通过 URL 中的 handle 匹配）
function findMainArticle() {
  // 首先从 URL 中提取 handle
  const urlMatch = window.location.pathname.match(/^\/([^\/]+)\/status\//);
  const urlHandle = urlMatch ? urlMatch[1] : null;
  
  if (!urlHandle) {
    // 如果没有 URL handle，返回第一个 article
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    return articles.length > 0 ? articles[0] : null;
  }
  
  // 查找所有 article，找到包含该 handle 链接的 article（主帖子）
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  
  for (const article of articles) {
    // 方法1: 查找包含该 handle 的链接
    const handleLink = article.querySelector(`a[href="/${urlHandle}"]`);
    if (handleLink) {
      return article;
    }
    
    // 方法2: 查找包含该 handle 的文本
    const articleText = article.innerText || article.textContent;
    if (articleText && articleText.includes(`@${urlHandle}`)) {
      // 进一步验证：确保这个 handle 在作者信息区域
      const authorSection = article.querySelector('[data-testid="User-Name"]') || 
                           article.querySelector('div[dir="ltr"]');
      if (authorSection) {
        const authorText = authorSection.innerText || authorSection.textContent;
        if (authorText && authorText.includes(`@${urlHandle}`)) {
          return article;
        }
      }
    }
  }
  
  // 如果找不到匹配的，返回第一个 article（备用）
  return articles.length > 0 ? articles[0] : null;
}

// 提取帖子作者信息
function extractAuthor(article) {
  let author = '';
  let authorHandle = '';
  
  // 首先从 URL 中提取 handle（最可靠的方法）
  const urlMatch = window.location.pathname.match(/^\/([^\/]+)\/status\//);
  if (urlMatch) {
    authorHandle = urlMatch[1];
  }
  
  // 如果没有传入 article，尝试找到主帖子
  if (!article) {
    article = findMainArticle();
  }
  
  if (article) {
    // 方法1.1: 查找包含 "用户名 @handle" 格式的 div（如 "Eggyrooch @eggyrooch"）
    // 优先查找与 URL 中的 handle 匹配的
    const authorDivs = article.querySelectorAll('div');
    for (const div of authorDivs) {
      const text = div.innerText || div.textContent;
      if (text && text.includes('@')) {
        // 匹配格式：用户名 @handle
        const match = text.match(/^([^@]+)\s+@([^\s]+)$/);
        if (match) {
          const foundHandle = match[2];
          // 如果 URL 中有 handle，优先匹配 URL 中的 handle
          if (authorHandle && foundHandle === authorHandle) {
            author = match[1].trim();
            break;
          } else if (!authorHandle) {
            // 如果没有 URL handle，使用找到的第一个
            author = match[1].trim();
            authorHandle = foundHandle;
            break;
          }
        }
      }
    }
    
    // 方法1.2: 查找用户名元素（data-testid="User-Name"）
    if (!author) {
      const userNameEl = article.querySelector('[data-testid="User-Name"]');
      if (userNameEl) {
        const nameSpans = userNameEl.querySelectorAll('span');
        for (const span of nameSpans) {
          const text = span.innerText || span.textContent;
          if (text && text.trim() && !text.includes('@') && text.length < 50) {
            author = text.trim();
            break;
          }
        }
      }
    }
    
    // 方法1.3: 提取 @handle（通常在链接中，优先匹配 URL 中的 handle）
    if (authorHandle) {
      // 如果已有 URL handle，查找匹配的链接来获取显示名称
      const handleLink = article.querySelector(`a[href="/${authorHandle}"]`);
      if (handleLink) {
        // 从链接附近查找显示名称
        const parent = handleLink.closest('div');
        if (parent) {
          const nameSpans = parent.querySelectorAll('span');
          for (const span of nameSpans) {
            const text = span.innerText || span.textContent;
            if (text && text.trim() && !text.includes('@') && text.length < 50) {
              author = text.trim();
              break;
            }
          }
        }
      }
    } else {
      // 如果没有 URL handle，从链接中提取
      const links = article.querySelectorAll('a[href^="/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (href && href.match(/^\/[^\/]+\/?$/) && href !== '/home' && href !== '/explore' && href !== '/') {
          const handle = href.replace(/^\//, '').replace(/\/$/, '');
          // 排除常见的非用户名路径
          if (!['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search'].includes(handle)) {
            authorHandle = handle;
            // 同时尝试获取显示名称
            const parent = link.closest('div');
            if (parent) {
              const nameSpans = parent.querySelectorAll('span');
              for (const span of nameSpans) {
                const text = span.innerText || span.textContent;
                if (text && text.trim() && !text.includes('@') && text.length < 50) {
                  author = text.trim();
                  break;
                }
              }
            }
            break;
          }
        }
      }
    }
  }
  
  // 方法2: 从页面标题中提取（备用）
  if (!author && authorHandle) {
    const title = document.title;
    const match = title.match(/^(.+?)\s*\(@([^\)]+)\)/);
    if (match && match[2] === authorHandle) {
      author = match[1].trim();
    }
  }
  
  // 如果只有 handle，尝试从页面中查找对应的显示名称
  if (authorHandle && !author) {
    // 查找包含该 handle 的链接
    const handleLink = Array.from(document.querySelectorAll('a[href*="' + authorHandle + '"]')).find(link => {
      const href = link.getAttribute('href');
      return href && href.includes(authorHandle) && href !== '/home';
    });
    
    if (handleLink) {
      const parent = handleLink.closest('div');
      if (parent) {
        const nameSpans = parent.querySelectorAll('span');
        for (const span of nameSpans) {
          const text = span.innerText || span.textContent;
          if (text && text.trim() && !text.includes('@') && text.length < 50 && text !== authorHandle) {
            author = text.trim();
            break;
          }
        }
      }
    }
  }
  
  return {
    name: author ? author.trim() : '',
    handle: authorHandle ? authorHandle.trim() : '',
    displayName: author ? `${author}${authorHandle ? ` (@${authorHandle})` : ''}` : authorHandle ? `@${authorHandle}` : '未知作者'
  };
}

function extractMediaFromArticle(article) {
  const media = {
    imageUrls: [],
    imageCount: 0
  };

  if (!article) {
    return media;
  }

  const urls = new Set();
  const images = article.querySelectorAll('img');
  images.forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (!src) {
      return;
    }
    if (src.includes('pbs.twimg.com/media') || img.closest('[data-testid="tweetPhoto"]')) {
      urls.add(src);
    }
  });

  media.imageUrls = Array.from(urls);
  media.imageCount = media.imageUrls.length;
  return media;
}

// ========== 各场景的读取函数 ==========

// 场景1: 帖子详情页 - 读取主帖内容（原有逻辑保留）
function readPostDetail() {
  let postContent = '';
  let debugInfo = [];
  
  // 首先找到主帖子（通过 URL 中的 handle 匹配）
  const article = findMainArticle();
  
  if (!article) {
    return {
      content: '',
      author: extractAuthor(null),
      media: extractMediaFromArticle(null),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      pageType: 'post_detail',
      debug: ['未找到主帖子 article'],
      hasContent: false
    };
  }
  
  // 方法1: 尝试获取推文文本
  const tweetText = article.querySelector('[data-testid="tweetText"]');
  if (tweetText) {
    postContent = tweetText.innerText || tweetText.textContent;
    if (postContent && postContent.trim().length > 0) {
      debugInfo.push('从 tweetText 获取');
    }
  }
  
  // 方法2: 备用获取方式（省略详细逻辑，与原 readPost 一致）
  if (!postContent || postContent.length < 10) {
    const textDivs = article.querySelectorAll('div[data-testid="tweetText"]');
    if (textDivs.length > 0) {
      postContent = textDivs[0].innerText || textDivs[0].textContent;
      if (postContent && postContent.trim().length > 0) {
        debugInfo.push('从 tweetText div 获取');
      }
    }
  }
  
  // 清理内容
  postContent = postContent ? postContent.trim() : '';
  
  return {
    content: postContent,
    author: extractAuthor(article),
    media: extractMediaFromArticle(article),
    url: window.location.href,
    timestamp: new Date().toISOString(),
    pageType: 'post_detail',
    debug: debugInfo,
    hasContent: postContent && postContent.length > 0
  };
}

// 场景2: 首页 - 无特定上下文
function readHomeContext() {
  return {
    content: '',
    author: { name: '', handle: '', displayName: '首页' },
    media: extractMediaFromArticle(null),
    url: window.location.href,
    timestamp: new Date().toISOString(),
    pageType: 'home',
    debug: ['首页无特定帖子上下文'],
    hasContent: false,
    message: '当前在首页，可以创作新推文'
  };
}

// 场景3: 用户主页 - 尝试读取置顶或最新推文
function readProfileContext() {
  let postContent = '';
  let debugInfo = [];
  
  // 查找第一条可见的推文（通常是置顶或最新）
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  if (articles.length > 0) {
    const firstArticle = articles[0];
    const tweetText = firstArticle.querySelector('[data-testid="tweetText"]');
    if (tweetText) {
      postContent = tweetText.innerText || tweetText.textContent;
      debugInfo.push('从用户主页第一条推文获取');
    }
    
    return {
      content: postContent || '',
      author: extractAuthor(firstArticle),
      media: extractMediaFromArticle(firstArticle),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      pageType: 'profile',
      debug: debugInfo,
      hasContent: postContent && postContent.length > 0,
      message: '读取用户主页推文'
    };
  }
  
  // 从 URL 提取用户 handle
  const handleMatch = window.location.pathname.match(/^\/([^\/]+)/);
  const handle = handleMatch ? handleMatch[1] : '';
  
  return {
    content: '',
    author: { name: '', handle: handle, displayName: `@${handle}` },
    media: extractMediaFromArticle(null),
    url: window.location.href,
    timestamp: new Date().toISOString(),
    pageType: 'profile',
    debug: ['未找到推文'],
    hasContent: false,
    message: '用户主页暂无可读取推文'
  };
}

// 场景4: 搜索结果页 - 读取搜索关键词
function readSearchContext() {
  let searchQuery = '';
  
  // 从 URL 参数提取搜索关键词
  const urlParams = new URLSearchParams(window.location.search);
  searchQuery = urlParams.get('q') || '';
  
  // 尝试读取第一条搜索结果
  let firstTweetContent = '';
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  if (articles.length > 0) {
    const tweetText = articles[0].querySelector('[data-testid="tweetText"]');
    if (tweetText) {
      firstTweetContent = tweetText.innerText || tweetText.textContent;
    }
  }
  
  return {
    content: firstTweetContent || `搜索关键词: ${searchQuery}`,
    author: { name: '', handle: '', displayName: '搜索结果' },
    media: articles.length > 0 ? extractMediaFromArticle(articles[0]) : extractMediaFromArticle(null),
    url: window.location.href,
    timestamp: new Date().toISOString(),
    pageType: 'search',
    searchQuery: searchQuery,
    debug: ['从搜索结果页获取'],
    hasContent: !!searchQuery || !!firstTweetContent,
    message: searchQuery ? `搜索: ${searchQuery}` : '搜索结果'
  };
}

// 场景5: 其他页面 - 无上下文
function readOtherContext() {
  return {
    content: '',
    author: { name: '', handle: '', displayName: '其他页面' },
    media: extractMediaFromArticle(null),
    url: window.location.href,
    timestamp: new Date().toISOString(),
    pageType: 'other',
    debug: ['其他页面，无特定上下文'],
    hasContent: false,
    message: '当前页面暂无可读取内容'
  };
}

// ========== 主入口：读取 X 帖子内容（根据场景分发） ==========
function readPost() {
  // ✅ 根据页面类型分发到不同的读取函数
  const pageContext = detectPageContext();
  
  console.log('[XBooster] 检测到页面类型:', pageContext.type, pageContext.label);
  
  switch (pageContext.type) {
    case 'post_detail':
      return readPostDetail();
    
    case 'home':
      return readHomeContext();
    
    case 'profile':
      return readProfileContext();
    
    case 'search':
      return readSearchContext();
    
    default:
      return readOtherContext();
  }
}

// ========== 以下是原有的 readPost 逻辑（已废弃，仅保留以防引用） ==========
function readPost_OLD() {
  let postContent = '';
  let debugInfo = [];
  
  // 首先找到主帖子（通过 URL 中的 handle 匹配）
  const article = findMainArticle();
  
  if (!article) {
    console.warn('XBooster 插件: 未找到主帖子 article');
    return {
      content: '',
      author: extractAuthor(null),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      isPostDetail: isPostDetailPage(),
      debug: ['未找到主帖子 article'],
      hasContent: false
    };
  }
  
  console.log('XBooster 插件: 找到主帖子 article', article);
  
  // 方法1: 尝试获取推文文本（最可靠的方法，只从主帖子中查找）
  const tweetText = article.querySelector('[data-testid="tweetText"]');
  if (tweetText) {
    postContent = tweetText.innerText || tweetText.textContent;
    if (postContent && postContent.trim().length > 0) {
      debugInfo.push('方法1: 从主帖子 tweetText 获取');
    }
  }
  
  // 方法2: 从 article 中查找所有可能的文本内容
  if (!postContent || postContent.length < 10) {
    // 方法2.1: 尝试查找包含推文文本的 div（只从主帖子中）
    const textDivs = article.querySelectorAll('div[data-testid="tweetText"]');
    if (textDivs.length > 0) {
      // 只取第一个，确保是主帖子内容
      const firstTextDiv = textDivs[0];
      postContent = firstTextDiv.innerText || firstTextDiv.textContent;
      if (postContent && postContent.trim().length > 0) {
        debugInfo.push('方法2: 从主帖子 tweetText div 获取');
      }
    }
    
    // 方法2.2: 查找包含推文内容的 span（优先查找较长的文本）
    if (!postContent || postContent.length < 10) {
      const allSpans = article.querySelectorAll('span');
      const texts = [];
      for (const span of allSpans) {
        const text = span.innerText || span.textContent;
        if (text && text.trim().length > 10) { // 提高最小长度要求
          // 排除一些常见的非内容文本
          const isNonContent = text.match(/^(回复|Reply|转推|Retweet|喜欢|Like|分享|Share|·|@[^\s]+\s*$|\d+[mhd]前|\d+分钟前|\d+小时前|\d+天前|^\s*@[^\s]+\s*$)/i);
          // 排除作者信息格式（如 "Eggyrooch @eggyrooch"）
          const isAuthorInfo = text.match(/^[^@]+\s+@[^\s]+$/);
          // 排除纯链接或按钮文本
          const isButtonText = text.match(/^(回复|转推|喜欢|分享|Reply|Retweet|Like|Share)$/i);
          
          if (!isNonContent && !isAuthorInfo && !isButtonText) {
            texts.push(text.trim());
          }
        }
      }
      
      if (texts.length > 0) {
        // 按长度排序，优先选择最长的文本（通常是推文内容）
        texts.sort((a, b) => b.length - a.length);
        // 去重
        const uniqueTexts = [];
        for (const text of texts) {
          if (!uniqueTexts.some(t => t.includes(text) || text.includes(t))) {
            uniqueTexts.push(text);
          }
        }
        // 选择最长的文本作为主要内容
        postContent = uniqueTexts[0];
        if (postContent.length > 10) {
          debugInfo.push('方法3: 从 article spans 获取（选择最长文本）');
        }
      }
    }
    
    // 方法2.3: 从 lang 属性元素中提取
    if (!postContent || postContent.length < 10) {
      const langElements = article.querySelectorAll('[lang]');
      const texts = Array.from(langElements)
        .map(el => el.innerText || el.textContent)
        .filter(text => text && text.trim().length > 5)
        .filter((text, index, arr) => arr.indexOf(text) === index);
      
      if (texts.length > 0) {
        postContent = texts.join('\n\n');
        debugInfo.push('方法4: 从 lang 元素获取');
      }
    }
  }
  
  // 方法4: 从页面元数据获取
  if (!postContent || postContent.length < 10) {
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      const desc = metaDescription.getAttribute('content');
      if (desc && desc.length > 10) {
        postContent = desc;
        debugInfo.push('方法5: 从 meta description 获取');
      }
    }
  }
  
  // 方法5: 从 Open Graph 标签获取
  if (!postContent || postContent.length < 10) {
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      const desc = ogDescription.getAttribute('content');
      if (desc && desc.length > 10) {
        postContent = desc;
        debugInfo.push('方法6: 从 og:description 获取');
      }
    }
  }
  
  // 清理内容
  postContent = postContent ? postContent.trim() : '';
  
  // 如果仍然没有内容，尝试从页面可见文本中提取（最后手段）
  if (!postContent || postContent.length < 10) {
    // 查找主内容区域
    const mainContent = document.querySelector('main') || document.querySelector('[role="main"]');
    if (mainContent) {
      const bodyText = mainContent.innerText || mainContent.textContent;
      // 尝试提取较长的文本段落
      const paragraphs = bodyText.split('\n').filter(p => p.trim().length > 20);
      if (paragraphs.length > 0) {
        postContent = paragraphs.slice(0, 3).join('\n\n');
        debugInfo.push('方法7: 从 main 区域提取');
      }
    }
  }
  
  // 提取作者信息（传入 article 确保从同一个帖子提取）
  const author = extractAuthor(article);
  
  return {
    content: postContent,
    author: author,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    isPostDetail: isPostDetailPage(),
    debug: debugInfo,
    hasContent: postContent && postContent.length > 0
  };
}

// ✅ 重构：检测页面变化并通知 background（移除页面限制）
function checkPageAndNotify() {
  const pageContext = detectPageContext();
  
  // 已取消徽标更新，避免在图标上叠加任何标记
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // ping 检查，用于确认 content script 已加载
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
    return true;
  }
  
  if (request.action === 'readPost') {
    try {
      const result = readPost();
      sendResponse(result);
    } catch (error) {
      console.error('读取帖子失败:', error);
      sendResponse({ error: error.message, content: '', author: { displayName: '未知' } });
    }
    return true;
  }
  
  if (request.action === 'checkPage') {
    try {
      const pageContext = detectPageContext();
      const postInfo = pageContext.canRead ? readPost() : null;
      
      sendResponse({
        isPostPage: pageContext.type === 'post_detail', // 兼容旧逻辑
        pageContext: pageContext, // ✅ 新增：页面上下文
        author: postInfo ? postInfo.author : null,
        hasContent: postInfo ? postInfo.hasContent : false
      });
    } catch (error) {
      console.error('检查页面失败:', error);
      sendResponse({
        isPostPage: false,
        pageContext: { type: 'error', label: '检测失败', canRead: false, icon: '❌' }
      });
    }
    return true;
  }
  
  // 默认响应
  sendResponse({ error: 'Unknown action' });
  return true;
});

// 等待元素出现的辅助函数
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// 页面加载完成后检测并通知
function initPageCheck() {
  console.log('XBooster 插件: 初始化页面检测');
  
  // 如果是帖子详情页，等待内容加载
  if (isPostDetailPage()) {
    // 等待推文内容加载
    waitForElement('[data-testid="tweetText"], article[data-testid="tweet"]', 3000)
      .then(() => {
        setTimeout(() => {
          checkPageAndNotify();
        }, 500);
      })
      .catch(() => {
        // 即使没找到元素也尝试检查
        setTimeout(() => {
          checkPageAndNotify();
        }, 1000);
      });
  } else {
    checkPageAndNotify();
  }
  
  // 监听 URL 变化（X 使用 SPA，URL 变化不会重新加载页面）
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // 只在检测到帖子详情页时输出日志
      if (isPostDetailPage()) {
        console.log('XBooster 插件: 检测到帖子详情页', url);
      }
      // 延迟一下，等待页面内容加载
      setTimeout(() => {
        if (isPostDetailPage()) {
          waitForElement('[data-testid="tweetText"], article[data-testid="tweet"]', 2000)
            .then(() => {
              setTimeout(checkPageAndNotify, 500);
            })
            .catch(() => {
              setTimeout(checkPageAndNotify, 1000);
            });
        } else {
          checkPageAndNotify();
        }
      }, 300);
    }
  });
  
  urlObserver.observe(document, { subtree: true, childList: true });
  
  // 也监听 popstate 事件（浏览器前进后退）
  window.addEventListener('popstate', () => {
    setTimeout(() => {
      if (isPostDetailPage()) {
        waitForElement('[data-testid="tweetText"], article[data-testid="tweet"]', 2000)
          .then(() => {
            setTimeout(checkPageAndNotify, 500);
          })
          .catch(() => {
            setTimeout(checkPageAndNotify, 1000);
          });
      } else {
        checkPageAndNotify();
      }
    }, 300);
  });
}

// 页面加载完成后，可以添加一些辅助功能
function init() {
  console.log('XBooster 插件已加载，当前 URL:', window.location.href);
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initPageCheck, 500);
    });
  } else {
    // 如果页面已经加载完成，延迟一下确保内容渲染完成
    setTimeout(initPageCheck, 1000);
  }
}

// 立即执行初始化
init();
