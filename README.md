# Obsidian MCP 服务器

一个[MCP (Model Context Protocol)](https://modelcontextprotocol.io)服务器，使AI助手能够与Obsidian仓库交互，提供读取、创建、编辑和管理笔记与标签的工具。

## 警告！

此MCP拥有读写权限。请在使用obsidian-mcp管理笔记前备份您的Obsidian仓库。推荐使用git或其他备份方法。

## 功能

- 读取和搜索仓库中的笔记
- 创建新笔记和目录
- 编辑现有笔记
- 移动和删除笔记
- 管理标签（添加、删除、重命名）
- 搜索仓库内容

## 要求

- Node.js 20或更高版本
- Obsidian仓库

## 安装

### 手动安装

添加到Claude Desktop配置文件：

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
    "mcpServers": {
        "obsidian": {
            "command": "npx",
            "args": ["-y", "obsidian-mcp", "C:\\您的仓库路径"]
        }
    }
}
```

保存配置后重启Claude Desktop。如果连接成功，您应该能看到锤子图标。

如果遇到连接问题，请查看日志：
- Windows: `%APPDATA%\Claude\logs\mcp*.log`

## 可用工具

- `read-note` - 读取笔记内容
- `create-note` - 创建新笔记
- `edit-note` - 编辑现有笔记
- `delete-note` - 删除笔记
- `move-note` - 移动笔记
- `create-directory` - 创建新目录
- `search-vault` - 搜索仓库中的笔记
- `add-tags` - 添加标签
- `remove-tags` - 删除标签
- `rename-tag` - 重命名标签
- `manage-tags` - 列出和组织标签
- `list-available-vaults` - 列出所有可用仓库

## 故障排除

常见问题：

1. **服务器未在Claude Desktop中显示**
   - 检查配置文件语法
   - 确保仓库路径是绝对路径且存在
   - 重启Claude Desktop

2. **权限错误**
   - 确保仓库路径可读/可写
   - 检查仓库中的文件权限

## 许可证

MIT
