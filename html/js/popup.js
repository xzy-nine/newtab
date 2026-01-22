/**
 * 优化的扩展弹出页面脚本，负责通知、国际化、标签切换等
 * @class PopupManager
 */

class PopupManager {
    constructor() {
        this.notifications = [];
        this.currentTab = 'notifications';
        this.currentFilter = 'all';
        this.i18n = {};
        this.init();
    }

    /**
     * 初始化弹窗页面
     * @returns {Promise<void>}
     */
    async init() {
        await this.loadI18n();
        this.applyI18n();
        this.setupTabSwitching();
        this.setupEventListeners();
        await this.loadNotifications();
        this.updateBadge();
        this.updateClearButtonText(); // 初始化时设置清除按钮文本
    }

    /**
     * 加载国际化资源
     * @returns {Promise<void>}
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
    }

    /**
     * 获取翻译文本
     * @param {string} key - 翻译键
     * @param {string} [defaultValue] - 默认值
     * @returns {string} 翻译文本
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
                
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
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
        // 清除所有通知 - 更新按钮文本以反映当前筛选器
        const clearButton = document.getElementById('clearAllNotifications');
        clearButton.addEventListener('click', () => {
            this.clearAllNotifications();
        });

        // 筛选器 - 当筛选器改变时更新清除按钮文本
        document.getElementById('filterSelect').addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.renderNotifications();
            this.updateClearButtonText();
        });

        // 打开新标签页
        document.getElementById('openNewTab').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('html/newtab.html') });
            window.close();
        });

        // 监听来自background的通知更新
        chrome.runtime.onMessage.addListener((message) => {
            if (message.action === 'updateNotifications') {
                this.loadNotifications();
            }
        });
    }

    /**
     * 更新清除按钮文本以反映当前筛选器
     */
    updateClearButtonText() {
        const clearButton = document.getElementById('clearAllNotifications');
        const filterSelect = document.getElementById('filterSelect');
        
        if (clearButton && filterSelect) {
            const currentFilterText = filterSelect.options[filterSelect.selectedIndex].text;
            
            switch (this.currentFilter) {
                case 'all':
                    clearButton.textContent = this.getMessage('clearAll', '清除全部');
                    break;
                case 'unread':
                    clearButton.textContent = this.getMessage('clearUnread', '清除未读');
                    break;
                case 'important':
                    clearButton.textContent = this.getMessage('clearImportant', '清除重要');
                    break;                default:
                    clearButton.textContent = this.getMessage('clear', '清除') + currentFilterText;
            }
        }
    }

