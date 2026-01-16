# 批量回复面板 UI 修复总结

## 修复日期
2026-01-16

## 紧急 Bug 修复（2026-01-16 18:00 - 最终修复）

### 🔥 移除自动停止逻辑，保持批处理持续运行

**问题描述**：虽然重试逻辑已经修复（任务重试期间不会停止），但当所有当前任务都完成后，批处理会自动停止，导致无法继续监控和处理新推文。用户体验不佳，看起来像是"莫名其妙被暂停"。

**从日志分析的真实问题**：
1. ✅ 重试期间的保持运行逻辑是正确的（`in_progress` 任务存在时不停止）
2. ✅ 重试2次后进入 fallback 也是正确的
3. ❌ **但是**：当所有任务都完成后（包括 fallback），批处理会自动停止，不再监控新任务

**用户期望的行为**：
- 批处理应该**一直运行**，持续监控页面上的新推文
- 只有用户手动点击"停止"按钮时才停止
- 即使当前所有任务都完成了，也应该保持运行状态，等待新任务

**修复方案**：
移除 `launchNext` 中的自动停止逻辑，让批处理保持运行状态。

**代码位置**：`bulk-reply.js` 第 2237-2242 行

```javascript
if (!next) {
  // 🔥 修复：不自动停止，保持运行状态，继续监控新任务
  // 只有用户手动点击"停止"按钮时才会停止批处理
  return;
}
```

**修复前的逻辑**：
```javascript
if (!next) {
  if (activeCount === 0) {
    const hasMoreTasks = tasks.some((t) => t.status === 'pending' || t.status === 'in_progress');
    if (!hasMoreTasks) {
      finishBatch(); // ❌ 自动停止批处理
    }
  }
  return;
}
```

**修复后的效果**：
- ✅ 批处理启动后会一直运行，持续监控新推文
- ✅ 通过 `startAutoWatch()` 自动检测页面变化，有新推文时自动处理
- ✅ 只有用户手动点击"停止"按钮时才会停止
- ✅ 右上角状态正确显示"待命中"（无任务进行中）或"生成中..."（有任务进行中）

---

## 之前的修复（已包含在最终版本中）

### 🐛 修复：第一次生成失败后批处理错误停止（第2次修复 - 根本原因）

**问题描述**：第一次生成失败并进入重试逻辑时，批处理会错误地自动停止，"开始"按钮变为可用状态（看起来像暂停了）。

**根本原因（深度分析）**：
1. **初次修复不完整**：虽然在 `launchNext` 中检查了 `in_progress` 状态，但重试逻辑中并没有**明确设置**任务状态为 `in_progress`
2. **状态不一致**：在 catch 块中，代码注释说"保持in_progress状态"，但实际上只修改了 `statusLabel`，没有设置 `task.status`
3. **时序问题**：只在 setTimeout **内部**（1秒后）才设置 `task.status = 'in_progress'`，导致在延迟期间任务状态可能不正确

**问题场景**：
1. 第一个任务生成失败，进入 catch 块
2. 设置 `task.statusLabel = '重试中...'`，但**没有设置** `task.status`
3. `activeCount -= 1`（变成0）
4. 调用 `launchNext()`
5. `launchNext` 检查是否有 `in_progress` 任务，但此时任务状态可能不是 `in_progress`！
6. 错误地判断"所有任务已完成"，触发 `finishBatch()`
7. 1秒后，setTimeout 才会设置 `task.status = 'in_progress'` 并重试，但为时已晚

**修复方案（两处）**：

**修复1**：在 `launchNext` 中检查 `in_progress` 任务
```javascript
// bulk-reply.js 第 2228-2239 行
if (!next) {
  if (activeCount === 0) {
    // 检查是否还有待处理或正在重试的任务
    const hasMoreTasks = tasks.some((t) => t.status === 'pending' || t.status === 'in_progress');
    if (!hasMoreTasks) {
      console.log('[XBooster] 所有任务已完成，自动停止');
      finishBatch();
    }
  }
  return;
}
```

**修复2**：在 catch 块中明确设置任务状态（关键修复）
```javascript
// bulk-reply.js 第 2180-2198 行
} catch (error) {
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
  // ... fallback 逻辑
}
```

**关键点**：
- ✅ 在 setTimeout **之前**就设置 `task.status = 'in_progress'`
- ✅ 确保在1秒延迟期间，任务状态正确，不会被错误判断为"已完成"
- ✅ 保持原有的并发控制逻辑（`activeCount` 的加减）

---

## 修复内容

### 1. 刷新按钮释放开始按钮状态 ✅

**问题描述**：点击刷新按钮后，如果之前批处理已停止，开始按钮仍然保持禁用状态。

**修复方案**：
- 在刷新按钮的点击事件中添加状态检查
- 如果当前未运行（`running === false`），自动释放按钮状态
- 确保开始按钮可用，停止按钮禁用

**代码位置**：`bulk-reply.js` 第 762-773 行

```javascript
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
```

---

### 2. 已填入/跳过的任务从待生成列表中移除 ✅

**问题描述**：当用户点击"填入输入框"或"复制"按钮后，任务被标记为"已填入"，但卡片仍然显示在"待处理"列表中，造成视觉混乱。

