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
        
        actionsContainer.append(uploadBtn, downloadBtn, clearBtn);
        
        return actionsContainer;
    },
    /**
     * 更新同步状态显示
     */
    updateSyncStatusDisplay() {
        const statusValue = document.getElementById('sync-status-value');
        const lastSyncValue = document.getElementById('sync-last-value');
        
        if (statusValue) {
            const syncMode = localStorage.getItem('sync-mode') || 'disabled';
            const modeNames = {
                'disabled': I18n.getMessage('syncModeDisabled', '关闭同步'),
                'upload': I18n.getMessage('syncModeUpload', '上传到云端'),
                'download': I18n.getMessage('syncModeDownload', '从云端下载')
            };
            statusValue.textContent = modeNames[syncMode];
            statusValue.className = `sync-status-value sync-${syncMode}`;
        }
        
        if (lastSyncValue) {
            const lastSync = localStorage.getItem('last-sync-time');
            if (lastSync) {
                const date = new Date(parseInt(lastSync));
                lastSyncValue.textContent = date.toLocaleString();
            } else {
                lastSyncValue.textContent = I18n.getMessage('never', '从未');
            }
        }
    },
    /**
     * 刷新同步状态
     */
    refreshSyncStatus() {
        this.updateSyncStatusDisplay();
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
            });            if (mode === 'upload') {
                // 上传到 chrome.storage.sync
                const dataToSync = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    dataToSync[key] = localStorage.getItem(key);
                }
                await chrome.storage.sync.set(dataToSync);
            } else if (mode === 'download') {
                // 从 chrome.storage.sync 获取并应用到 localStorage
                const items = await chrome.storage.sync.get(null);
                Object.keys(items).forEach(key => {
                    localStorage.setItem(key, items[key]);
                });
            }

            // 更新最后同步时间并通知
            localStorage.setItem('last-sync-time', Date.now().toString());
            this.updateSyncStatusDisplay();
            Notification.notify({
                title: I18n.getMessage('syncComplete', '同步完成'),
                message: mode === 'upload' ? 
                    I18n.getMessage('uploadComplete', '数据上传完成') : 
                    I18n.getMessage('downloadComplete', '数据下载完成'),
                type: 'success',
                duration: 2000
            });
        } catch (error) {
            console.error('手动同步失败:', error);
            Notification.notify({
                title: I18n.getMessage('syncFailed', '同步失败'),
                message: error.message || I18n.getMessage('syncFailed', '同步失败'),
                type: 'error',
                duration: 3000
            });
        }
    },
    /**
     * 清除云端数据
     */
    async clearCloudData() {
        const confirmed = confirm(I18n.getMessage('confirmClearCloudData', '确定要清除所有云端数据吗？此操作不可撤销。'));
        if (!confirmed) return;

        try {
            Notification.notify({
                title: I18n.getMessage('clearingCloudData', '正在清除云端数据'),
                message: I18n.getMessage('pleaseWait', '请稍候...'),
                type: 'info',
                duration: 2000
            });            // 清除 chrome.storage.sync 中的数据
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
    },
    /**
     * 获取数据同步在设置中的分类配置
     * @returns {Object} 分类配置对象
     */
    getSettingsCategory() {
        return {
            id: 'data-sync',
            icon: '☁️',
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
    }
};

// 自动同步定时器
DataSync.autoSyncTimer = null;
