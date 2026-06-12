/**
 * 数据同步模块
 * 提供同步设置项、同步状态、手动/自动同步等功能
 * @module DataSync
 */

// 数据同步模块
import { Utils, I18n, Notification } from './core/index.js';

export const DataSync = {
    /**
     * 创建同步设置项
     * @returns {Array} 设置项配置数组
     */
    createSettingsItems() {
        return [
            {
                id: 'sync-mode',
                label: I18n.getMessage('settingsSyncMode', '同步模式'),
                type: 'radio',
                options: [
                    { value: 'disabled', label: I18n.getMessage('syncModeDisabled', '关闭同步') },
                    { value: 'upload', label: I18n.getMessage('syncModeUpload', '上传到云端') },
                    { value: 'download', label: I18n.getMessage('syncModeDownload', '从云端下载') }
                ],
                getValue: () => localStorage.getItem('sync-mode') || 'disabled',
                description: I18n.getMessage('settingsSyncModeDesc', '选择数据同步方式，避免冲突的单向同步'),
                onChange: (value) => {
                    this.handleSyncModeChange(value);
                }
            },
            {
                id: 'sync-status',
                label: I18n.getMessage('settingsSyncStatus', '同步状态'),
                type: 'custom',
                description: I18n.getMessage('settingsSyncStatusDesc', '显示当前同步状态和最后同步时间'),
                createControl: () => {
                    return this.createSyncStatusDisplay();
                }
            },
            {
                id: 'sync-actions',
                label: I18n.getMessage('settingsSyncActions', '手动同步'),
                type: 'custom',
                description: I18n.getMessage('settingsSyncActionsDesc', '手动执行同步操作'),
                createControl: () => {
                    return this.createSyncActionsPanel();
                }
            },
            {
                id: 'sync-interval',
                label: I18n.getMessage('settingsSyncInterval', '自动同步间隔'),
                type: 'select',
                options: [
                    { value: '0', label: I18n.getMessage('syncIntervalDisabled', '关闭自动同步') },
                    { value: '300', label: I18n.getMessage('syncInterval5min', '5分钟') },
                    { value: '600', label: I18n.getMessage('syncInterval10min', '10分钟') },
                    { value: '1800', label: I18n.getMessage('syncInterval30min', '30分钟') },
                    { value: '3600', label: I18n.getMessage('syncInterval1hour', '1小时') }
                ],
                getValue: () => localStorage.getItem('sync-interval') || '0',
                description: I18n.getMessage('settingsSyncIntervalDesc', '设置自动同步的时间间隔'),
                onChange: (value) => {
                    this.handleSyncIntervalChange(value);
                }
            }
        ];
    },
    /**
     * 处理同步模式变化
     * @param {string} mode 同步模式 ('disabled', 'upload', 'download')
     */
    handleSyncModeChange(mode) {
        try {
            localStorage.setItem('sync-mode', mode);
            
            // 显示通知
            const modeNames = {
                'disabled': I18n.getMessage('syncModeDisabled', '关闭同步'),
                'upload': I18n.getMessage('syncModeUpload', '上传到云端'),
                'download': I18n.getMessage('syncModeDownload', '从云端下载')
            };
            
            Notification.notify({
                title: I18n.getMessage('syncModeChanged', '同步模式已更改'),
                message: `${I18n.getMessage('currentSyncMode', '当前模式')}: ${modeNames[mode]}`,
                type: 'success',
                duration: 2000
            });
            
            // 刷新同步状态显示
            this.refreshSyncStatus();
            
            // 如果开启了同步，启动自动同步
            if (mode !== 'disabled') {
                this.startAutoSync();
            } else {
                this.stopAutoSync();
            }
            
            // 触发设置同步事件
            window.dispatchEvent(new CustomEvent('dataSyncSettingsChanged', { 
                detail: { type: 'syncMode', value: mode } 
            }));
            
        } catch (error) {
            console.error('同步模式更改失败:', error);
            Notification.notify({
                title: I18n.getMessage('error', '错误'),
                message: I18n.getMessage('syncModeChangeFailed', '同步模式更改失败'),
                type: 'error',
                duration: 3000
            });
        }
    },
    /**
     * 处理同步间隔变化
     * @param {string} interval 同步间隔（秒）
     */
    handleSyncIntervalChange(interval) {
        localStorage.setItem('sync-interval', interval);
        
        // 重启自动同步
        const syncMode = localStorage.getItem('sync-mode');
        if (syncMode !== 'disabled') {
            this.startAutoSync();
        }
        
        Notification.notify({
            title: I18n.getMessage('syncIntervalChanged', '同步间隔已更改'),
            message: interval === '0' ? 
                I18n.getMessage('autoSyncDisabled', '自动同步已关闭') :
                I18n.getMessage('autoSyncEnabled', '自动同步已启用'),
            type: 'info',
            duration: 2000
        });
        
        // 触发设置同步事件
        window.dispatchEvent(new CustomEvent('dataSyncSettingsChanged', { 
            detail: { type: 'syncInterval', value: interval } 
        }));
    },
    /**
     * 创建同步状态显示元素
     * @returns {HTMLElement} 同步状态显示元素
     */
    createSyncStatusDisplay() {
        const statusContainer = Utils.createElement('div', 'sync-status-container');
        
        // 状态显示
        const statusDiv = Utils.createElement('div', 'sync-status-info');
        const statusLabel = Utils.createElement('span', 'sync-status-label', {}, I18n.getMessage('syncStatus', '状态') + ': ');
        const statusValue = Utils.createElement('span', 'sync-status-value', { id: 'sync-status-value' });
        statusDiv.append(statusLabel, statusValue);
        
        // 最后同步时间
        const lastSyncDiv = Utils.createElement('div', 'sync-last-time');
        const lastSyncLabel = Utils.createElement('span', 'sync-last-label', {}, I18n.getMessage('lastSyncTime', '最后同步') + ': ');
        const lastSyncValue = Utils.createElement('span', 'sync-last-value', { id: 'sync-last-value' });
        lastSyncDiv.append(lastSyncLabel, lastSyncValue);
        
        statusContainer.append(statusDiv, lastSyncDiv);
        
        // 初始化状态显示
        this.updateSyncStatusDisplay();
        
        return statusContainer;
    },
    /**
     * 创建同步操作面板
     * @returns {HTMLElement} 同步操作面板
     */
    createSyncActionsPanel() {
        const actionsContainer = Utils.createElement('div', 'sync-actions-container');
        
        // 检查云端数据按钮
        const checkBtn = Utils.createElement('button', 'btn btn-info sync-check-btn', {}, 
            I18n.getMessage('checkCloudData', '检查云端数据'));
        checkBtn.addEventListener('click', () => this.checkCloudData());
        
        // 手动上传按钮
        const uploadBtn = Utils.createElement('button', 'btn btn-primary sync-upload-btn', {}, 
            I18n.getMessage('manualUpload', '手动上传'));
        uploadBtn.addEventListener('click', () => this.manualSync('upload'));
        
        // 手动下载按钮
        const downloadBtn = Utils.createElement('button', 'btn btn-secondary sync-download-btn', {}, 
            I18n.getMessage('manualDownload', '手动下载'));
        downloadBtn.addEventListener('click', () => this.manualSync('download'));
        
        // 清除云端数据按钮
        const clearBtn = Utils.createElement('button', 'btn btn-danger sync-clear-btn', {}, 
            I18n.getMessage('clearCloudData', '清除云端数据'));
        clearBtn.addEventListener('click', () => this.clearCloudData());
        
        actionsContainer.append(checkBtn, uploadBtn, downloadBtn, clearBtn);
        
        return actionsContainer;
    },
    /**
     * 更新同步状态显示
     */
    updateSyncStatusDisplay() {
        // 使用更安全的元素查找方式
        const statusValue = document.getElementById('sync-status-value');
        const lastSyncValue = document.getElementById('sync-last-value');
        
        console.log('更新同步状态显示 - 状态元素:', statusValue ? '存在' : '不存在', 
                   '时间元素:', lastSyncValue ? '存在' : '不存在');
        
        if (statusValue) {
            const syncMode = localStorage.getItem('sync-mode') || 'disabled';
            const modeNames = {
                'disabled': I18n.getMessage('syncModeDisabled', '关闭同步'),
                'upload': I18n.getMessage('syncModeUpload', '上传到云端'),
                'download': I18n.getMessage('syncModeDownload', '从云端下载')
            };
            statusValue.textContent = modeNames[syncMode];
            statusValue.className = `sync-status-value sync-${syncMode}`;
            console.log('同步模式已更新:', syncMode);
        }
        
        if (lastSyncValue) {
            const lastSync = localStorage.getItem('last-sync-time');
            console.log('最后同步时间 localStorage值:', lastSync);
            if (lastSync && lastSync !== 'null') {
                try {
                    const date = new Date(parseInt(lastSync));
                    // 检查日期是否有效
                    if (!isNaN(date.getTime())) {
                        lastSyncValue.textContent = date.toLocaleString();
                        console.log('最后同步时间已更新:', date.toLocaleString());
                    } else {
                        lastSyncValue.textContent = I18n.getMessage('never', '从未');
                        console.log('日期无效，显示从未同步');
                    }
                } catch (error) {
                    console.error('解析同步时间失败:', error);
                    lastSyncValue.textContent = I18n.getMessage('never', '从未');
                }
            } else {
                lastSyncValue.textContent = I18n.getMessage('never', '从未');
                console.log('没有同步时间记录，显示从未同步');
            }
        }
    },
    /**
     * 刷新同步状态
     */
    refreshSyncStatus() {
        // 延迟执行，确保DOM元素已经渲染
        setTimeout(() => {
            this.updateSyncStatusDisplay();
        }, 100);
    },
    /**
     * 手动同步
     * @param {string} mode - 同步模式 ('upload' | 'download')
     */
    async manualSync(mode) {
        try {
            Notification.notify({
                title: I18n.getMessage('syncing', '正在同步'),
                message: mode === 'upload' ? 
                    I18n.getMessage('uploadingData', '正在上传数据...') : 
                    I18n.getMessage('downloadingData', '正在下载数据...'),
                type: 'info',
                duration: 2000
            });

            if (mode === 'upload') {
                // 上传到 chrome.storage.sync
                const dataToSync = this.getFilteredLocalStorageData();
                console.log('准备上传的数据:', Object.keys(dataToSync));
                
                // 检查数据大小
                const dataSize = this.calculateDataSize(dataToSync);
                console.log('数据大小:', dataSize, 'bytes');
                
                if (dataSize > 100 * 1024) { // 100KB 限制
                    throw new Error(I18n.getMessage('dataTooLarge', '数据太大，超出云端存储限制（100KB）'));
                }
                
                await chrome.storage.sync.set(dataToSync);
                console.log('数据上传成功');
                
            } else if (mode === 'download') {
                // 从 chrome.storage.sync 获取并应用到 localStorage
                console.log('开始从云端下载数据...');
                const items = await chrome.storage.sync.get(null);
                console.log('从云端获取的数据:', Object.keys(items));
                
                if (Object.keys(items).length === 0) {
                    throw new Error(I18n.getMessage('noCloudData', '云端没有找到数据'));
                }
                
                // 保护本地同步系统状态，避免被下载的数据覆盖
                const protectedKeys = ['sync-mode', 'sync-interval', 'last-sync-time'];
                const protectedValues = {};
                protectedKeys.forEach(key => {
                    const value = localStorage.getItem(key);
                    if (value !== null) {
                        protectedValues[key] = value;
                    }
                });
                
                // 应用数据到 localStorage（排除受保护的键）
                Object.keys(items).forEach(key => {
                    if (!protectedKeys.includes(key)) {
                        localStorage.setItem(key, items[key]);
                        console.log('设置项:', key, '=', items[key]);
                    } else {
                        console.log('跳过受保护的设置项:', key);
                    }
                });
                
                // 恢复受保护的同步系统状态
                Object.keys(protectedValues).forEach(key => {
                    localStorage.setItem(key, protectedValues[key]);
                    console.log('恢复受保护的设置项:', key, '=', protectedValues[key]);
                });
                
                console.log('数据下载并应用成功，同步系统状态已保护');
                
                // 重新加载页面以应用新设置
                setTimeout(() => {
                    location.reload();
                }, 1000);
            }

            // 更新最后同步时间并通知
            localStorage.setItem('last-sync-time', Date.now().toString());
            this.updateSyncStatusDisplay();
            
            // 触发同步状态更新事件
            window.dispatchEvent(new CustomEvent('syncStatusUpdated', { 
                detail: { 
                    type: 'syncComplete', 
                    mode: mode,
                    timestamp: Date.now()
                } 
            }));
            
            Notification.notify({
                title: I18n.getMessage('syncComplete', '同步完成'),
                message: mode === 'upload' ? 
                    I18n.getMessage('uploadComplete', '数据上传完成') : 
                    I18n.getMessage('downloadComplete', '数据下载完成，页面即将刷新'),
                type: 'success',
                duration: 3000
            });
        } catch (error) {
            console.error('手动同步失败:', error);
            let errorMessage = error.message;
            
            // 处理特定的Chrome存储API错误
            if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
                errorMessage = I18n.getMessage('quotaExceeded', '存储配额已满，请减少数据或清理云端数据');
            } else if (error.message && error.message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
                errorMessage = I18n.getMessage('rateLimitExceeded', '操作过于频繁，请稍后再试');
            }
            
            Notification.notify({
                title: I18n.getMessage('syncFailed', '同步失败'),
                message: errorMessage || I18n.getMessage('syncFailed', '同步失败'),
                type: 'error',
                duration: 5000
            });
        }
    },
    /**
     * 清除云端数据
     */
    async clearCloudData() {
        Notification.notify({
            title: I18n.getMessage('confirmDelete', '确认删除'),
            message: I18n.getMessage('confirmClearCloudData', '确定要清除所有云端数据吗？此操作不可撤销。'),
            duration: 0,
            type: 'confirm',
            buttons: [
                {
                    text: I18n.getMessage('confirm', '确认'),
                    class: 'btn-primary confirm-yes',
                    callback: async () => {
                        try {
                            Notification.notify({
                                title: I18n.getMessage('clearingCloudData', '正在清除云端数据'),
                                message: I18n.getMessage('pleaseWait', '请稍候...'),
                                type: 'info',
                                duration: 2000
                            });

                            // 清除 chrome.storage.sync 中的数据
                            await chrome.storage.sync.clear();

                            Notification.notify({
                                title: I18n.getMessage('cloudDataCleared', '云端数据已清除'),
                                message: I18n.getMessage('cloudDataClearComplete', '所有云端数据已清除'),
                                type: 'success',
                                duration: 2000
                            });
                        } catch (error) {
                            console.error('清除云端数据失败:', error);
                            Notification.notify({
                                title: I18n.getMessage('error', '错误'),
                                message: error.message || I18n.getMessage('error', '错误'),
                                type: 'error',
                                duration: 3000
                            });
                        }
                    }
                },
                {
                    text: I18n.getMessage('cancel', '取消'),
                    class: 'confirm-no',
                    callback: () => {}
                }
            ]
        });
    },
    
    /**
     * 获取过滤后的localStorage数据（仅同步重要设置）
     * 注意：不包括同步系统状态，避免下载数据时改变本地同步模式导致数据丢失
     * @returns {Object} 过滤后的数据对象
     */
    getFilteredLocalStorageData() {
        const syncableKeys = [
            // 基础设置（排除同步系统状态）
            'language',
            'theme',
            'background-type',
            'background-color',
            'background-image',
            'grid-columns',
            'grid-rows',
            
            // 搜索引擎设置
            'search-engines',
            'current-engine-index',
            'search-suggestions-enabled',
            
            // AI 设置
            'ai-provider',
            'ai-api-key',
            'ai-model',
            'ai-enabled',
            
            // 小组件设置
            'widgets',
            'widget-positions',
            
            // 时钟设置
            'clock-format',
            'clock-show-seconds',
            'clock-show-date',
            
            // 其他重要设置
            'notification-settings',
            'shortcuts-enabled'
            // 注意：故意排除 'sync-mode', 'sync-interval', 'last-sync-time' 等同步系统状态
            // 避免下载数据时改变本地同步配置导致数据丢失风险
        ];
        
        const dataToSync = {};
        
        syncableKeys.forEach(key => {
            const value = localStorage.getItem(key);
            if (value !== null) {
                dataToSync[key] = value;
            }
        });
        
        return dataToSync;
    },
    
    /**
     * 计算数据大小（字节）
     * @param {Object} data 要计算大小的数据对象
     * @returns {number} 数据大小（字节）
     */
    calculateDataSize(data) {
        const jsonString = JSON.stringify(data);
        return new Blob([jsonString]).size;
    },
    
    /**
     * 检查云端数据状态
     */
    async checkCloudData() {
        try {
            Notification.notify({
                title: I18n.getMessage('checkingCloudData', '检查云端数据'),
                message: I18n.getMessage('pleaseWait', '请稍候...'),
                type: 'info',
                duration: 2000
            });
            
            const items = await chrome.storage.sync.get(null);
            const keys = Object.keys(items);
            const dataSize = this.calculateDataSize(items);
            
            let message;
            if (keys.length === 0) {
                message = I18n.getMessage('noCloudDataFound', '云端没有找到数据');
            } else {
                message = `${I18n.getMessage('cloudDataInfo', '云端数据信息')}:\n` +
                          `${I18n.getMessage('itemCount', '项目数量')}: ${keys.length}\n` +
                          `${I18n.getMessage('dataSize', '数据大小')}: ${(dataSize / 1024).toFixed(2)} KB\n` +
                          `${I18n.getMessage('remainingQuota', '剩余配额')}: ${((100 * 1024 - dataSize) / 1024).toFixed(2)} KB\n\n` +
                          `${I18n.getMessage('dataKeys', '数据项')}:\n${keys.join(', ')}`;
            }
            
            // 使用通知系统显示详细信息
            Notification.notify({
                title: I18n.getMessage('cloudDataInfo', '云端数据信息'),
                message: message,
                type: keys.length > 0 ? 'info' : 'warning',
                duration: 8000, // 较长的显示时间以便阅读详细信息
                buttons: [
                    {
                        text: I18n.getMessage('ok', '确定'),
                        class: 'btn-primary',
                        callback: () => {}
                    }
                ]
            });
            
        } catch (error) {
            console.error('检查云端数据失败:', error);
            Notification.notify({
                title: I18n.getMessage('checkFailed', '检查失败'),
                message: error.message || I18n.getMessage('checkFailed', '检查失败'),
                type: 'error',
                duration: 3000
            });
        }
    },
    /**
     * 获取数据同步在设置中的分类配置
     * @returns {Object} 分类配置对象
     */
    getSettingsCategory() {
        return {
            id: 'data-sync',
            icon: '\uE753',
            title: I18n.getMessage('settingsDataSync', '数据同步'),
            items: this.createSettingsItems()
        };
    },
    /**
     * 启动自动同步
     */
    startAutoSync() {
        this.stopAutoSync(); // 先停止现有的自动同步
        
        const interval = parseInt(localStorage.getItem('sync-interval') || '0');
        if (interval <= 0) return;
        
        this.autoSyncTimer = setInterval(() => {
            const syncMode = localStorage.getItem('sync-mode');
            if (syncMode && syncMode !== 'disabled') {
                this.manualSync(syncMode);
            }
        }, interval * 1000);
        
        console.log(`自动同步已启动，间隔: ${interval}秒`);
    },
    /**
     * 停止自动同步
     */
    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
            console.log('自动同步已停止');
        }
    },
    /**
     * 同步数据同步设置UI
     * 用于同步设置界面与实际系统状态
     */
    syncDataSyncSettings() {
        console.log('开始同步数据同步设置UI');
        
        try {
            // 同步同步模式单选按钮
            const syncModeRadios = document.getElementsByName('sync-mode');
            if (syncModeRadios && syncModeRadios.length > 0) {
                const currentSyncMode = localStorage.getItem('sync-mode') || 'disabled';
                syncModeRadios.forEach(radio => {
                    radio.checked = (radio.value === currentSyncMode);
                });
                console.log('同步设置 - 同步模式:', currentSyncMode);
            }
            
            // 同步自动同步间隔选择器
            const syncIntervalSelect = document.getElementById('sync-interval');
            if (syncIntervalSelect) {
                const currentSyncInterval = localStorage.getItem('sync-interval') || '0';
                syncIntervalSelect.value = currentSyncInterval;
                console.log('同步设置 - 自动同步间隔:', currentSyncInterval);
            }
            
            // 刷新同步状态显示
            this.updateSyncStatusDisplay();
            
            console.log('数据同步设置UI同步完成');
        } catch (error) {
            console.error('同步数据同步设置UI失败:', error);
        }
    },
    /**
     * 初始化数据同步模块
     * 启动自动同步等
     */
    init() {
        console.log('初始化数据同步模块');
        
        // 检查是否需要启动自动同步
        const syncMode = localStorage.getItem('sync-mode');
        if (syncMode && syncMode !== 'disabled') {
            this.startAutoSync();
        }
        
        // 监听设置变化事件
        window.addEventListener('dataSyncSettingsChanged', () => {
            this.syncDataSyncSettings();
        });
        
        // 延迟初始化同步状态显示，确保DOM已经渲染
        setTimeout(() => {
            this.updateSyncStatusDisplay();
        }, 500);
        
        // 监听页面可见性变化，当页面重新可见时更新状态
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                setTimeout(() => {
                    this.updateSyncStatusDisplay();
                }, 100);
            }
        });
    }
};

// 自动同步定时器
DataSync.autoSyncTimer = null;