**修复方案**：
1. 在 `markTaskAsUsed` 函数中，移动任务到"已填入"列表后，从待生成列表中移除该任务行
2. 在 `processTask` 函数开始时，检查任务是否已填入（`status === 'accepted'`），如果是则跳过处理

**代码位置**：
- `bulk-reply.js` 第 197-247 行（`markTaskAsUsed`）
- `bulk-reply.js` 第 2053-2090 行（`processTask` 开始部分）

```javascript
// 在 markTaskAsUsed 末尾添加
// ✅ 新增：移除待生成中的该任务卡片，避免视觉混乱
const pendingList = document.getElementById(STATUS_LIST_ID);
if (pendingList) {
  const oldRow = pendingList.querySelector(`[data-task-id="${task.id}"]`);
  if (oldRow) {
    oldRow.remove();
  }
}
```

```javascript
// 在 processTask 开始添加
// ✅ 防止重复处理：如果已填入，直接返回
if (task.status === 'accepted' && task.retryCount === 0) {
  console.log(`[XBooster] 跳过已填入任务: ${task.id}`);
  activeCount -= 1;
  return;
}
```

---

### 3. 面板日志自动滚动到底部 ✅

**问题描述**：当新任务添加到列表或任务状态更新时，用户需要手动滚动才能看到最新内容。

**修复方案**：
- 在 `renderStatus` 函数中，每次渲染任务状态后，自动将对应列表滚动到底部
- 使用 `setTimeout` 确保 DOM 更新完成后再执行滚动
- 只在列表有滚动条时才执行滚动（`scrollHeight > clientHeight`）

**代码位置**：`bulk-reply.js` 第 1412-1455 行（`renderStatus`）

```javascript
// ✅ 新增：自动滚动到底部（确保最新内容可见）
setTimeout(() => {
  if (targetList.scrollHeight > targetList.clientHeight) {
    targetList.scrollTop = targetList.scrollHeight;
  }
}, 100);
```

---

### 4. 右上角状态显示优化 ✅

**问题描述**：需要确保右上角的小老虎图标旁边的状态文字准确反映当前状态：
- 正在生成时：显示"生成中..."（带动画）
- 未生成时：显示"待命中"

**修复方案**：
1. 在 `updateSummary` 函数中添加注释，明确状态显示逻辑
2. 只有在 `running === true` 且 `runningCount > 0` 时才显示"生成中..."
3. 其他所有情况（未运行、运行但无任务进行中）都显示"待命中"
4. 在 `launchNext` 中，当所有任务完成时自动调用 `finishBatch`，确保状态切换为"待命中"

**代码位置**：
- `bulk-reply.js` 第 1380-1410 行（`updateSummary`）
- `bulk-reply.js` 第 2181-2212 行（`launchNext`）

```javascript
// ✅ 优化：右上角显示状态（始终显示，运行时带动画）
// 只有在真正运行且有任务进行中时才显示"生成中"
if (running && runningCount > 0) {
  header.innerHTML = '<span class="generating-status"><img src="' + TOGGLE_ICON_URL + '" style="width:16px;height:16px;"> 生成中...</span>';
} else {
  // 其他情况（未运行、运行但无任务进行中）都显示"待命中"
  header.innerHTML = '<span class="idle-status"><img src="' + TOGGLE_ICON_URL + '" style="width:16px;height:16px;opacity:0.6;"> 待命中</span>';
}
```

```javascript
// 在 launchNext 中
if (!next) {
  if (activeCount === 0) {
    const hasMorePending = tasks.some((t) => t.status === 'pending');
    if (!hasMorePending) {
      console.log('[XBooster] 所有任务已完成，自动停止');
      // ✅ 自动完成批处理，确保状态更新为"待命中"
      finishBatch();
    }
  }
  return;
}
```

---

## 测试建议

1. **刷新按钮测试**：
   - 启动批处理 → 点击停止 → 点击刷新
   - 验证：开始按钮应该变为可点击状态

2. **已填入任务测试**：
   - 启动批处理，等待生成几条回复
   - 点击"填入输入框"或"复制"按钮
   - 验证：该任务应该从"待处理"列表消失，出现在"已填入"列表

3. **自动滚动测试**：
   - 启动批处理，生成大量回复（>10条）
   - 观察"待处理"、"已填入"、"失败"三个列表
   - 验证：新添加的任务应该自动滚动到可见区域（列表底部）

4. **状态显示测试**：
   - 未启动时：应显示"待命中"（老虎图标半透明）
   - 启动批处理时：应显示"生成中..."（老虎图标带动画）
   - 所有任务完成后：应自动切换为"待命中"

---

## 技术细节

### 防重复机制增强
通过多层防护确保任务不会被重复处理：
1. 任务状态检查（`status === 'done'` 或 `status === 'accepted'`）
2. 推文DOM标记检查（`data-xcomment-batch-done`）
3. 卡片存在性检查（`existingCards.length > 0`）
4. 持久化完成记录（`completedIds` Set）

### 用户体验改进
- **即时反馈**：操作后立即更新UI状态
- **自动化**：减少手动操作，自动滚动、自动停止
- **视觉清晰**：已处理任务从待处理列表移除，减少混乱
- **状态准确**：右上角状态与实际运行状态保持一致

---

## 修改文件
- `bulk-reply.js`（共计 6 处修改）

## 兼容性
- 所有修改向后兼容
- 不影响现有功能
- 无需数据库迁移或存储结构变更
