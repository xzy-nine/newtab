/**
 * 网格系统模块
 * 提供网格定位、吸附和响应式布局功能
 */

import { Notification } from './notification.js';
import { I18n } from './i18n.js';

/**
 * 获取国际化消息或使用默认值
 * @param {string} key - 国际化消息键
 * @param {string} defaultText - 默认文本
 */
function getI18nMessage(key, defaultText) {
    // 如果国际化模块尚未初始化，直接返回默认文本
    if (!I18n.isInitialized) {
        return defaultText;
    }
    return I18n.getMessage(key) || defaultText;
}

/**
 * 网格系统API
 */
export const GridSystem = {
    // 网格系统配置
    gridEnabled: true,       // 默认启用网格
    gridSize: 20,            // 初始网格单元格大小（将被动态计算）
    gridGap: 10,             // 初始网格间隙（将被动态计算）
    snapThreshold: 15,       // 网格吸附阈值
    isDebugMode: false,      // 是否显示网格辅助线
    gridColumnCount: 36,     // 列数，提供精细的水平网格
    gridRowCount: 20,        // 行数，提供精细的垂直网格
    minCellSize: 40,         // 最小单元格大小
    minGridGap: 4,           // 最小网格间隙

    /**
     * 初始化网格系统
     * @returns {Promise<void>}
     */
    async init() {
        try {
            // 加载网格系统设置
            const gridSettings = await chrome.storage.local.get(['widgetGridEnabled', 'widgetGridDebug']);
            this.gridEnabled = gridSettings.widgetGridEnabled !== undefined ? gridSettings.widgetGridEnabled : true;
            this.isDebugMode = gridSettings.widgetGridDebug || false;
            
            // 计算当前视口的网格尺寸
            this.calculateGridDimensions();
            
            // 应用网格调试样式
            this.applyGridStyles();
            
            // 添加窗口大小变化监听器
            window.addEventListener('resize', () => {
                this.calculateGridDimensions();
                this.applyGridStyles();
            });
            
            // 添加页面缩放监听
            window.addEventListener('resize', this.handleZoomChange.bind(this));
            window.visualViewport.addEventListener('resize', this.handleZoomChange.bind(this));
            
            // 初始保存当前缩放比例
            document.body.dataset.previousZoom = window.devicePixelRatio;
            
            // 如果网格调试已启用，显示网格线
            if (this.isDebugMode) {
                document.body.classList.add('show-grid');
                this.updateDebugGrid();
            }
            
            return Promise.resolve();
        } catch (error) {
            console.error('初始化网格系统失败:', error);
            return Promise.reject(error);
        }
    },
    
    /**
     * 计算网格尺寸，考虑页面缩放
     */
    calculateGridDimensions() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const currentZoom = window.devicePixelRatio;
        
        // 基于固定网格列数和行数计算单元格尺寸
        const cellWidth = viewportWidth / this.gridColumnCount;
        const cellHeight = viewportHeight / this.gridRowCount;
        
        // 确保网格间隙不小于最小值，且不超过单元格尺寸的15%
        // 考虑缩放因素调整最小间隙
        const minGapAdjusted = this.minGridGap / currentZoom;
        this.gridGap = Math.max(minGapAdjusted, Math.min(Math.min(cellWidth, cellHeight) * 0.1, 15));
        
        // 计算实际网格单元格尺寸（不含间隙）
        this.gridSize = Math.min(cellWidth, cellHeight) - this.gridGap;
        
        // 储存计算出的网格尺寸和当前缩放比例
        document.body.dataset.gridCellWidth = cellWidth;
        document.body.dataset.gridCellHeight = cellHeight;
        document.body.dataset.gridSize = this.gridSize;
        document.body.dataset.gridGap = this.gridGap;
        document.body.dataset.currentZoom = currentZoom;
        
        // 更新CSS变量
        document.documentElement.style.setProperty('--grid-cell-width', `${cellWidth}px`);
        document.documentElement.style.setProperty('--grid-cell-height', `${cellHeight}px`);
        document.documentElement.style.setProperty('--grid-size', `${this.gridSize}px`);
        document.documentElement.style.setProperty('--grid-gap', `${this.gridGap}px`);
        document.documentElement.style.setProperty('--grid-columns', this.gridColumnCount);
        document.documentElement.style.setProperty('--grid-rows', this.gridRowCount);
        document.documentElement.style.setProperty('--page-zoom', currentZoom);
        
        // 将这些变量同步到widget CSS变量
        document.documentElement.style.setProperty('--widget-grid-cell-size', `${this.gridSize}px`);
        document.documentElement.style.setProperty('--widget-grid-gap', `${this.gridGap}px`);
    },

    /**
     * 应用网格样式
     */
    applyGridStyles() {
        // 更新CSS变量以支持网格显示和定位
        document.documentElement.style.setProperty('--grid-cell-width', `${parseFloat(document.body.dataset.gridCellWidth)}px`);
        document.documentElement.style.setProperty('--grid-cell-height', `${parseFloat(document.body.dataset.gridCellHeight)}px`);
        document.documentElement.style.setProperty('--grid-size', `${this.gridSize}px`);
        document.documentElement.style.setProperty('--grid-gap', `${this.gridGap}px`);
        document.documentElement.style.setProperty('--grid-columns', this.gridColumnCount);
        document.documentElement.style.setProperty('--grid-rows', this.gridRowCount);
        
        // 更新调试网格显示
        if (this.isDebugMode) {
            this.updateDebugGrid();
        }
    },

    /**
     * 更新调试网格显示
     */
    updateDebugGrid() {
        let debugGrid = document.getElementById('debug-grid');
        if (!debugGrid) {
            debugGrid = document.createElement('div');
            debugGrid.id = 'debug-grid';
            debugGrid.className = 'debug-grid';
            document.body.appendChild(debugGrid);
        }
        
        // 清空网格
        debugGrid.innerHTML = '';
        
        const cellWidth = parseFloat(document.body.dataset.gridCellWidth);
        const cellHeight = parseFloat(document.body.dataset.gridCellHeight);
        
        // 创建网格线
        for (let i = 0; i <= this.gridColumnCount; i++) {
            const line = document.createElement('div');
            line.className = 'grid-line vertical';
            line.style.left = `${i * cellWidth}px`;
            line.style.height = '100%';
            debugGrid.appendChild(line);
        }
        
        for (let i = 0; i <= this.gridRowCount; i++) {
            const line = document.createElement('div');
            line.className = 'grid-line horizontal';
            line.style.top = `${i * cellHeight}px`;
            line.style.width = '100%';
            debugGrid.appendChild(line);
        }
    },

    /**
     * 处理页面缩放事件
     * 当页面缩放比例变化时，调整网格
     */
    handleZoomChange() {
        // 检测当前页面缩放比例
        const currentZoom = window.devicePixelRatio;
        
        // 获取之前的缩放比例
        const previousZoom = parseFloat(document.body.dataset.previousZoom) || currentZoom;
        
        // 存储当前缩放比例以供下次比较
        document.body.dataset.previousZoom = currentZoom;
        
        // 如果缩放比例没有变化，不需要调整
        if (Math.abs(previousZoom - currentZoom) < 0.01) return;
        
        // 计算缩放调整系数
        const zoomRatio = currentZoom / previousZoom;
        
        if (this.isDebugMode) {
            console.log(`页面缩放调整: ${previousZoom} -> ${currentZoom}, 比例: ${zoomRatio}`);
        }
        
        // 重新计算网格尺寸
        this.calculateGridDimensions();
        this.applyGridStyles();
        
        // 触发缩放事件，让其他模块可以响应
        document.dispatchEvent(new CustomEvent('grid-zoom-changed', {
            detail: { 
                previousZoom, 
                currentZoom, 
                zoomRatio 
            }
        }));
        
        // 如果启用了调试模式，更新网格线
        if (this.isDebugMode) {
            this.updateDebugGrid();
        }
    },

    /**
     * 切换网格调试模式
     * @param {boolean} enable - 是否启用网格调试
     */
    toggleGridDebug(enable) {
        this.isDebugMode = enable;
        
        if (enable) {
            // 添加网格调试类
            document.body.classList.add('show-grid');
            
            // 更新网格线
            this.updateDebugGrid();
            
            // 显示成功消息
            Notification.notify({
                title: getI18nMessage('gridDebugEnabled', '网格调试已启用'),
                message: getI18nMessage('gridDebugEnabledMessage', '现在您可以看到网格线'),
                type: 'info',
                duration: 2000
            });
        } else {
            // 移除网格调试类
            document.body.classList.remove('show-grid');
            
            // 移除调试网格元素
            const debugGrid = document.getElementById('debug-grid');
            if (debugGrid) {
                debugGrid.remove();
            }
            
            // 显示消息
            Notification.notify({
                title: getI18nMessage('gridDebugDisabled', '网格调试已禁用'),
                message: getI18nMessage('gridDebugDisabledMessage', '网格线已隐藏'),
                type: 'info',
                duration: 2000
            });
        }
        
        // 保存设置
        chrome.storage.local.set({ 'widgetGridDebug': enable });
    },

    /**
     * 切换网格系统
     * @param {boolean} enable - 是否启用网格系统
     */
    toggleGridSystem(enable) {
        this.gridEnabled = enable;
        
        if (enable) {
            // 计算并应用网格
            this.calculateGridDimensions();
            this.applyGridStyles();
            
            // 触发网格启用事件
            document.dispatchEvent(new CustomEvent('grid-system-toggled', {
                detail: { enabled: true }
            }));
            
            // 显示成功消息
            Notification.notify({
                title: getI18nMessage('gridSystemEnabled', '网格系统已启用'),
                message: getI18nMessage('gridSystemEnabledMessage', '元素将吸附到网格'),
                type: 'success',
                duration: 2000
            });
        } else {
            // 触发网格禁用事件
            document.dispatchEvent(new CustomEvent('grid-system-toggled', {
                detail: { enabled: false }
            }));
            
            // 显示消息
            Notification.notify({
                title: getI18nMessage('gridSystemDisabled', '网格系统已禁用'),
                message: getI18nMessage('gridSystemDisabledMessage', '元素将自由放置'),
                type: 'info',
                duration: 2000
            });
        }
        
        // 保存设置
        chrome.storage.local.set({ 'widgetGridEnabled': enable });
    },

    /**
     * 将网格位置转换为像素位置
     * @param {Object} gridPosition - 网格位置对象 {gridX, gridY, gridColumns, gridRows}
     * @returns {Object} 像素位置对象 {left, top, width, height}
     */
    gridToPixelPosition(gridPosition) {
        // 获取当前的网格尺寸
        const cellWidth = parseFloat(document.body.dataset.gridCellWidth) || 
            window.innerWidth / this.gridColumnCount;
        const cellHeight = parseFloat(document.body.dataset.gridCellHeight) || 
            window.innerHeight / this.gridRowCount;

        // 计算像素位置
        const left = gridPosition.gridX * cellWidth;
        const top = gridPosition.gridY * cellHeight;
        const width = gridPosition.gridColumns * cellWidth;
        const height = gridPosition.gridRows * cellHeight;

        return { left, top, width, height };
    },

    /**
     * 将像素位置转换为网格位置
     * @param {number} left - 左侧像素位置
     * @param {number} top - 顶部像素位置
     * @param {number} width - 宽度像素值
     * @param {number} height - 高度像素值
     * @returns {Object} 网格位置对象 {gridX, gridY, gridColumns, gridRows}
     */
    pixelToGridPosition(left, top, width, height) {
        // 获取当前的网格尺寸
        const cellWidth = parseFloat(document.body.dataset.gridCellWidth) || 
            window.innerWidth / this.gridColumnCount;
        const cellHeight = parseFloat(document.body.dataset.gridCellHeight) || 
            window.innerHeight / this.gridRowCount;

        // 计算网格位置
        const gridX = Math.round(left / cellWidth);
        const gridY = Math.round(top / cellHeight);
        const gridColumns = Math.max(1, Math.round(width / cellWidth));
        const gridRows = Math.max(1, Math.round(height / cellHeight));

        return { gridX, gridY, gridColumns, gridRows };
    },

    /**
     * 吸附元素位置到网格
     * @param {HTMLElement} element - 要吸附的元素
     * @param {boolean} animated - 是否使用动画过渡
     * @returns {Object} 吸附后的位置和大小
     */
    snapElementToGrid(element, animated = true) {
        if (!this.gridEnabled) return null;
        
        // 获取当前位置和大小
        const left = parseInt(element.style.left) || 0;
        const top = parseInt(element.style.top) || 0;
        const width = parseInt(element.style.width) || 200;
        const height = parseInt(element.style.height) || 150;
        
        // 转换为网格位置
        const gridPosition = this.pixelToGridPosition(left, top, width, height);
        
        // 再从网格位置转回像素位置进行捕捉
        const snappedPos = this.gridToPixelPosition(gridPosition);
        
        // 应用吸附位置
        if (animated) {
            element.classList.add('grid-snapping');
            setTimeout(() => element.classList.remove('grid-snapping'), 200);
        }
        
        element.style.left = `${snappedPos.left}px`;
        element.style.top = `${snappedPos.top}px`;
        element.style.width = `${snappedPos.width}px`;
        element.style.height = `${snappedPos.height}px`;
        
        // 将网格位置信息存储到元素数据中
        element.dataset.gridX = gridPosition.gridX;
        element.dataset.gridY = gridPosition.gridY;
        element.dataset.gridColumns = gridPosition.gridColumns;
        element.dataset.gridRows = gridPosition.gridRows;
        
        // 返回吸附后的位置
        return snappedPos;
    },
    
    /**
     * 更新元素的网格位置数据
     * @param {HTMLElement} element - 要更新的元素
     */
    updateElementGridData(element) {
        // 获取像素位置
        const left = parseInt(element.style.left) || 0;
        const top = parseInt(element.style.top) || 0;
        const width = parseInt(element.style.width) || 200;
        const height = parseInt(element.style.height) || 150;

        // 转换为网格位置
        const gridPosition = this.pixelToGridPosition(left, top, width, height);

        // 存储网格位置数据
        element.dataset.gridX = gridPosition.gridX;
        element.dataset.gridY = gridPosition.gridY;
        element.dataset.gridColumns = gridPosition.gridColumns;
        element.dataset.gridRows = gridPosition.gridRows;
    },
    
    /**
     * 将元素从网格数据重新定位到屏幕
     * @param {HTMLElement} element - 要重定位的元素 
     */
    repositionElementFromGridData(element) {
        if (!this.gridEnabled) return;
        
        // 获取存储的网格位置
        const gridPosition = {
            gridX: parseInt(element.dataset.gridX) || 0,
            gridY: parseInt(element.dataset.gridY) || 0,
            gridColumns: parseInt(element.dataset.gridColumns) || 1,
            gridRows: parseInt(element.dataset.gridRows) || 1
        };
        
        // 转换为像素位置
        const pixelPosition = this.gridToPixelPosition(gridPosition);
        
        // 应用位置
        element.style.left = `${pixelPosition.left}px`;
        element.style.top = `${pixelPosition.top}px`;
        element.style.width = `${pixelPosition.width}px`;
        element.style.height = `${pixelPosition.height}px`;
    }
};