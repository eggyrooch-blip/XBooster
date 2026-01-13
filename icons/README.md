# 图标文件说明

此目录包含以下尺寸的图标文件：

- `icon16.png` - 16x16 像素
- `icon48.png` - 48x48 像素  
- `icon128.png` - 128x128 像素

## 重新生成图标

如果需要重新生成图标，可以运行：

```bash
python3 create-icons.py
```

这将使用 Python PIL 库生成带 "X" 文字的蓝色图标。

## 自定义图标

如果你想使用自定义图标：
1. 准备你的图标设计（建议使用 SVG 格式）
2. 使用在线工具（如 https://www.favicon-generator.org/）生成不同尺寸
3. 将生成的 PNG 文件重命名并替换此目录中的文件
4. 确保文件名分别为：`icon16.png`, `icon48.png`, `icon128.png`
