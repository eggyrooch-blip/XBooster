#!/usr/bin/env python3
"""
生成 Chrome 插件图标
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    """创建指定尺寸的图标"""
    # 创建图像，背景色为 Twitter/X 蓝色
    img = Image.new('RGB', (size, size), color='#1da1f2')
    draw = ImageDraw.Draw(img)
    
    # 尝试使用系统字体，如果失败则使用默认字体
    try:
        # macOS
        font_size = int(size * 0.7)
        try:
            font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', font_size)
        except:
            try:
                # Linux
                font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', font_size)
            except:
                # Windows 或默认
                font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()
    
    # 绘制 "X" 文字（白色）
    text = "X"
    # 获取文字边界框
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # 居中绘制
    x = (size - text_width) / 2 - bbox[0]
    y = (size - text_height) / 2 - bbox[1]
    
    draw.text((x, y), text, fill='white', font=font)
    
    # 保存图像
    img.save(output_path, 'PNG')
    print(f"✓ Created {output_path} ({size}x{size})")

def main():
    """主函数"""
    # 确保 icons 目录存在
    os.makedirs('icons', exist_ok=True)
    
    # 创建不同尺寸的图标
    sizes = [16, 48, 128]
    for size in sizes:
        output_path = f'icons/icon{size}.png'
        create_icon(size, output_path)
    
    print("\n所有图标已生成完成！")

if __name__ == '__main__':
    main()
