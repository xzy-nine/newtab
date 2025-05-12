# newtab
微软应用商店的[xzy新标签页拓展](https://microsoftedge.microsoft.com/addons/detail/xzy%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5%E6%8B%93%E5%B1%95/lpdhbhkcbnhldcpcbocplhgeooabhbme)的开源地址

## 发布说明

### 自动发布流程
提交到main分支后，如果`manifest.json`中的版本号高于最新发布版本，工作流将自动创建新的Release并生成变更日志。

### 手动优化已发布版本的变更日志
如需为已发布的版本手动生成AI优化的变更日志：

1. 前往GitHub仓库的Actions标签
2. 选择"Build and Package"工作流
3. 点击"Run workflow"按钮
4. 在"tag"输入框中输入目标版本的标签（例如：v1.2.3）
5. 点击"Run workflow"开始执行

**注意事项：**
- 已包含AI生成标记的变更日志不会被重复处理
- AI生成的日志会在标题中包含"[AI生成的变更日志摘要]"标记
- 原始提交记录将始终保留在日志底部
