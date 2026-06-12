// 通知管理模块
import { I18n, Utils, Notification } from '../core/index.js';

export const NotificationManager = {
    /**
     * 创建通知设置项
     * @returns {Array} - 设置项配置数组
     */
    createSettingsItems() {
        return [
            {
                id: 'notification-duration-info',
                label: I18n.getMessage('settingsNotificationDurationInfo', '信息通知显示时间'),
                type: 'range',
                min: 1,
                max: 30,
                step: 0.5,
                getValue: () => {
                    const ms = parseInt(localStorage.getItem('notification-duration-info') || '3000');
                    return ms / 1000; // 转换为秒
                },
                unit: I18n.getMessage('seconds', '秒'),
                description: I18n.getMessage('settingsNotificationDurationInfoDesc', '信息类通知的显示时间'),
                testButton: true,
                resetButton: true,
                defaultValue: 3, // 默认3秒
                testType: 'info',
                onChange: (value) => {
                    this.handleNotificationDurationChange('notification-duration-info', Math.round(value * 1000));
                }
            },
            {
                id: 'notification-duration-success',
                label: I18n.getMessage('settingsNotificationDurationSuccess', '成功通知显示时间'),
                type: 'range',
                min: 1,
                max: 30,
                step: 0.5,
                getValue: () => {
                    const ms = parseInt(localStorage.getItem('notification-duration-success') || '2000');
                    return ms / 1000; // 转换为秒
                },
                unit: I18n.getMessage('seconds', '秒'),
                description: I18n.getMessage('settingsNotificationDurationSuccessDesc', '成功类通知的显示时间'),
                testButton: true,
                resetButton: true,
                defaultValue: 2, // 默认2秒
                testType: 'success',
                onChange: (value) => {
                    this.handleNotificationDurationChange('notification-duration-success', Math.round(value * 1000));
                }
            },
            {
                id: 'notification-duration-warning',
                label: I18n.getMessage('settingsNotificationDurationWarning', '警告通知显示时间'),
                type: 'range',
                min: 1,
                max: 30,
                step: 0.5,
                getValue: () => {
                    const ms = parseInt(localStorage.getItem('notification-duration-warning') || '5000');
                    return ms / 1000; // 转换为秒
                },
                unit: I18n.getMessage('seconds', '秒'),
                description: I18n.getMessage('settingsNotificationDurationWarningDesc', '警告类通知的显示时间'),
                testButton: true,
                resetButton: true,
                defaultValue: 5, // 默认5秒
                testType: 'warning',
                onChange: (value) => {
                    this.handleNotificationDurationChange('notification-duration-warning', Math.round(value * 1000));
                }
            },
            {
                id: 'notification-duration-error',
                label: I18n.getMessage('settingsNotificationDurationError', '错误通知显示时间'),
                type: 'range',
                min: 1,
                max: 30,
                step: 0.5,
                getValue: () => {
                    const ms = parseInt(localStorage.getItem('notification-duration-error') || '8000');
                    return ms / 1000; // 转换为秒
                },
                unit: I18n.getMessage('seconds', '秒'),
                description: I18n.getMessage('settingsNotificationDurationErrorDesc', '错误类通知的显示时间（固定配置）'),
                testButton: true,
                resetButton: true,
                defaultValue: 8, // 默认8秒
                testType: 'error',
                readonly: true, // 错误通知时间为只读，但可以测试
                onChange: (value) => {
                    this.handleNotificationDurationChange('notification-duration-error', Math.round(value * 1000));
                }
            },
            // 外部通知API设置分隔符
            {
                id: 'external-notifications-divider',
                type: 'divider',
                label: I18n.getMessage('externalNotificationsSection', '外部通知API')
            },
            // 外部通知开关
            {
                id: 'external-notifications-enabled',
                label: I18n.getMessage('externalNotificationsEnabled', '启用外部通知API'),
                type: 'toggle',
                getValue: () => {
                    return localStorage.getItem('external-notifications-enabled') !== 'false';
                },
                description: I18n.getMessage('externalNotificationsEnabledDesc', '允许其他网页和油猴脚本使用扩展的通知功能'),
                onChange: (value) => {
                    localStorage.setItem('external-notifications-enabled', value.toString());
                    if (value) {
                        Notification.notify({
                            title: I18n.getMessage('externalNotificationsApiEnabled', '外部通知API已启用'),
                            message: I18n.getMessage('externalNotificationsApiEnabledDesc', '其他网页现在可以使用扩展的通知功能'),
                            type: 'success',
                            duration: 3000
                        });
                    }
                }
            },
            // 外部通知统计信息
            {
                id: 'external-notifications-stats',
                label: I18n.getMessage('externalNotificationsStats', '外部通知统计'),
                type: 'custom',
                description: I18n.getMessage('externalNotificationsStatsDesc', '查看和管理外部通知请求的统计信息'),
                render: (container) => {
                    this.renderExternalNotificationStats(container);
                }
            }
        ];
    },

    /**
     * 处理通知时间设置变化
     * @param {string} settingId - 设置ID
     * @param {number} duration - 持续时间（毫秒）
     */
    handleNotificationDurationChange(settingId, duration) {
        try {
            localStorage.setItem(settingId, duration.toString());
            console.log(`通知时间设置 ${settingId} 已更改为: ${duration}ms`);
        } catch (error) {
            console.error(`保存通知时间设置失败:`, error);
        }
    },

    /**
     * 测试通知功能
     * @param {string} type - 通知类型 ('info', 'success', 'warning', 'error')
     * @param {number} duration - 通知持续时间（毫秒）
     */
    testNotification(type, duration) {
        const messages = {
            'info': I18n.getMessage('testNotificationInfo', '这是一条信息通知'),
            'success': I18n.getMessage('testNotificationSuccess', '这是一条成功通知'),
            'warning': I18n.getMessage('testNotificationWarning', '这是一条警告通知'),
            'error': I18n.getMessage('testNotificationError', '这是一条错误通知')
        };

        const titles = {
            'info': I18n.getMessage('testNotificationTitleInfo', '信息'),
            'success': I18n.getMessage('testNotificationTitleSuccess', '成功'),
            'warning': I18n.getMessage('testNotificationTitleWarning', '警告'),
            'error': I18n.getMessage('testNotificationTitleError', '错误')
        };

        Notification.notify({
            title: titles[type] || I18n.getMessage('testNotification', '测试通知'),
            message: messages[type] || I18n.getMessage('testNotificationDefault', '这是一条测试通知'),
            type: type,
            duration: duration
        });
    },

    /**
     * 获取通知持续时间
     * @param {string} type - 通知类型
     * @returns {number} - 持续时间（毫秒）
     */
    getNotificationDuration(type) {
        const defaultDurations = {
            'info': 3000,
            'success': 2000,
            'warning': 5000,
            'error': 8000
        };

        const storageKey = `notification-duration-${type}`;
        const stored = localStorage.getItem(storageKey);
        
        return stored ? parseInt(stored) : (defaultDurations[type] || 3000);
    },

    /**
     * 创建通知测试按钮
     * @param {string} type - 通知类型
     * @returns {HTMLElement} - 测试按钮元素
     */
    createTestButton(type) {
        const testBtn = Utils.createElement('button', 'btn btn-small btn-info test-notification-btn', {
            type: 'button',
            'data-test-type': type
        }, I18n.getMessage('testNotification', '测试通知'));
        
        testBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const duration = this.getNotificationDuration(type);
            this.testNotification(type, duration);
        });
        
        return testBtn;
    },

    /**
     * 创建重置默认按钮
     * @param {string} settingId - 设置ID
     * @param {number} defaultValue - 默认值（秒）
     * @returns {HTMLElement} - 重置按钮元素
     */
    createResetButton(settingId, defaultValue) {
        const resetBtn = Utils.createElement('button', 'btn btn-small btn-secondary reset-default-btn', {
            type: 'button'
        }, I18n.getMessage('resetDefault', '恢复默认'));
        
        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 设置为默认值（转换为毫秒）
            const msValue = Math.round(defaultValue * 1000);
            this.handleNotificationDurationChange(settingId, msValue);
            
            // 更新UI
            const rangeInput = document.getElementById(settingId);
            const rangeValue = document.querySelector(`#${settingId} + .range-value`);
            
            if (rangeInput) {
                rangeInput.value = defaultValue;
            }
            if (rangeValue) {
                rangeValue.textContent = `${defaultValue.toFixed(1)}${I18n.getMessage('seconds', '秒')}`;
            }
            
            // 显示确认通知
            Notification.notify({
                title: I18n.getMessage('defaultRestored', '已恢复默认'),
                message: `${I18n.getMessage('notificationDuration', '通知时间')}: ${defaultValue.toFixed(1)}${I18n.getMessage('seconds', '秒')}`,
                type: 'success',
                duration: 2000
            });
        });
        
        return resetBtn;
    },

    /**
     * 渲染外部通知统计信息
     * @param {HTMLElement} container - 容器元素
     */
    async renderExternalNotificationStats(container) {
        try {
            // 获取统计数据
            const response = await chrome.runtime.sendMessage({
                action: 'getExternalNotificationStats'
            });

            if (!response.success) {
                container.innerHTML = '<div style="color: #dc3545;">获取统计数据失败</div>';
                return;
            }

            const stats = response.stats;
            
            // 创建统计界面
            const statsContainer = Utils.createElement('div', 'external-notification-stats');
            
            // 总计信息
            const summaryDiv = Utils.createElement('div', 'stats-summary');
            summaryDiv.innerHTML = `
                <div style="margin-bottom: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
                    <strong>总计:</strong> ${stats.totalRequests} 个外部通知请求
                </div>
            `;
            
            // 按域名统计
            if (Object.keys(stats.requestsByDomain).length > 0) {
                const domainsDiv = Utils.createElement('div', 'stats-domains');
                domainsDiv.innerHTML = '<h4 style="margin: 15px 0 10px 0;">按域名统计:</h4>';
                
                const domainsList = Utils.createElement('div', 'domains-list');
                
                Object.entries(stats.requestsByDomain).forEach(([domain, data]) => {
                    const domainItem = Utils.createElement('div', 'domain-item');
                    domainItem.style.cssText = `
                        margin-bottom: 8px; 
                        padding: 8px; 
                        background-color: #ffffff; 
                        border: 1px solid #dee2e6; 
                        border-radius: 4px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    `;
                    
                    const typeStats = Object.entries(data.types)
                        .map(([type, count]) => `${type}: ${count}`)
                        .join(', ');
                    
                    domainItem.innerHTML = `
                        <div>
                            <strong>${domain}</strong><br>
                            <small style="color: #6c757d;">${typeStats}</small>
                        </div>
                        <div style="font-weight: bold; color: #007bff;">${data.count}</div>
                    `;
                    
                    domainsList.appendChild(domainItem);
                });
                
                domainsDiv.appendChild(domainsList);
                statsContainer.appendChild(domainsDiv);
            }
            
            // 最近请求
            if (stats.recentRequests.length > 0) {
                const recentDiv = Utils.createElement('div', 'stats-recent');
                recentDiv.innerHTML = '<h4 style="margin: 15px 0 10px 0;">最近请求:</h4>';
                
                const recentList = Utils.createElement('div', 'recent-list');
                recentList.style.cssText = 'max-height: 200px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 4px;';
                
                stats.recentRequests.forEach((request, index) => {
                    const requestItem = Utils.createElement('div', 'request-item');
                    requestItem.style.cssText = `
                        padding: 6px 8px; 
                        border-bottom: ${index < stats.recentRequests.length - 1 ? '1px solid #e9ecef' : 'none'};
                        font-size: 12px;
                    `;
                    
                    const timeStr = new Date(request.timestamp).toLocaleString();
                    const typeColors = {
                        info: '#17a2b8',
                        success: '#28a745',
                        warning: '#ffc107',
                        error: '#dc3545'
                    };
                    
                    requestItem.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="color: ${typeColors[request.type] || '#6c757d'}; font-weight: bold;">[${request.type}]</span>
                                ${request.domain}
                            </div>
                            <small style="color: #6c757d;">${timeStr}</small>
                        </div>
                    `;
                    
                    recentList.appendChild(requestItem);
                });
                
                recentDiv.appendChild(recentList);
                statsContainer.appendChild(recentDiv);
            }
            
            // 操作按钮
            const actionsDiv = Utils.createElement('div', 'stats-actions');
            actionsDiv.style.cssText = 'margin-top: 15px; display: flex; gap: 10px;';
            
            const refreshBtn = Utils.createElement('button', 'btn btn-sm btn-primary');
            refreshBtn.textContent = '刷新数据';
            refreshBtn.addEventListener('click', () => {
                this.renderExternalNotificationStats(container);
            });
            
            const clearBtn = Utils.createElement('button', 'btn btn-sm btn-danger');
            clearBtn.textContent = '清除统计';
            clearBtn.addEventListener('click', async () => {
                Notification.notify({
                    title: '确认清除',
                    message: '确定要清除所有外部通知统计数据吗？',
                    duration: 0,
                    type: 'confirm',
                    buttons: [
                        {
                            text: '确认',
                            class: 'btn-primary confirm-yes',
                            callback: async () => {
                                try {
                                    await chrome.runtime.sendMessage({
                                        action: 'clearExternalNotificationStats'
                                    });
                                    await this.renderExternalNotificationStats(container);
                                    Notification.notify({
                                        title: '统计数据已清除',
                                        message: '外部通知统计数据已成功清除',
                                        type: 'success',
                                        duration: 2000
                                    });
                                } catch (error) {
                                    console.error('清除统计数据失败:', error);
                                    Notification.notify({
                                        title: '清除失败',
                                        message: '清除统计数据时发生错误',
                                        type: 'error',
                                        duration: 3000
                                    });
                                }
                            }
                        },
                        {
                            text: '取消',
                            class: 'confirm-no',
                            callback: () => {}
                        }
                    ]
                });
            });            const testBtn = Utils.createElement('button', 'btn btn-sm btn-secondary');
            testBtn.textContent = '测试API';
            testBtn.addEventListener('click', () => {
                // 打开测试页面
                window.open('test-notification-api.html', '_blank');
            });
            
            actionsDiv.append(refreshBtn, clearBtn, testBtn);
            statsContainer.appendChild(actionsDiv);
            
            summaryDiv.appendChild(statsContainer);
            container.innerHTML = '';
            container.appendChild(summaryDiv);
            
        } catch (error) {
            console.error('渲染外部通知统计失败:', error);
            container.innerHTML = '<div style="color: #dc3545;">加载统计数据时发生错误</div>';
        }
    },
};