    /**
     * 从存储中加载通知
     * @returns {Promise<void>}
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
    }

    /**
     * 渲染通知列表
     */
    renderNotifications() {
        const notificationList = document.getElementById('notificationList');
        
        // 根据筛选器过滤通知
        let filteredNotifications = this.notifications;
        if (this.currentFilter === 'unread') {
            filteredNotifications = this.notifications.filter(n => !n.read);
        } else if (this.currentFilter === 'important') {
            filteredNotifications = this.notifications.filter(n => n.type === 'important' || n.type === 'error');
        }

        if (filteredNotifications.length === 0) {
            notificationList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon segoe-icon">&#xE946;</div>
                    <p>${this.getMessage('noNotifications', '暂无通知')}</p>
                </div>
            `;
            return;
        }

        // 按时间倒序排列
        const sortedNotifications = [...filteredNotifications].sort((a, b) => b.timestamp - a.timestamp);
        
        notificationList.innerHTML = sortedNotifications.map(notification => {
            const timeStr = this.formatTime(notification.timestamp);
            const typeIcon = this.getTypeIcon(notification.type);
            const isUnread = !notification.read;
            
            return `
                <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${notification.id}">
                    <div class="notification-meta">
                        <div class="notification-type ${notification.type}">
                            <span>${typeIcon}</span>
                            <span>${this.getTypeLabel(notification.type)}</span>
                        </div>
                        <div class="notification-actions">
                            <span class="notification-time">${timeStr}</span>
                            <button class="notification-delete" data-id="${notification.id}">×</button>
                        </div>
                    </div>
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-message">${notification.message}</div>
                </div>
            `;
        }).join('');

        // 绑定事件
        this.bindNotificationEvents();
    }

    /**
     * 绑定通知项的事件
     */
    bindNotificationEvents() {
        const notificationList = document.getElementById('notificationList');
        
        // 删除按钮事件
        notificationList.querySelectorAll('.notification-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const notificationId = btn.dataset.id;
                this.deleteNotification(notificationId);
            });
        });

        // 通知点击事件（标记为已读）
        notificationList.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const notificationId = item.dataset.id;
                this.markAsRead(notificationId);
            });
        });
    }

    /**
     * 获取通知类型图标
     * @param {string} type - 通知类型
     * @returns {string} 图标
     */
    getTypeIcon(type) {
        const icons = {
            info: '\uE946',
            success: '\uE73E',
            warning: '\uE7BA',
            error: '\uE711',
            important: '\uE730'
        };
        return icons[type] || '\uE946';
    }    /**
     * 获取通知类型标签
     * @param {string} type - 通知类型
     * @returns {string} 标签
     */
    getTypeLabel(type) {
        const labels = {
            info: this.getMessage('info', '信息'),
            success: this.getMessage('success', '成功'),
            warning: this.getMessage('warning', '警告'),
            error: this.getMessage('error', '错误'),
            important: this.getMessage('important', '重要')
        };
        return labels[type] || this.getMessage('info', '信息');
    }

    /**
     * 格式化时间显示
     * @param {number} timestamp - 时间戳
     * @returns {string} 格式化时间
     */
    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
          if (diff < minute) {
            return this.getMessage('timeJustNow', '刚刚');
        } else if (diff < hour) {
            const minutes = Math.floor(diff / minute);
            return this.getMessage('timeMinutesAgo', '$1分钟前').replace('$1', minutes);
        } else if (diff < day) {
            const hours = Math.floor(diff / hour);
            return this.getMessage('timeHoursAgo', '$1小时前').replace('$1', hours);
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
        // 只计算需要显示在徽标中的未读通知
        const unreadCount = this.notifications.filter(n => !n.read && n.showInBadge !== false).length;
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
            badge.style.display = 'flex';
            
            chrome.action.setBadgeText({
                text: unreadCount > 99 ? '99+' : unreadCount.toString()
            });
            chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
        } else {
            badge.style.display = 'none';
            chrome.action.setBadgeText({ text: '' });
        }
    }

    /**
     * 删除单个通知
     * @param {string} notificationId - 通知ID
     * @returns {Promise<void>}
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
     * @param {string} notificationId - 通知ID
     * @returns {Promise<void>}
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
     * @returns {Promise<void>}
     */
    async clearAllNotifications() {
        try {
            let notificationsToKeep = [];
            
            // 根据当前筛选器决定要清除哪些通知
            if (this.currentFilter === 'all') {
                // 清除所有通知
                notificationsToKeep = [];
            } else if (this.currentFilter === 'unread') {
                // 只清除未读通知，保留已读通知
                notificationsToKeep = this.notifications.filter(n => n.read);
            } else if (this.currentFilter === 'important') {
                // 只清除重要和错误通知，保留其他类型
                notificationsToKeep = this.notifications.filter(n => 
                    n.type !== 'important' && n.type !== 'error'
                );
            }
            
            // 更新存储
            await chrome.storage.local.set({ popupNotifications: notificationsToKeep });
            
            // 更新本地状态
            this.notifications = notificationsToKeep;
            this.renderNotifications();
            this.updateBadge();
            
            // 通知background script
            chrome.runtime.sendMessage({ action: 'notificationsCleared' });
            
        } catch (error) {
            console.error('清除通知失败:', error);
        }
    }

    /**
     * 添加新通知（静态方法）
     * @param {Object} notification - 通知对象
     * @returns {Promise<void>}
     */
    static async addNotification(notification) {
        try {
            const result = await chrome.storage.local.get(['popupNotifications']);
            const notifications = result.popupNotifications || [];
            
            const newNotification = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                read: false,
                type: 'info',
                showInBadge: notification.showInBadge !== false, // 默认显示在徽标中
                ...notification
            };
            
            notifications.unshift(newNotification);
            
            // 限制通知数量，只保留最新的90条
            if (notifications.length > 90) {
                notifications.splice(90);
            }
            
            await chrome.storage.local.set({ popupNotifications: notifications });
            
            // 更新徽标 - 只计算需要显示在徽标中的未读通知
            const unreadCount = notifications.filter(n => !n.read && n.showInBadge !== false).length;
            if (unreadCount > 0) {
                chrome.action.setBadgeText({
                    text: unreadCount > 99 ? '99+' : unreadCount.toString()
                });
                chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
            } else {
                chrome.action.setBadgeText({ text: '' });
            }
            
        } catch (error) {
            console.error('添加通知失败:', error);
        }
    }

    /**
     * 标记所有通知为已读（静态方法）
     * @returns {Promise<void>}
     */
    static async markAllAsRead() {
        try {
            const result = await chrome.storage.local.get(['popupNotifications']);
            const notifications = result.popupNotifications || [];
            
            notifications.forEach(n => n.read = true);
            
            await chrome.storage.local.set({ popupNotifications: notifications });
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
