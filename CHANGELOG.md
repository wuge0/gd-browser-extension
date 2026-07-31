# 更新日志 Changelog

本文件记录了项目的所有重要变更。
All notable changes to this project will be documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),

本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [未发布 Unreleased]

### 计划中 Planned
- 从剪贴板批量导入文件
  Batch file import from clipboard
- 自定义下载目录选择
  Custom download directory selection
- 高级过滤规则
  Advanced filtering rules
- 链接历史记录和分析
  Link history and analytics
- ✅ 多语言支持（中文、日文等）
  ✅ Multi-language support (Chinese, Japanese, etc.)

---

## [1.0.0] - 2025-01-XX

### 新增功能 Added

#### 核心功能 Core Features
- ✨ **链接捕获系统**
  **Link Capture System**
  - 自动捕获网页中的可下载链接
    Automatic capture of downloadable links from web pages
  - 支持 `<a>`、`<video>`、`<audio>` 和 `<source>` 标签
    Support for `<a>`, `<video>`, `<audio>`, and `<source>` tags
  - 使用 MutationObserver 检测动态内容
    MutationObserver for dynamic content detection
  - 按文件大小和类型智能过滤
    Smart filtering by file size and type

- 🔗 **右键菜单集成**
  **Context Menu Integration**
  - "使用 GDownload 下载" 用于单个链接
    "Download with GDownload" for individual links
  - "下载页面上的所有链接" 用于批量捕获
    "Download All Links on Page" for batch capture
  - 支持链接、图片、视频和音频
    Support for links, images, videos, and audio

- 💬 **aria2 RPC 通信**
  **aria2 RPC Communication**
  - 通过 WebSocket 直接连接 aria2c
    Direct WebSocket connection to aria2c
  - 实现 JSON-RPC 2.0 协议
    JSON-RPC 2.0 protocol implementation
  - 带指数退避的自动重连
    Automatic reconnection with exponential backoff
  - 请求超时处理（30秒）
    Request timeout handling (30 seconds)

#### 用户界面 User Interface
- 🎨 **弹出窗口界面**
  **Popup Interface**
  - 简洁直观的链接列表显示
    Clean, intuitive link list display
  - 文件类型图标（视频、音频、压缩包、文档等）
    File type icons (Video, Audio, Archive, Document, etc.)
  - 实时文件大小显示
    Real-time file size display
  - 搜索和过滤功能
    Search and filter functionality
  - 复选框批量选择
    Batch selection with checkboxes
  - 连接状态指示器
    Connection status indicator

- ⚙️ **选项页面**
  **Options Page**
  - **通用设置**：自动捕获、通知、自动发送
    **General Settings**: Auto-capture, notifications, auto-send
  - **连接设置**：WebSocket URL、RPC 密钥、连接测试
    **Connection Settings**: WebSocket URL, RPC secret, connection test
  - **链接捕获**：文件类型过滤、URL 黑名单、域名白名单
    **Link Capture**: File type filtering, URL blacklist, domain whitelist
  - **隐私设置**：请求头配置（User-Agent、Referer、Cookie、Authorization）
    **Privacy Settings**: Request header configuration (User-Agent, Referer, Cookie, Authorization)
  - **关于页面**：版本信息、兼容性、资源链接
    **About Page**: Version info, compatibility, resource links

#### 开发者功能 Developer Features
- 📦 **构建系统**
  **Build System**
  - 使用 Vite 5 + CRXJS 实现快速构建
    Vite 5 + CRXJS for fast builds
  - 分别为 Chrome、Firefox 和 Edge 构建
    Separate builds for Chrome, Firefox, and Edge
  - 开发模式热重载
    Hot reload in development mode
  - 启用 TypeScript 严格模式
    TypeScript strict mode enabled

- 🧪 **代码质量**
  **Code Quality**
  - 带 React 规则的 ESLint 配置
    ESLint configuration with React rules
  - Prettier 代码格式化
    Prettier code formatting
  - EditorConfig 保持一致性
    EditorConfig for consistency
  - TypeScript 类型定义
    TypeScript type definitions

#### 文档 Documentation
- 📖 **完整文档**
  **Comprehensive Documentation**
  - 包含安装和使用说明的 README
    README with installation and usage instructions
  - 面向开发者的 CONTRIBUTING 指南
    CONTRIBUTING guide for developers
  - 版本跟踪的 CHANGELOG
    CHANGELOG for version tracking
  - 内联代码注释和 JSDoc
    Inline code comments and JSDoc

### 技术细节 Technical Details

#### 架构 Architecture
- **Manifest V3**：现代 Chrome 扩展规范
  Modern Chrome extension specification
- **React 18**：使用函数组件和 Hooks 的最新 React
  Latest React with functional components and hooks
- **TypeScript**：严格模式的类型安全开发
  Type-safe development with strict mode
