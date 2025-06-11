# ExtensionNotification API 使用指南

这个API允许其他网页和油猴脚本使用新标签页扩展的通知功能。

## 功能特性

- ✅ 多种通知类型（信息、成功、警告、错误）
- ✅ 自定义显示时间
- ✅ 加载指示器支持
- ✅ 进度更新功能
- ✅ 安全的跨页面调用
- ✅ 油猴脚本兼容

## 基本用法

### 1. 检查API是否可用

```javascript
if (window.ExtensionNotification && window.ExtensionNotification.isAvailable()) {
    console.log('扩展通知API可用');
} else {
    console.log('扩展通知API不可用');
}
```

### 2. 显示基本通知

```javascript
// 信息通知
window.ExtensionNotification.info('提示', '这是一条信息通知');

// 成功通知
window.ExtensionNotification.success('成功', '操作完成！');

// 警告通知
window.ExtensionNotification.warning('警告', '请注意这个问题');

// 错误通知
window.ExtensionNotification.error('错误', '出现了错误');
```

### 3. 自定义通知

```javascript
window.ExtensionNotification.notify({
    title: '自定义通知',
    message: '这是一条自定义通知',
    type: 'info',
    duration: 5000, // 5秒后自动关闭
    buttons: [
        {
            text: '确定',
            callback: () => console.log('点击了确定')
        },
        {
            text: '取消',
            callback: () => console.log('点击了取消')
        }
    ]
});
```

### 4. 加载指示器

```javascript
// 显示加载指示器
const loading = await window.ExtensionNotification.showLoading('正在处理...');

// 更新进度
await loading.updateProgress(50, '处理中... 50%');

// 模拟处理过程
setTimeout(async () => {
    await loading.updateProgress(100, '处理完成');
    setTimeout(() => {
        loading.hide(); // 隐藏加载指示器
    }, 1000);
}, 2000);
```

## 油猴脚本示例

```javascript
// ==UserScript==
// @name         使用扩展通知API
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  演示如何在油猴脚本中使用扩展通知API
// @author       You
// @match        https://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    // 等待API准备就绪
    function waitForAPI(callback) {
        if (window.ExtensionNotification && window.ExtensionNotification.isAvailable()) {
            callback();
        } else {
            // 监听API准备就绪事件
            document.addEventListener('extensionNotificationReady', callback, { once: true });
            
            // 超时处理
            setTimeout(() => {
                if (!window.ExtensionNotification) {
                    console.log('扩展通知API未找到，可能扩展未安装');
                }
            }, 3000);
        }
    }
    
    // 使用API
    waitForAPI(async () => {
        console.log('扩展通知API已准备就绪');
        
        // 显示欢迎通知
        await window.ExtensionNotification.info(
            '油猴脚本', 
            `脚本已在 ${window.location.hostname} 上运行`
        );
        
        // 添加页面按钮演示功能
        const button = document.createElement('button');
        button.textContent = '测试扩展通知';
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '10000';
        button.style.padding = '10px';
        button.style.backgroundColor = '#007cba';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        
        button.addEventListener('click', async () => {
            const loading = await window.ExtensionNotification.showLoading('测试中...');
            
            setTimeout(async () => {
                await loading.hide();
                await window.ExtensionNotification.success('测试完成', '扩展通知API工作正常！');
            }, 2000);
        });
        
        document.body.appendChild(button);
    });
})();
```

## 高级用法

### 1. 使用Promise方式

```javascript
window.ExtensionNotification.notify({
    title: '确认操作',
    message: '是否要继续这个操作？',
    type: 'warning',
    duration: 0, // 不自动关闭
    buttons: [
        {
            text: '确定',
            callback: () => {
                // 执行操作
                console.log('用户确认操作');
            }
        },
        {
            text: '取消',
            callback: () => {
                console.log('用户取消操作');
            }
        }
    ]
}).then(result => {
    console.log('通知显示完成', result);
}).catch(error => {
    console.error('通知显示失败', error);
});
```

### 2. 使用postMessage方式（适用于iframe等场景）

```javascript
// 发送通知请求
const requestId = Date.now().toString();
window.postMessage({
    type: 'EXTENSION_NOTIFICATION_REQUEST',
    requestId: requestId,
    options: {
        title: '来自iframe的通知',
        message: '这是通过postMessage发送的通知',
        type: 'info'
    }
}, window.location.origin);

// 监听响应
window.addEventListener('message', (event) => {
    if (event.data?.type === 'EXTENSION_NOTIFICATION_RESPONSE' && 
        event.data?.requestId === requestId) {
        if (event.data.success) {
            console.log('通知发送成功', event.data.data);
        } else {
            console.error('通知发送失败', event.data.error);
        }
    }
});
```

### 3. 检查扩展版本

```javascript
window.ExtensionNotification.getVersion().then(version => {
    console.log('扩展版本:', version);
});
```

## API 参考

### ExtensionNotification.notify(options)

显示自定义通知。

**参数:**
- `options.title` (string): 通知标题
- `options.message` (string): 通知消息
- `options.type` (string): 通知类型，可选值: 'info', 'success', 'warning', 'error'
- `options.duration` (number): 显示时间(毫秒)，0表示不自动关闭
- `options.buttons` (Array): 按钮配置数组

**返回:** Promise

### ExtensionNotification.info/success/warning/error(title, message, duration)

显示特定类型的通知。

**参数:**
- `title` (string): 通知标题
- `message` (string): 通知消息  
- `duration` (number): 显示时间(毫秒)

**返回:** Promise

### ExtensionNotification.showLoading(message)

显示加载指示器。

**参数:**
- `message` (string): 加载消息

**返回:** Promise<Object> - 包含 `hide()` 和 `updateProgress(percent, message)` 方法的控制对象

### ExtensionNotification.isAvailable()

检查API是否可用。

**返回:** boolean

### ExtensionNotification.getVersion()

获取扩展版本。

**返回:** Promise<string>

## 事件

### extensionNotificationReady

当API准备就绪时触发。

```javascript
document.addEventListener('extensionNotificationReady', (event) => {
    console.log('API准备就绪', event.detail);
});
```

## 注意事项

1. **安全性**: API只能在https页面或localhost上使用
2. **权限**: 需要安装对应的浏览器扩展
3. **兼容性**: 支持Chrome、Edge等基于Chromium的浏览器
4. **性能**: 避免频繁调用，建议合并相似的通知

## 常见问题

**Q: API不可用怎么办？**
A: 检查扩展是否已安装并启用，确保页面在https或localhost上运行。

**Q: 在油猴脚本中无法使用？**
A: 确保脚本的@grant设置为none，并等待API准备就绪事件。

**Q: 通知没有显示？**
A: 检查浏览器通知权限，确保扩展有权限显示通知。
