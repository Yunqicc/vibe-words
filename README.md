# 趣味背单词 · 前端本地存储版（MVP）

这是一个纯前端、无需后端的单词学习小应用。支持：

- 单词卡片学习（翻面、标记认识/模糊/不会）
- 选择题测试（答对升熟悉度，连续错降级）
- 每日任务系统（新词 20 + 自动复习）
- 本地统计与进度图表（`localStorage` 持久化）

## 结构

- `index.html` 页面结构（单页应用）
- `style.css` 基础样式
- `words.js` 简化版 CET-4 示例词库
- `app.js` SPA 路由与业务逻辑（学习/测试/统计）
- `vercel.json` 用于 Vercel 静态部署（所有路径回退到 `index.html`）
- `prd.md` 产品需求文档（MVP 范围与规则）

## 本地预览

任意静态服务器均可，例如：

```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000/
```

## 部署

将仓库接入 Vercel，框架选择 "Other"，构建命令留空，输出目录留空（静态直出）。`vercel.json` 已配置所有路径回退到 `index.html`。