- **Zustand**：轻量级状态管理
  Lightweight state management
- **Lucide React**：现代图标库
  Modern icon library

#### 浏览器兼容性 Browser Compatibility
- Chrome 110+
- Firefox 115+
- Edge 110+

#### 依赖项 Dependencies
- react@18.2.0
- zustand@4.4.7
- lucide-react@0.294.0
- @crxjs/vite-plugin@2.0.0-beta.21

### 安全性 Security
- 🔒 仅限本地连接（127.0.0.1）
  Localhost-only connections (127.0.0.1)
- 🔐 RPC 密钥认证
  RPC secret authentication
- 🛡️ 无外部数据传输
  No external data transmission
- 🔑 用户设置的安全存储
  Secure storage for user settings

### 性能 Performance
- ⚡ 大型链接列表的虚拟滚动
  Virtual scrolling for large link lists
- 🚀 防抖搜索输入
  Debounced search input
- 💾 使用 Zustand 的高效状态管理
  Efficient state management with Zustand
- 🔄 延迟连接建立
  Lazy connection establishment

---

## 版本历史 Version History

### 发布时间线 Release Timeline

- **v1.0.0** (2025-01-XX) - 首次公开发布
  Initial public release

### 未来路线图 Future Roadmap

#### v1.1.0（计划中 Planned）
- 从系统自动检测深色模式
  Dark mode auto-detection from system
- 可自定义键盘快捷键
  Customizable keyboard shortcuts
- 弹出窗口中显示下载进度
  Download progress display in popup
- 链接去重
  Link deduplication

#### v1.2.0（计划中 Planned）
- 链接捕获历史
  Link capture history
- 导出/导入捕获的链接
  Export/import captured links
- 高级 URL 模式匹配
  Advanced URL pattern matching
- 自定义 aria2 下载选项
  Custom aria2 download options

#### v2.0.0（未来 Future）
- 自定义过滤器的插件系统
  Plugin system for custom filters
- 设置的云同步
  Cloud sync for settings
- AI 驱动的链接分类
  AI-powered link classification
- 第三方集成的浏览器扩展 API
  Browser extension API for third-party integration

---

## 迁移指南 Migration Guide

### 从 Chrome 扩展 V2 迁移到 V3
### From Chrome Extension V2 to V3

如果从旧版扩展迁移：
If migrating from an older extension:

1. 将 `manifest_version` 更新为 3
   Update `manifest_version` to 3
2. 用 service workers 替换后台页面
   Replace background pages with service workers
3. 更新内容安全策略
   Update content security policy
4. 迁移到 chrome.storage API 用于设置
   Migrate to chrome.storage API for settings

### 配置更改 Configuration Changes

**默认设置**（可在选项中更改）：
**Default settings** (can be changed in Options):
```json
{
  "aria2": {
    "url": "ws://127.0.0.1:16888/jsonrpc",
    "secret": "GDownload_secret",
    "autoConnect": true
  }
}
```

---

## 已知问题 Known Issues

### 当前限制 Current Limitations

- **文件大小检测**：某些服务器不返回 `Content-Length` 头，文件大小可能显示为"未知"
  **File Size Detection**: Some servers don't return `Content-Length` header, file size may show as "Unknown"
- **动态内容**：页面加载后通过 JavaScript 加载的链接可能需要几秒钟才能被捕获
  **Dynamic Content**: Links loaded via JavaScript after page load may take a few seconds to be captured
- **CORS 限制**：无法从具有严格 CORS 策略的页面捕获链接
  **CORS Restrictions**: Cannot capture links from pages with strict CORS policies

### 解决方法 Workarounds

- 文件大小检测：扩展根据文件扩展名估算大小
  For file size detection: Extension estimates size based on file extension
- 动态内容：手动刷新弹出窗口以重新捕获链接
  For dynamic content: Manual refresh of popup to re-capture links
- CORS 限制：使用右键菜单下载单个链接
  For CORS: Use context menu to download individual links

---

## 支持 Support

- **错误报告**：[GitHub Issues](https://github.com/wuge0/GDownload/issues)
  **Bug Reports**: [GitHub Issues](https://github.com/wuge0/GDownload/issues)
- **功能请求**：[GitHub Discussions](https://github.com/wuge0/GDownload/discussions)
  **Feature Requests**: [GitHub Discussions](https://github.com/wuge0/GDownload/discussions)
- **文档**：[用户指南 User Guide](https://github.com/wuge0/GDownload#readme)
  **Documentation**: [User Guide](https://github.com/wuge0/GDownload#readme)

---

**注意**：日期使用 YYYY-MM-DD 格式。所有更改按时间倒序记录（最新的在前）。
**Note**: Dates use YYYY-MM-DD format. All changes are documented in reverse chronological order (newest first).
