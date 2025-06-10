/**
 * 扩展弹出页面脚本
 * 处理标签页切换、通知显示和徽标管理
 */

class PopupManager {
    constructor() {
        this.notifications = [];
        this.currentTab = 'notifications';
        this.i18n = {};
        this.init();
    }

    async init() {
        await this.loadI18n();
        this.applyI18n();
        this.setupTabSwitching();
        this.setupEventListeners();
        await this.loadNotifications();
        this.updateBadge();
    }

    /**
     * 加载国际化资源
     */
    async loadI18n() {
        try {
            // 获取当前语言设置
            const result = await chrome.storage.sync.get('language');
            const language = result.language || 'zh';
            const locale = language === 'zh' ? 'zh_CN' : 'en';
            
            // 加载对应的翻译文件
            const response = await fetch(`/_locales/${locale}/messages.json`);
            if (response.ok) {
                this.i18n = await response.json();
            }
        } catch (error) {
            console.error('加载国际化资源失败:', error);
        }
    }

    /**
     * 应用国际化翻译
     */
    applyI18n() {
        // 翻译所有带有 data-i18n 属性的元素
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const message = this.getMessage(key);
            if (message) {
                element.textContent = message;
            }
        });

        // 翻译所有带有 data-i18n-title 属性的元素
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const message = this.getMessage(key);
            if (message) {
                element.setAttribute('title', message);
            }
        });
    }

    /**
     * 获取翻译文本
     */
    getMessage(key, defaultValue = '') {
        return this.i18n[key]?.message || defaultValue;
    }

    /**
     * 设置标签页切换功能
     */
    setupTabSwitching() {
        const tabButtons = document.querySelectorAll('.popup-tab-btn');
        const tabContents = document.querySelectorAll('.popup-tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                
                // 移除所有活动状态
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // 设置当前活动状态
                button.classList.add('active');
                document.getElementById(tabId).classList.add('active');
                
                this.currentTab = tabId;
            });
        });
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 清除所有通知
        document.getElementById('clearAllNotifications').addEventListener('click', () => {
            this.clearAllNotifications();
        });

        // 打开新标签页
        document.getElementById('openNewTab').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('html/newtab.html') });
            window.close();
        });

        // 监听来自background的通知更新
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'updateNotifications') {
                this.loadNotifications();
            }
        });
    }

    /**
     * 从存储中加载通知
     */
    async loadNotifications() {
        try {
            const result = await chrome.storage.local.get(['popupNotifications']);
            this.notifications = result.popupNotifications || [];
            this.renderNotifications();
            this.updateBadge();
        } catch (error) {
            console.error('加载通知失败:', error);
        }
    }    /**
     * 渲染通知列表
     */
    renderNotifications() {
        const notificationList = document.getElementById('notificationList');
        
        if (this.notifications.length === 0) {
            notificationList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>${this.getMessage('noNotifications', '暂无通知')}</p>
                </div>
            `;
            return;
        }

        // 按时间倒序排列
        const sortedNotifications = [...this.notifications].sort((a, b) => b.timestamp - a.timestamp);
        
        notificationList.innerHTML = sortedNotifications.map(notification => {
            const timeStr = this.formatTime(notification.timestamp);
            const typeIcon = this.getTypeIcon(notification.type);
            const isUnread = !notification.read;
            const deleteTooltip = this.getMessage('deleteNotification', '删除此通知');
            
            return `
                <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${notification.id}">
                    <div class="notification-meta">
                        <div class="notification-type ${notification.type}">
                            <span>${typeIcon}</span>
                            <span>${this.getTypeLabel(notification.type)}</span>
                        </div>
                        <div class="notification-actions">
                            <span class="notification-time">${timeStr}</span>
                            <button class="notification-delete" data-id="${notification.id}" title="${deleteTooltip}">×</button>
                        </div>
                    </div>
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-message">${notification.message}</div>
                    ${isUnread ? '<div class="unread-indicator"></div>' : ''}
                </div>
            `;
        }).join('');

        // 绑定删除按钮事件
        notificationList.querySelectorAll('.notification-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const notificationId = btn.dataset.id;
                this.deleteNotification(notificationId);
            });
        });

        // 绑定通知点击事件（标记为已读）
        notificationList.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const notificationId = item.dataset.id;
                this.markAsRead(notificationId);
            });
        });
    }

    /**
     * 获取通知类型图标
     */
    getTypeIcon(type) {
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            loading: '⏳'
        };
        return icons[type] || 'ℹ️';
    }    /**
     * 获取通知类型标签
     */
    getTypeLabel(type) {
        const key = type === 'loading' ? 'loading' : type;
        return this.getMessage(key, {
            info: '信息',
            success: '成功',
            warning: '警告',
            error: '错误',
            loading: '加载'
        }[type] || '信息');
    }

    /**
     * 格式化时间显示
     */
    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        
        if (diff < minute) {
            return this.getMessage('justNow', '刚刚');
        } else if (diff < hour) {
            const minutes = Math.floor(diff / minute);
            const template = this.getMessage('minutesAgo', '{0}分钟前');
            return template.replace('{0}', minutes);
        } else if (diff < day) {
            const hours = Math.floor(diff / hour);
            const template = this.getMessage('hoursAgo', '{0}小时前');
            return template.replace('{0}', hours);
        } else {
            const date = new Date(timestamp);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        }
    }

    /**
     * 更新扩展徽标
     */
    updateBadge() {
        const badge = document.getElementById('notificationBadge');
        const unreadCount = this.notifications.filter(n => !n.read).length;
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
            badge.style.display = 'flex';
            
            // 更新浏览器扩展徽标
            chrome.action.setBadgeText({
                text: unreadCount > 99 ? '99+' : unreadCount.toString()
            });
            chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
        } else {
            badge.style.display = 'none';
            chrome.action.setBadgeText({ text: '' });
        }
    }    /**
     * 删除单个通知
     */
    async deleteNotification(notificationId) {
        try {
            // 从本地数组中移除
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            
            // 更新存储
            await chrome.storage.local.set({ popupNotifications: this.notifications });
            
            // 重新渲染和更新徽标
            this.renderNotifications();
            this.updateBadge();
            
        } catch (error) {
            console.error('删除通知失败:', error);
        }
    }

    /**
     * 标记通知为已读
     */
    async markAsRead(notificationId) {
        try {
            // 更新本地数组
            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification && !notification.read) {
                notification.read = true;
                
                // 更新存储
                await chrome.storage.local.set({ popupNotifications: this.notifications });
                
                // 重新渲染和更新徽标
                this.renderNotifications();
                this.updateBadge();
            }
            
        } catch (error) {
            console.error('标记通知为已读失败:', error);
        }
    }

    /**
     * 清除所有通知
     */
    async clearAllNotifications() {
        try {
            // 清除存储中的通知
            await chrome.storage.local.set({ popupNotifications: [] });
            
            // 更新本地状态
            this.notifications = [];
            this.renderNotifications();
            this.updateBadge();
            
            // 通知background script
            chrome.runtime.sendMessage({ action: 'notificationsCleared' });
        } catch (error) {
            console.error('清除通知失败:', error);
        }
    }

    /**
     * 添加新通知
     */
    static async addNotification(notification) {
        try {
            const result = await chrome.storage.local.get(['popupNotifications']);
            const notifications = result.popupNotifications || [];
            
            const newNotification = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                read: false,
                ...notification
            };
            
            notifications.unshift(newNotification);
            
            // 限制通知数量，只保留最新的50条
            if (notifications.length > 50) {
                notifications.splice(50);
            }
            
            await chrome.storage.local.set({ popupNotifications: notifications });
            
            // 更新徽标
            const unreadCount = notifications.filter(n => !n.read).length;
            chrome.action.setBadgeText({
                text: unreadCount > 99 ? '99+' : unreadCount.toString()
            });
            chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
            
        } catch (error) {
            console.error('添加通知失败:', error);
        }
    }

    /**
     * 标记所有通知为已读
     */
    static async markAllAsRead() {
        try {
            const result = await chrome.storage.local.get(['popupNotifications']);
            const notifications = result.popupNotifications || [];
            
            notifications.forEach(n => n.read = true);
            
            await chrome.storage.local.set({ popupNotifications: notifications });
            
            // 清除徽标
            chrome.action.setBadgeText({ text: '' });
            
        } catch (error) {
            console.error('标记通知为已读失败:', error);
        }
    }
}

// 初始化弹出页面
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
    
    // 当弹出窗口打开时，标记所有通知为已读
    PopupManager.markAllAsRead();
});

// 导出给其他模块使用
window.PopupManager = PopupManager;
