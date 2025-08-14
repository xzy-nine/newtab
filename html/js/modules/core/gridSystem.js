/**
 * 网格系统模块
 * 提供网格定位、吸附和响应式布局功能
 */

import { Notification } from '../notifications/notification.js';
import { I18n } from './i18n.js';
import { Utils } from './utils.js';

/**
 * 获取国际化消息或使用默认值
 * @param {string} key - 国际化消息键
 * @param {string} defaultText - 默认文本
 */
function getI18nMessage(key, defaultText) {
    // 使用统一的国际化方法
    return I18n.getMessage(key, defaultText);
}

/**
 * 网格系统 API
 * @namespace GridSystem
 */
export const GridSystem = {
    // 网格系统配置
    gridEnabled: true,       // 网格系统总是启用
    gridSize: 20,            // 初始网格单元格大小（将被动态计算）
    gridGap: 10,             // 初始网格间隙（将被动态计算）
    snapThreshold: 15,       // 网格吸附阈值（固定值，不可调整）
    isDebugMode: false,      // 是否显示网格辅助线
    gridColumnCount: 45,     // 列数，提供精细的水平网格
    gridRowCount: 30,        // 行数，提供精细的垂直网格
    minCellSize: 10,         // 最小单元格大小（从40减小到20）
    minGridGap: 2,           // 最小网格间隙（从4减小到2）

    // Shift 键吸附功能相关状态
    dragStates: new Map(),   // 存储每个元素的拖拽状态
    isShiftPressed: false,   // 全局 Shift 键状态
    currentDragElement: null, // 当前正在拖拽的元素
    
    /**
     * 初始化网格系统
     * @returns {Promise<void>}
     */    
    async init() {
        try {
            // 将GridSystem暴露到全局作用域
            window.GridSystem = this;
              // 初始化键盘监听
            this._initKeyboardListeners();
            
            // 初始化全局拖拽事件
            this._initGlobalDragEvents();
            
            // 加载网格系统设置
            const gridSettings = await chrome.storage.local.get([
                'widgetGridDebug'
            ]);
            // 网格系统默认启用，不再从存储中读取
            this.gridEnabled = true;
            this.isDebugMode = gridSettings.widgetGridDebug || false;
            // 吸附阈值保持当前默认值，不再从存储中读取
            
            // 计算当前视口的网格尺寸
            this.calculateGridDimensions();
            
            // 应用网格调试样式
            this.applyGridStyles();
            
            // 添加窗口大小变化监听器，使用防抖函数避免频繁触发
            window.addEventListener('resize', this.debounce(() => {
                this.calculateGridDimensions();
                this.applyGridStyles();
                // 触发网格调整事件，让小部件系统能够响应
                document.dispatchEvent(new CustomEvent('grid-dimensions-changed'));
            }, 250));
            
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
            
            console.log('GridSystem 初始化完成并暴露到全局作用域');
            return Promise.resolve();
        } catch (error) {
            console.error('初始化网格系统失败:', error);
            return Promise.reject(error);
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
        const previousZoom = parseFloat(document.body.dataset.previousZoom) || 1;
        
        // 存储当前缩放比例以供下次比较
        document.body.dataset.previousZoom = currentZoom;
        
        // 如果缩放比例没有变化，不需要调整
        if (Math.abs(previousZoom - currentZoom) < 0.01) return;
        
        // 计算缩放调整系数
        const zoomRatio = currentZoom / previousZoom;
        
        if (this.isDebugMode) {
            console.log(`页面缩放调整: ${previousZoom} -> ${currentZoom}, 比例: ${zoomRatio}`);
        }
        
        // 改进的缩放补偿计算 - 增强极端情况下的鲁棒性
        let zoomCompensation;
        
        if (currentZoom > 1) {
            // 放大时使用严格的反比例，但设置上限防止极端情况
            // 限制最小缩放补偿为0.1，防止网格过小导致布局问题
            zoomCompensation = Math.max(0.1, 1 / currentZoom);
        } else {
            // 缩小时使用非线性补偿，但限制最大补偿比例
            // 使用平方根函数使补偿更平滑
            zoomCompensation = Math.min(3, Math.sqrt(1 / currentZoom));
        }
        
        // 存储更精确的缩放补偿系数
        document.body.dataset.zoomCompensation = zoomCompensation.toFixed(6);
        document.body.dataset.currentZoomLevel = currentZoom.toFixed(6);
        
        // 在CSS变量中设置缩放补偿
        document.documentElement.style.setProperty('--zoom-compensation', zoomCompensation);
        document.documentElement.style.setProperty('--inverse-zoom', 1/zoomCompensation);
        
        // 重新计算网格尺寸
        this.calculateGridDimensions();
        this.applyGridStyles();
        
        // 触发缩放事件，让其他模块可以响应
        document.dispatchEvent(new CustomEvent('grid-zoom-changed', {
            detail: { 
                previousZoom, 
                currentZoom, 
                zoomRatio,
                zoomCompensation
            }
        }));
        
        // 如果启用了调试模式，更新网格线
        if (this.isDebugMode) {
            this.updateDebugGrid();
        }
    },

    /**
     * 计算网格尺寸，考虑页面缩放
     */
        /**
     * 计算网格尺寸，考虑页面缩放
     */
    calculateGridDimensions() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const currentZoom = parseFloat(document.body.dataset.currentZoomLevel) || window.devicePixelRatio;
        
        // 获取缩放补偿系数
        const zoomCompensation = parseFloat(document.body.dataset.zoomCompensation) || 1;
        
        // 计算网格最小尺寸 - 防止极端情况下网格过小
        const minCellSize = Math.max(10, this.minCellSize * zoomCompensation); // 减小最小值限制
        
        // 固定网格总数
        const totalGridCells = 2400; // 期望的总网格数
        
        // 计算最佳正方形格子大小 - 更倾向于较小的单元格
        const aspectRatio = viewportWidth / viewportHeight;
        
        // 使用更激进的计算方法
        // 假设列数 = sqrt(totalGridCells * aspectRatio * 1.2)，增加系数让单元格变小
        const optimalColumns = Math.round(Math.sqrt(totalGridCells * aspectRatio * 1.2));
        const optimalRows = Math.round(totalGridCells / optimalColumns);
        
        // 确保单元格是正方形，但允许更小的尺寸
        const cellSize = Math.min(viewportWidth / optimalColumns, viewportHeight / optimalRows) * zoomCompensation;
        
        // 确保格子尺寸不小于最小值
        const finalCellSize = Math.max(minCellSize, cellSize);
        
        // 重新计算能容纳的实际列数和行数
        const effectiveColumnCount = Math.floor(viewportWidth / finalCellSize);
        const effectiveRowCount = Math.floor(viewportHeight / finalCellSize);
        
        // 确保网格间隙不小于最小值，减小间隙占比
        const minGapAdjusted = Math.max(1, this.minGridGap * zoomCompensation);
        this.gridGap = Math.max(minGapAdjusted, Math.min(finalCellSize * 0.08, 10 * zoomCompensation));
        
        // 确保网格单元格尺寸合理
        this.gridSize = finalCellSize - this.gridGap;
        
        // 储存计算出的网格尺寸和当前缩放比例
        document.body.dataset.gridCellWidth = finalCellSize.toFixed(2);
        document.body.dataset.gridCellHeight = finalCellSize.toFixed(2);
        document.body.dataset.gridSize = this.gridSize.toFixed(2);
        document.body.dataset.gridGap = this.gridGap.toFixed(2);
        document.body.dataset.effectiveColumnCount = effectiveColumnCount;
        document.body.dataset.effectiveRowCount = effectiveRowCount;
        
        // 更新CSS变量
        document.documentElement.style.setProperty('--grid-cell-width', `${finalCellSize}px`);
        document.documentElement.style.setProperty('--grid-cell-height', `${finalCellSize}px`);
        document.documentElement.style.setProperty('--grid-size', `${this.gridSize}px`);
        document.documentElement.style.setProperty('--grid-gap', `${this.gridGap}px`);
        document.documentElement.style.setProperty('--grid-columns', effectiveColumnCount);
        document.documentElement.style.setProperty('--grid-rows', effectiveRowCount);
        document.documentElement.style.setProperty('--page-zoom', currentZoom);
        document.documentElement.style.setProperty('--zoom-compensation', zoomCompensation);
        document.documentElement.style.setProperty('--inverse-zoom', 1/zoomCompensation);
        
        // 将这些变量同步到widget CSS变量
        document.documentElement.style.setProperty('--widget-grid-cell-size', `${this.gridSize}px`);
        document.documentElement.style.setProperty('--widget-grid-gap', `${this.gridGap}px`);
        
        // 更新有效网格列数和行数
        this.effectiveColumnCount = effectiveColumnCount;
        this.effectiveRowCount = effectiveRowCount;
        
        // 记录实际网格总数
        const actualTotalCells = effectiveColumnCount * effectiveRowCount;
        document.body.dataset.actualTotalGridCells = actualTotalCells;
        
        if (this.isDebugMode) {
            console.log(`网格系统: ${effectiveColumnCount}x${effectiveRowCount} = ${actualTotalCells} 单元格 (目标: ${totalGridCells})`);
            console.log(`单元格大小: ${finalCellSize.toFixed(2)}px, 间隙: ${this.gridGap.toFixed(2)}px`);
        }
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
    updateDebugGrid() {        let debugGrid = document.getElementById('debug-grid');
        if (!debugGrid) {
            debugGrid = Utils.createElement('div');
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
            const line = Utils.createElement('div');
            line.className = 'grid-line vertical';
            line.style.left = `${i * cellWidth}px`;
            line.style.height = '100%';
            debugGrid.appendChild(line);
        }        
        for (let i = 0; i <= this.gridRowCount; i++) {
            const line = Utils.createElement('div');
            line.className = 'grid-line horizontal';
            line.style.top = `${i * cellHeight}px`;
            line.style.width = '100%';
            debugGrid.appendChild(line);
        }
    },    /**
     * 切换网格调试模式
     * @param {boolean} enable - 是否启用网格调试
     * @returns {Promise<void>}
     */
    toggleGridDebug(enable) {
        return new Promise((resolve) => {
            try {
                this.isDebugMode = enable;
                
                if (enable) {
                    // 添加网格调试类
                    document.body.classList.add('show-grid');
                    
                    // 更新网格线
                    this.updateDebugGrid();
                } else {
                    // 移除网格调试类
                    document.body.classList.remove('show-grid');
                    
                    // 移除调试网格元素
                    const debugGrid = document.getElementById('debug-grid');
                    if (debugGrid) {
                        debugGrid.remove();
                    }
                }
                  // 保存设置
                chrome.storage.local.set({ 'widgetGridDebug': enable }).then(() => {
                    console.log('网格调试设置已保存:', enable);
                    resolve();
                }).catch(error => {
                    console.error('保存网格调试设置失败:', error);
                    resolve();
                });
            } catch (error) {
                console.error('切换网格调试模式失败:', error);
                resolve();
            }
        });
    },    /**
     * 切换网格系统
     * @param {boolean} enable - 是否启用网格系统（现在总是保持启用）
     * @returns {Promise<void>}
     */
    toggleGridSystem(enable) {
        return new Promise((resolve) => {
            try {
                // 网格系统现在总是启用
                this.gridEnabled = true;
                
                // 计算并应用网格
                this.calculateGridDimensions();
                this.applyGridStyles();
                
                // 触发网格启用事件
                document.dispatchEvent(new CustomEvent('grid-system-toggled', {
                    detail: { enabled: true }
                }));
                
                console.log('网格系统保持启用状态');
                resolve();
            } catch (error) {
                console.error('网格系统操作失败:', error);
                resolve();
            }
        });
    },

    /**
     * 设置网格吸附阈值
     * @param {number} threshold - 吸附阈值（像素）
     * @returns {Promise<void>}
     */
    setSnapThreshold(threshold) {
        return new Promise((resolve) => {
            try {
                this.snapThreshold = threshold;
                console.log('网格吸附阈值已更新:', threshold);
                resolve();
            } catch (error) {
                console.error('设置网格吸附阈值失败:', error);
                resolve();
            }
        });
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
        
        // 确保网格位置在合法的边界内
        const validatedPosition = this.validateGridPosition(gridPosition);
        
        // 更新元素的网格数据
        element.dataset.gridX = validatedPosition.gridX;
        element.dataset.gridY = validatedPosition.gridY;
        element.dataset.gridColumns = validatedPosition.gridColumns;
        element.dataset.gridRows = validatedPosition.gridRows;
        
        // 转换为像素位置
        const pixelPosition = this.gridToPixelPosition(validatedPosition);
        
        // 应用位置
        element.style.left = `${pixelPosition.left}px`;
        element.style.top = `${pixelPosition.top}px`;
        element.style.width = `${pixelPosition.width}px`;
        element.style.height = `${pixelPosition.height}px`;
    },

    /**
     * 验证网格位置是否合法
     * @param {Object} gridPosition - 网格位置对象
     * @returns {Object} 调整后的网格位置对象
     */
    validateGridPosition(gridPosition) {
        // 创建一个新对象，避免修改原对象
        const validated = { ...gridPosition };
        
        // 确保列数和行数至少为1
        validated.gridColumns = Math.max(1, Math.min(this.gridColumnCount, validated.gridColumns));
        validated.gridRows = Math.max(1, Math.min(this.gridRowCount, validated.gridRows));
        
        // 确保网格位置不会超出边界
        validated.gridX = Math.max(0, Math.min(validated.gridX, this.gridColumnCount - validated.gridColumns));
        validated.gridY = Math.max(0, Math.min(validated.gridY, this.gridRowCount - validated.gridRows));
        
        return validated;
    },    /**
     * 防抖函数，使用 Utils 中的防抖方法
     * @param {Function} func - 要执行的函数
     * @param {number} wait - 等待时间（毫秒）
     * @returns {Function} 防抖处理后的函数
     */
    debounce(func, wait) {
        return Utils.debounce(func, wait);
    },    /**
     * 从localStorage初始化网格设置
     */
    initializeFromStorage() {
        // 从localStorage恢复网格调试设置
        const storedDebug = localStorage.getItem('grid-debug');
        
        // 网格系统总是启用
        this.gridEnabled = true;
        
        if (storedDebug !== null) {
          this.isDebugMode = storedDebug === 'true';
        }
        
        // 吸附阈值保持默认值
        
        console.log('GridSystem从localStorage恢复设置:', {
          enabled: this.gridEnabled,
          debug: this.isDebugMode,
          threshold: this.snapThreshold
        });
      },

    /**
     * 创建网格系统设置项
     * @returns {Array} - 设置项配置数组
     */    createSettingsItems() {
        return [
            {
                id: 'grid-debug',
                label: I18n.getMessage('settingsGridDebug', '显示网格线'),
                type: 'checkbox',
                getValue: () => this.isDebugMode,
                description: I18n.getMessage('settingsGridDebugDesc', '显示网格辅助线，帮助对齐元素'),
                onChange: async (value) => {
                    this.toggleGridDebug(value);
                    Notification.notify({
                        title: value
                            ? I18n.getMessage('gridDebugEnabled', '网格调试已启用')
                            : I18n.getMessage('gridDebugDisabled', '网格调试已禁用'),
                        message: value
                            ? I18n.getMessage('gridDebugEnabledMessage', '现在您可以看到网格线')
                            : I18n.getMessage('gridDebugDisabledMessage', '网格线已隐藏'),
                        type: 'info',
                        duration: 2000
                    });
                }
            }
        ];
    },

    /**
     * 初始化键盘监听器
     * @private
     */
    _initKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
                this.isShiftPressed = true;
                this._updateDragStates();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                this.isShiftPressed = false;
                this._updateDragStates();
            }
        });

        // 当页面失去焦点时重置键盘状态
        window.addEventListener('blur', () => {
            this.isShiftPressed = false;
            this._updateDragStates();
        });
    },

    /**
     * 更新所有拖拽状态
     * @private
     */
    _updateDragStates() {
        this.dragStates.forEach((dragState, element) => {
            if (dragState.isDragging) {
                dragState.shiftPressed = this.isShiftPressed;
                this._updateElementDragState(element, dragState);
            }
        });
    },

    /**
     * 更新单个元素的拖拽状态
     * @private
     * @param {HTMLElement} element - 目标元素
     * @param {Object} dragState - 拖拽状态对象
     */
    _updateElementDragState(element, dragState) {
        const shouldSnap = dragState.gridSnapEnabled && this.isShiftPressed;
        
        // 更新视觉反馈
        if (shouldSnap) {
            element.classList.add('grid-snapping');
        } else {
            element.classList.remove('grid-snapping');
        }

        // 更新网格提示
        if (dragState.showGridHint) {
            this._updateGridHint(element, shouldSnap);
        }

        // 触发自定义回调
        if (typeof dragState.onShiftStateChange === 'function') {
            dragState.onShiftStateChange(this.isShiftPressed, shouldSnap);
        }
    },

    /**
     * 注册元素的拖拽功能，支持 Shift 键网格吸附
     * @param {HTMLElement} element - 要注册的元素
     * @param {Object} options - 拖拽选项
     * @returns {Object} 拖拽状态对象
     */
    registerDraggable(element, options = {}) {
        const dragState = {
            isDragging: false,
            shiftPressed: false,
            gridSnapEnabled: options.gridSnapEnabled !== false,
            showGridHint: options.showGridHint !== false,
            onDragStart: options.onDragStart,
            onDragMove: options.onDragMove,
            onDragEnd: options.onDragEnd,
            onShiftStateChange: options.onShiftStateChange,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0
        };

        this.dragStates.set(element, dragState);

        const dragHandle = options.dragHandle || element;
        
        // 添加拖拽开始事件
        const startDrag = (e) => {
            if (e.button !== 0) return; // 只响应左键点击
            
            dragState.isDragging = true;
            dragState.shiftPressed = this.isShiftPressed;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            
            // 计算偏移量
            const rect = element.getBoundingClientRect();
            dragState.offsetX = e.clientX - rect.left;
            dragState.offsetY = e.clientY - rect.top;
            
            this.currentDragElement = element;
            
            // 防止文本选择
            e.preventDefault();
            e.stopPropagation();
            
            // 添加拖拽样式
            element.classList.add('dragging');
            document.body.classList.add('grid-dragging');
            
            // 显示网格提示
            if (dragState.showGridHint && this.gridEnabled) {
                this._showGridHint(element);
            }
            
            // 触发开始回调
            if (typeof dragState.onDragStart === 'function') {
                dragState.onDragStart(e, dragState);
            }
        };

        dragHandle.addEventListener('mousedown', startDrag);

        // 返回控制对象
        return {
            setGridSnapEnabled: (enabled) => {
                dragState.gridSnapEnabled = enabled;
            },
            setShowGridHint: (show) => {
                dragState.showGridHint = show;
            },
            destroy: () => {
                this.dragStates.delete(element);
                dragHandle.removeEventListener('mousedown', startDrag);
            }
        };
    },

    /**
     * 初始化全局拖拽移动和结束事件
     * @private
     */
    _initGlobalDragEvents() {
        let lastMoveEvent = null;
        
        document.addEventListener('mousemove', (e) => {
            lastMoveEvent = e;
            if (this.currentDragElement) {
                const dragState = this.dragStates.get(this.currentDragElement);
                if (dragState && dragState.isDragging) {
                    this._handleDragMove(this.currentDragElement, dragState, e);
                }
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.currentDragElement) {
                const dragState = this.dragStates.get(this.currentDragElement);
                if (dragState && dragState.isDragging) {
                    this._handleDragEnd(this.currentDragElement, dragState, e);
                }
            }
        });

        // 防止页面拖拽时选择文本
        document.addEventListener('selectstart', (e) => {
            if (this.currentDragElement) {
                e.preventDefault();
            }
        });
    },

    /**
     * 处理拖拽移动
     * @private
     * @param {HTMLElement} element - 拖拽元素
     * @param {Object} dragState - 拖拽状态
     * @param {MouseEvent} e - 鼠标事件
     */
    _handleDragMove(element, dragState, e) {
        // 更新 Shift 键状态
        dragState.shiftPressed = this.isShiftPressed;
        
        // 计算新位置
        let x = e.clientX - dragState.offsetX;
        let y = e.clientY - dragState.offsetY;
        
        // 应用网格吸附
        if (dragState.gridSnapEnabled && this.isShiftPressed && this.gridEnabled) {
            const snappedPos = this.snapToGrid(x, y, element.offsetWidth, element.offsetHeight);
            x = snappedPos.x;
            y = snappedPos.y;
            
            element.classList.add('grid-snapping');
        } else {
            element.classList.remove('grid-snapping');
        }
        
        // 更新位置
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        
        // 更新网格提示
        if (dragState.showGridHint) {
            this._updateGridHint(element, dragState.gridSnapEnabled && this.isShiftPressed);
        }
        
        // 触发移动回调
        if (typeof dragState.onDragMove === 'function') {
            dragState.onDragMove(e, dragState, { x, y });
        }
    },

    /**
     * 处理拖拽结束
     * @private
     * @param {HTMLElement} element - 拖拽元素
     * @param {Object} dragState - 拖拽状态
     * @param {MouseEvent} e - 鼠标事件
     */
    _handleDragEnd(element, dragState, e) {
        dragState.isDragging = false;
        this.currentDragElement = null;
        
        // 移除拖拽样式
        element.classList.remove('dragging', 'grid-snapping');
        document.body.classList.remove('grid-dragging');
        
        // 最终网格吸附
        if (dragState.gridSnapEnabled && this.isShiftPressed && this.gridEnabled) {
            const currentLeft = parseInt(element.style.left) || 0;
            const currentTop = parseInt(element.style.top) || 0;
            const snappedPos = this.snapToGrid(currentLeft, currentTop, element.offsetWidth, element.offsetHeight);
            
            // 平滑过渡到吸附位置
            element.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
            element.style.left = `${snappedPos.x}px`;
            element.style.top = `${snappedPos.y}px`;
            
            setTimeout(() => {
                element.style.transition = '';
            }, 200);
        }
        
        // 隐藏网格提示
        if (dragState.showGridHint) {
            this._hideGridHint();
        }
        
        // 触发结束回调
        if (typeof dragState.onDragEnd === 'function') {
            dragState.onDragEnd(e, dragState);
        }
    },

    /**
     * 显示网格提示
     * @private
     * @param {HTMLElement} element - 目标元素
     */
    _showGridHint(element) {
        let hint = document.getElementById('grid-hint');
        if (!hint) {
            hint = Utils.createElement('div', 'grid-hint', { id: 'grid-hint' });
            document.body.appendChild(hint);
        }
        
        hint.innerHTML = `
            <div class="grid-hint-content">
                <span class="grid-hint-icon">⊞</span>
                <span class="grid-hint-text">${getI18nMessage('gridSnapHint', '按住 Shift 键进行网格吸附')}</span>
            </div>
        `;
        
        hint.classList.add('visible');
    },

    /**
     * 更新网格提示状态
     * @private
     * @param {HTMLElement} element - 目标元素
     * @param {boolean} isSnapping - 是否正在吸附
     */
    _updateGridHint(element, isSnapping) {
        const hint = document.getElementById('grid-hint');
        if (!hint) return;
        
        const content = hint.querySelector('.grid-hint-content');
        if (!content) return;
        
        if (isSnapping) {
            content.innerHTML = `
                <span class="grid-hint-icon active">⊞</span>
                <span class="grid-hint-text active">${getI18nMessage('gridSnapping', '网格吸附已启用')}</span>
            `;
            hint.classList.add('snapping');
        } else {
            content.innerHTML = `
                <span class="grid-hint-icon">⊞</span>
                <span class="grid-hint-text">${getI18nMessage('gridSnapHint', '按住 Shift 键进行网格吸附')}</span>
            `;
            hint.classList.remove('snapping');
        }
    },

    /**
     * 隐藏网格提示
     * @private
     */
    _hideGridHint() {
        const hint = document.getElementById('grid-hint');
        if (hint) {
            hint.classList.remove('visible', 'snapping');
            setTimeout(() => {
                if (hint.parentNode) {
                    hint.parentNode.removeChild(hint);
                }
            }, 300);
        }
    },

    /**
     * 网格吸附位置计算（不依赖元素）
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标  
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @returns {Object} 吸附后的位置 {x, y}
     */
    snapToGrid(x, y, width, height) {
        if (!this.gridEnabled) {
            return { x, y };
        }
        
        try {
            // 使用网格系统的吸附功能
            const gridPosition = this.pixelToGridPosition(x, y, width, height);
            const snappedPosition = this.gridToPixelPosition(gridPosition);
            
            return {
                x: snappedPosition.left,
                y: snappedPosition.top
            };
        } catch (error) {
            console.warn('网格吸附失败:', error);
            return { x, y };
        }
    },
};

// 确保在模块加载时就暴露到全局
if (typeof window !== 'undefined') {
    window.GridSystem = GridSystem;
}