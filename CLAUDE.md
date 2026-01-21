# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XBooster is a Chrome browser extension (Manifest V3) that helps users generate AI-powered comments and replies on the X (Twitter) platform. The extension supports single-reply generation, batch processing, intelligent translation, and content filtering based on post engagement potential.

**Target platforms**: `x.com` and `pro.x.com` only

## Development Commands

```bash
# Load extension in Chrome
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select the project root

# No build step required - plain JavaScript project
# Changes to files are reflected after extension reload
```

## Architecture

### Core Components

| File | Purpose |
|------|---------|
| `background.js` | Service Worker handling AI API requests, translation, and extension lifecycle |
| `content.js` | Content script for page context detection and post content extraction |
| `bulk-reply.js` | Floating panel for batch reply generation with concurrent queue processing |
| `x-inline.js` | Injects emotion-aware generate button into X's compose toolbar |
| `popup.js/html/css` | Main extension popup for single reply generation |
| `settings.js/html/css` | Configuration page for API keys, proxy list, prompts, bookmarks |

### Message Passing Flow

```
popup.js/x-inline.js/bulk-reply.js
        ↓
    chrome.runtime.sendMessage()
        ↓
    background.js (Service Worker)
        ↓
    AI API (OpenAI-compatible endpoint)
```

**Key message actions** in background.js:
- `generateTweet` - Generate reply/post using customizable prompt templates
- `generateComment` - Legacy comment generation
- `translate` - Multi-provider translation (Google Translate free API → OpenAI → paid Google API → MyMemory)
- `generatePreview` - Prompt testing in settings

### Content Script Context Detection

`content.js` detects page types via `detectPageContext()`:
- `post_detail` - Single post view (`/status/` URLs)
- `home` - Timeline
- `profile` - User profile page
- `search` - Search results
- `explore` - Explore page

Each context type has specific content extraction logic.

### Batch Processing (bulk-reply.js)

- Concurrent processing with `MAX_CONCURRENCY = 2`
- Auto-refresh timer (`AUTO_REFRESH_MS = 4000`) for discovering new posts on scroll
- Potential index scoring based on time weight + competition weight
- Completion tracking via `chrome.storage.local` with daily reset
- Auto-like feature after reply insertion

### Storage Strategy

**`chrome.storage.sync`** (8KB limit) - Small configs:
- `aiProvider`, `openaiApiKey`, `openaiModel`, `targetLanguage`
- `currentEmotion`, `includeAuthorHandleInPrompt`, `includeToneInPrompt`
- `proxyList` (array of API endpoints for load balancing)

**`chrome.storage.local`** (larger limit) - Templates:
- `defaultPromptTemplate` - Main reply generation template
- `composePromptTemplate` - New post composition template
- `xcomment_batch_stats` - Daily statistics
- `xcomment_batch_completed` - Completed post IDs cache

### Prompt Template Variables

Templates support these placeholders (double or single braces):
- `{{author_handle}}` - Post author's @handle
- `{{content}}` / `{{reply_content}}` / `{{original_post_text}}` - Post content
- `{{tone}}` / `{{tone_label}}` - Selected emotion tone
- `{{locale}}` - Target language code
- `{{lang_instruction}}` - Language instruction string
- `{{comments_summary}}` - Summary of existing comments

### Emotion System

Defined in `emotions.json` with 8 tones: friendly, professional, curious, humorous, thoughtful, concise, critical, sharing. Current emotion syncs across popup, floating panel, and inline button via `chrome.storage.sync`.

### API Configuration

Supports multiple proxy endpoints with automatic fallback (`requestWithProxyFallback`). Request timeout: 45 seconds. Endpoints are normalized to `/v1/chat/completions` format.

## Key Patterns

- All content scripts use IIFEs to avoid global scope pollution
- DOM queries use `data-testid` attributes specific to X's interface
- URL-based author handle extraction from `/username/status/` pattern
- MutationObserver + popstate listener for SPA navigation handling
- Template variable replacement supports both `{{var}}` and `{var}` syntax
