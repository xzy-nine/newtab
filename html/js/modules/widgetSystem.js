/**
 * 小部件系统模块
 * 提供小部件容器创建、管理和交互功能
 */

import { Utils } from './utils.js';
import { I18n } from './i18n.js';
import { Menu } from './menu.js';
import { Notification } from './notification.js';
import { WidgetRegistry } from './widgetRegistry.js';  // 导入注册中心

// 储存小部件数据和实例
let widgets = [];
let widgetContainers = [];
let dragData = null;
let isInitialized = false;

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

/**,
 * 小部件系统API
 */
export const WidgetSystem = {
    /**
     * 初始化小部件系统
     * @returns {Promise<void>}
     */
    async init() {
        try {          
            // 防止重复初始化
            if (isInitialized) {
                return Promise.resolve();
            }
            
            // 等待100ms，给I18n模块一个初始化的机会
            // 这是一个比较简单的解决方案，防止在主应用初始化过程中太早调用
            if (!I18n.isInitialized) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 加载网格系统设置
            const gridSettings = await chrome.storage.local.get(['widgetGridEnabled', 'widgetGridDebug']);
            this.gridEnabled = gridSettings.widgetGridEnabled !== undefined ? gridSettings.widgetGridEnabled : true;
            this.isDebugMode = gridSettings.widgetGridDebug || false;
            
            // 初始化网格系统
            this.initGridSystem();
            
            // 如果网格调试已启用，显示网格线
            if (this.isDebugMode) {
                document.body.classList.add('show-grid');
                this.updateDebugGrid();
            }
            
            // 加载已保存的小部件数据
            await this.loadWidgets();
            
            // 添加右键菜单项
            this.setupContextMenus();
            
            // 监听小部件数据变更
            document.addEventListener('widget-data-changed', () => {
                this.saveWidgets();
            });
            
            // 添加缩放监听
            window.visualViewport.addEventListener('resize', this.handleZoomChange.bind(this));
            
            // 初始记录缩放比例
            document.body.dataset.previousZoom = window.devicePixelRatio;
            
            isInitialized = true;
            return Promise.resolve();
        } catch (error) {
            console.error('初始化小部件系统失败:', error);
            return Promise.reject(error);
        }
    },
    
    /**
     * 加载已保存的小部件数据
     * @returns {Promise<void>}
     */
    async loadWidgets() {
        // 使用安全的国际化方法
        const loadingMessage = getI18nMessage('loadingWidgets', '加载小部件中...');
        const successMessage = getI18nMessage('widgetsLoaded', '小部件加载完成');
        
        // 使用withLoading替代自行管理加载状态
        return Utils.withLoading(async () => {
            const data = await chrome.storage.local.get('widgets');
            widgets = data.widgets || [];
            
            // 清除现有小部件容器
            widgetContainers.forEach(container => {
                if (document.body.contains(container)) {
                    document.body.removeChild(container);
                }
            });
            widgetContainers = [];
            
            // 为每个保存的小部件容器创建DOM元素
            widgets.forEach(widgetData => {
                this.createWidgetContainer(widgetData);
            });
        }, {
            startMessage: loadingMessage,
            successMessage: successMessage
        });
    },
    
    /**
     * 保存小部件数据到存储
     * @returns {Promise<void>}
     */
    async saveWidgets() {
        try {
            // 只保存必要的数据
            const widgetsToSave = widgetContainers.map(container => {
                // 获取绝对位置和尺寸
                const pixelPosition = {
                    x: parseInt(container.style.left) || 0,
                    y: parseInt(container.style.top) || 0
                };
                
                const pixelSize = {
                    width: parseInt(container.style.width) || 200,
                    height: parseInt(container.style.height) || 150
                };
                
                // 获取网格位置信息
                const gridPosition = {
                    gridX: parseInt(container.dataset.gridX) || 0,
                    gridY: parseInt(container.dataset.gridY) || 0,
                    gridColumns: parseInt(container.dataset.gridColumns) || 1,
                    gridRows: parseInt(container.dataset.gridRows) || 1
                };
                
                return {
                    id: container.id,
                    // 同时保存像素位置和相对网格位置
                    position: pixelPosition,
                    size: pixelSize,
                    gridPosition: gridPosition,
                    fixed: container.dataset.fixed === 'true',
                    activeIndex: this.getActiveWidgetIndex(container),
                    items: [...container.querySelectorAll('.widget-item')].map(item => ({
                        type: item.dataset.widgetType,
                        id: item.id,
                        data: item.widgetData || {}
                    }))
                };
            });
            
            await chrome.storage.local.set({ widgets: widgetsToSave });
            return Promise.resolve();
        } catch (error) {
            console.error('保存小部件数据失败:', error);
            return Promise.reject(error);
        }
    },
    
    /**
     * 设置右键菜单
     */
    setupContextMenus() {
        // 不要替换整个body的右键菜单事件，而是添加一个专门的监听器
        document.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    },
    
    /**
     * 处理右键菜单事件
     * @param {MouseEvent} event - 右键事件对象 
     */
    handleContextMenu(event) {
        // 如果已经有特定元素处理了右键菜单，不再处理
        // 增加排除背景按钮和时钟元素
        if (event.target.closest('.folder-button, .shortcut-button, .bookmark, input, textarea, #background-button, #time')) {
            return;
        }
        
        // 获取鼠标位置下的所有元素（包括可能被覆盖的元素）
        const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
        
        // 检查是否有更高层级的交互元素，避免小部件菜单干扰其他元素
        const hasHigherLevelInteractive = elementsAtPoint.some(el => 
            el.closest('#folder-list, #shortcut-list, #search-box, .bookmark, #background-button, #time') && 
            !el.closest('.widget-container')
        );
        
        if (hasHigherLevelInteractive) {
            return; // 如果有更高层级的交互元素，不处理小部件的右键菜单
        }
        
        // 检查是否点击在小部件或小部件容器上
        const widgetItem = event.target.closest('.widget-item');
        const widgetContainer = event.target.closest('.widget-container');
        
        if (widgetItem && !event.target.closest('.widget-functional-area')) {
            // 小部件项的右键菜单 - 确保不是在功能区点击
            event.preventDefault();
            this.showWidgetItemContextMenu(event, widgetItem);
        } else if (widgetContainer && !widgetItem) {
            // 小部件容器的右键菜单 - 确保不是点击在小部件项上
            event.preventDefault();
            this.showWidgetContainerContextMenu(event, widgetContainer);
        } else if (
            // 在空白区域创建小部件容器，但排除特定区域
            !event.target.closest('#folder-list, #shortcut-list, #search-box, .bookmark, #background-button, #time')
        ) {
            // 空白区域的右键菜单
            event.preventDefault();
            this.showCreateWidgetMenu(event);
        }
    },
    
    /**
     * 显示创建小部件的右键菜单
     * @param {MouseEvent} event - 鼠标事件 
     */
    showCreateWidgetMenu(event) {
        const menuItems = [
            {
                id: 'create-widget-container',
                text: I18n.getMessage('createWidgetContainer') || '创建小部件容器',
                callback: () => {
                    this.createWidgetContainer({ 
                        position: { 
                            x: event.clientX, 
                            y: event.clientY 
                        } 
                    });
                }
            }
        ];
        
        Menu.ContextMenu.show(event, menuItems, { menuId: 'widget-create-menu' });
    },
    
    /**
     * 显示小部件容器的右键菜单
     * @param {MouseEvent} event - 鼠标事件
     * @param {HTMLElement} container - 小部件容器元素
     */
    showWidgetContainerContextMenu(event, container) {
        const menuItems = [
            {
                id: 'delete-widget-container',
                text: I18n.getMessage('deleteWidgetContainer') || '删除小部件容器',
                callback: () => {
                    this.deleteWidgetContainer(container);
                }
            },
            {
                id: 'toggle-widget-fixed',
                text: container.dataset.fixed === 'true' 
                    ? (I18n.getMessage('unfixWidgetContainer') || '取消固定') 
                    : (I18n.getMessage('fixWidgetContainer') || '固定位置'),
                callback: () => {
                    this.toggleFixedContainer(container);
                }
            },
            {
                id: 'resize-widget-container',
                text: I18n.getMessage('resizeWidgetContainer') || '调整大小',
                callback: () => {
                    this.showResizeDialog(container);
                }
            },
            {
                type: 'separator'
            },
            {
                id: 'toggle-grid-system',
                text: this.gridEnabled 
                    ? (I18n.getMessage('disableGridSystem') || '禁用网格系统') 
                    : (I18n.getMessage('enableGridSystem') || '启用网格系统'),
                callback: () => {
                    this.toggleGridSystem(!this.gridEnabled);
                }
            },
            {
                id: 'toggle-grid-debug',
                text: this.isDebugMode 
                    ? (I18n.getMessage('hideGridLines') || '隐藏网格线') 
                    : (I18n.getMessage('showGridLines') || '显示网格线'),
                callback: () => {
                    this.toggleGridDebug(!this.isDebugMode);
                }
            }
        ];
        
        Menu.ContextMenu.show(event, menuItems, { menuId: 'widget-container-menu' });
    },
    
    /**
     * 显示调整大小对话框
     * @param {HTMLElement} container - 小部件容器 
     */
    showResizeDialog(container) {
        const currentWidth = parseInt(container.style.width) || 200;
        const currentHeight = parseInt(container.style.height) || 150;
        
        // 查找小部件类型获取合适的最小尺寸
        const widgetItem = container.querySelector('.widget-item');
        let minWidth = 150;  // 默认最小宽度
        let minHeight = 100; // 默认最小高度
        
        if (widgetItem && widgetItem.dataset.widgetType) {
            // 使用WidgetRegistry加载小部件配置
            WidgetRegistry.loadWidget(widgetItem.dataset.widgetType)
                .then(module => {
                    if (module.default && module.default.config && module.default.config.min) {
                        minWidth = module.default.config.min.width || minWidth;
                        minHeight = module.default.config.min.height || minHeight;
                    }
                    // 显示调整大小表单
                    this.showResizeSizeForm(container, currentWidth, currentHeight, minWidth, minHeight);
                })
                .catch(err => {
                    console.error('加载小部件配置失败:', err);
                    // 发生错误时使用默认值
                    this.showResizeSizeForm(container, currentWidth, currentHeight, minWidth, minHeight);
                });
        } else {
            // 对于其他类型的小部件，使用默认值
            this.showResizeSizeForm(container, currentWidth, currentHeight, minWidth, minHeight);
        }
    },

    
    /**
     * 调整小部件容器大小
     * @param {HTMLElement} container - 小部件容器
     * @param {number} width - 新宽度
     * @param {number} height - 新高度
     */
    resizeWidgetContainer: async function(container, width, height) {
        // 查找小部件类型以获取适当的最小尺寸
        const widgetItem = container.querySelector('.widget-item');
        let minWidth = 150;  // 默认最小宽度
        let minHeight = 100; // 默认最小高度
        // 设置最大尺寸限制
        const maxWidth = 300;
        const maxHeight = 300;
        
        // 根据小部件类型获取特定的最小尺寸配置
        if (widgetItem && widgetItem.dataset.widgetType) {
            const widgetType = widgetItem.dataset.widgetType;
            
            try {
                // 从注册中心加载小部件模块
                const widgetModule = await WidgetRegistry.loadWidget(widgetType);
                
                // 只有在模块加载成功时才应用特定的最小尺寸
                if (widgetModule.default && widgetModule.default.config && widgetModule.default.config.min) {
                    minWidth = widgetModule.default.config.min.width || minWidth;
                    minHeight = widgetModule.default.config.min.height || minHeight;
                    
                    // 应用特定小部件的最小尺寸限制和最大尺寸限制
                    width = Math.min(maxWidth, Math.max(minWidth, width));
                    height = Math.min(maxHeight, Math.max(minHeight, height));
                    
                    // 设置容器尺寸
                    container.style.width = `${width}px`;
                    container.style.height = `${height}px`;
                    
                    // 调整小部件大小
                    if (typeof widgetModule.default.adjustSize === 'function') {
                        widgetModule.default.adjustSize(widgetItem);
                    }
                    
                    // 触发保存
                    document.dispatchEvent(new CustomEvent('widget-data-changed'));
                }
            } catch (err) {
                console.error('获取小部件配置失败:', err);
                
                // 失败时使用默认值
                width = Math.min(maxWidth, Math.max(minWidth, width));
                height = Math.min(maxHeight, Math.max(minHeight, height));
                container.style.width = `${width}px`;
                container.style.height = `${height}px`;
                document.dispatchEvent(new CustomEvent('widget-data-changed'));
            }
            return;
        }
        
        // 如果没有找到特定小部件配置，使用默认限制
        width = Math.min(maxWidth, Math.max(minWidth, width));
        height = Math.min(maxHeight, Math.max(minHeight, height));
        
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        
        // 触发保存
        document.dispatchEvent(new CustomEvent('widget-data-changed'));
    },
    
    /**
     * 显示小部件项的右键菜单
     * @param {MouseEvent} event - 鼠标事件
     * @param {HTMLElement} widgetItem - 小部件项元素
     */
    showWidgetItemContextMenu(event, widgetItem) {
        // 检查点击是否在小部件的功能区
        const isFunctionalArea = event.target.closest('.widget-functional-area');
        if (isFunctionalArea) return; // 如果是功能区，不显示菜单
        
        const container = widgetItem.closest('.widget-container');
        
        // 使用安全的国际化方法
        const addText = getI18nMessage('addWidget', '添加小部件');
        const removeText = getI18nMessage('removeWidget', '删除小部件');
        
        const menuItems = [
            {
                id: 'add-widget',
                text: addText,
                callback: () => {
                    this.showAddWidgetDialog(container);
                }
            },
            {
                id: 'remove-widget',
                text: removeText,
                callback: () => {
                    this.removeWidgetItem(widgetItem);
                }
            }
        ];
        
        Menu.ContextMenu.show(event, menuItems, { menuId: 'widget-item-menu' });
    },
    
    /**
     * 添加小部件到容器
     * @param {HTMLElement} container - 小部件容器
     * @param {string} widgetType - 小部件类型
     * @param {Object} widgetData - 小部件数据
     * @returns {Promise<HTMLElement>} 创建的小部件元素
     */
    async addWidgetItem(container, widgetType, widgetData = {}) {
        try {
            const contentArea = container.querySelector('.widget-content');
            if (!contentArea) throw new Error('找不到小部件内容区域');
            
            // 如果只有添加按钮，移除它
            const addButton = contentArea.querySelector('.widget-add-button');
            if (addButton && contentArea.children.length === 1) {
                contentArea.removeChild(addButton);
            }
            
            // 创建小部件项容器
            const widgetItem = document.createElement('div');
            widgetItem.className = 'widget-item';
            widgetItem.dataset.widgetType = widgetType;
            widgetItem.id = widgetData.id || `widget-${widgetType}-${Date.now()}`;
            
            // 存储小部件数据
            widgetItem.widgetData = widgetData;
            
            // 添加加载指示器
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'widget-loading';
            loadingIndicator.textContent = '加载中...';
            widgetItem.appendChild(loadingIndicator);
            
            // 先添加到容器，让用户看到加载状态
            contentArea.appendChild(widgetItem);
            
            // 标记处理中，防止重复添加
            widgetItem.dataset.processing = 'true';
            
            // 从注册中心加载小部件模块
            let widgetModule;
            try {
                widgetModule = await WidgetRegistry.loadWidget(widgetType);
                
                // 检查元素是否仍在DOM中，防止在加载过程中被移除
                if (!document.body.contains(widgetItem)) {
                    console.warn('小部件项在初始化过程中被移除');
                    return null;
                }
                
                // 移除加载指示器
                if (loadingIndicator && widgetItem.contains(loadingIndicator)) {
                    widgetItem.removeChild(loadingIndicator);
                }
                
                // 检查模块是否正确加载
                if (!widgetModule) {
                    throw new Error(`加载小部件模块 ${widgetType} 失败: 模块为空`);
                }
                
                // 检查initialize方法是否存在
                if (typeof widgetModule.initialize !== 'function') {
                    throw new Error(`小部件 ${widgetType} 缺少必要的 initialize 方法`);
                }
                
                // 初始化小部件
                await widgetModule.initialize(widgetItem, widgetData);
                
                // 检查初始化后是否有内容
                if (widgetItem.childElementCount === 0) {
                    throw new Error(`小部件 ${widgetType} 初始化后内容为空`);
                }
                
                // 设置为活动项
                this.setActiveWidgetItem(container, Array.from(contentArea.children).indexOf(widgetItem));
                
                // 清除处理标记
                delete widgetItem.dataset.processing;
            } catch (error) {
                console.error(`小部件 ${widgetType} 初始化失败:`, error);
                
                // 显示错误信息替代加载指示器
                if (widgetItem.contains(loadingIndicator)) {
                    widgetItem.removeChild(loadingIndicator);
                }
                
                const errorElement = document.createElement('div');
                errorElement.className = 'widget-error';
                errorElement.innerHTML = `<div>加载失败: ${error.message}</div>
                                     <button class="retry-button">重试</button>
                                     <button class="remove-button">移除</button>`;
                
                // 添加重试和移除按钮的事件处理
                widgetItem.appendChild(errorElement);
                
                // 绑定按钮事件
                const retryButton = errorElement.querySelector('.retry-button');
                const removeButton = errorElement.querySelector('.remove-button');
                
                if (retryButton) {
                    retryButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // 移除错误显示
                        if (contentArea.contains(widgetItem)) {
                            contentArea.removeChild(widgetItem);
                        }
                        // 重新尝试加载
                        this.addWidgetItem(container, widgetType, widgetData);
                    });
                }
                
                if (removeButton) {
                    removeButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeWidgetItem(widgetItem);
                    });
                }
                
                // 清除处理标记
                delete widgetItem.dataset.processing;
            }
            
            // 更新小圆点指示器
            this.updateWidgetIndicators(container);
            
            // 保存状态
            this.saveWidgets();
            
            return widgetItem;
        } catch (error) {
            console.error('添加小部件过程中发生错误:', error);
            Utils.handleError(error, I18n.getMessage('addWidgetFailed') || '添加小部件失败');
            return null;
        }
    },
    
    /**
     * 移除小部件项
     * @param {HTMLElement} widgetItem - 小部件项元素
     */
    removeWidgetItem(widgetItem) {
        const container = widgetItem.closest('.widget-container');
        const contentArea = container.querySelector('.widget-content');
        
        // 获取当前索引，用于后续处理
        const currentItems = Array.from(contentArea.querySelectorAll('.widget-item'));
        const currentIndex = currentItems.indexOf(widgetItem);
        
        // 移除小部件
        contentArea.removeChild(widgetItem);
        
        // 如果容器为空，添加"添加"按钮
        if (contentArea.children.length === 0) {
            this.addAddButton(container);
        } else {
            // 剩余小部件处理
            const remainingItems = contentArea.querySelectorAll('.widget-item');
            
            // 如果还有小部件，激活一个小部件
            if (remainingItems.length > 0) {
                // 如果删除的是最后一个，选择前一个；否则保持当前索引
                const nextActiveIndex = (currentIndex >= remainingItems.length) ? 
                    remainingItems.length - 1 : currentIndex;
                
                // 激活选中的小部件
                this.setActiveWidgetItem(container, nextActiveIndex);
            }
            
            // 更新小圆点指示器
            this.updateWidgetIndicators(container);
        }
        
        // 保存状态
        this.saveWidgets();
    },
    
    /**
     * 创建小部件容器
     * @param {Object} data - 小部件容器数据
     * @returns {HTMLElement} 创建的小部件容器
     */
    createWidgetContainer(data = {}) {
        const container = Utils.createElement('div', 'widget-container', {
            id: data.id || `widget-container-${Date.now()}`
        });
        
        // 如果有网格位置信息且启用了网格，使用网格位置
        if (data.gridPosition && this.gridEnabled) {
            const pixelPos = this.gridToPixelPosition(data.gridPosition);
            container.style.left = `${pixelPos.left}px`;
            container.style.top = `${pixelPos.top}px`;
            container.style.width = `${pixelPos.width}px`;
            container.style.height = `${pixelPos.height}px`;
            
            // 存储网格位置数据
            container.dataset.gridX = data.gridPosition.gridX;
            container.dataset.gridY = data.gridPosition.gridY;
            container.dataset.gridColumns = data.gridPosition.gridColumns;
            container.dataset.gridRows = data.gridPosition.gridRows;
        } else {
            // 使用像素位置
            const position = data.position || { x: 100, y: 100 };
            container.style.left = `${position.x}px`;
            container.style.top = `${position.y}px`;
            
            // 设置尺寸
            const size = data.size || { width: 200, height: 150 };
            container.style.width = `${size.width}px`;
            container.style.height = `${size.height}px`;
            
            // 计算并存储网格位置
            if (this.gridEnabled) {
                this.updateGridPositionData(container);
            }
        }
        
        // 设置固定状态
        container.dataset.fixed = data.fixed ? 'true' : 'false';
        if (data.fixed) {
            container.classList.add('widget-fixed');
        }
        
        // 创建侧边拖动条
        const dragHandle = document.createElement('div');
        dragHandle.className = 'widget-drag-handle';
        dragHandle.title = '拖动'; 
        dragHandle.style.cursor = 'move';
        
        container.appendChild(dragHandle);
        
        // 创建固定按钮（图钉）
        const pinButton = document.createElement('button');
        pinButton.className = 'widget-pin-button';
        
        // 使用安全的国际化方法
        const unfixText = getI18nMessage('unfixWidgetContainer', '取消固定');
        const fixText = getI18nMessage('fixWidgetContainer', '固定小部件');
        
        pinButton.title = data.fixed ? unfixText : fixText;
        pinButton.innerHTML = data.fixed ? '📌' : '📍';
        
        pinButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.toggleFixedContainer(container);
        });
        
        container.appendChild(pinButton);
        
        // 添加调整大小控制点
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'widget-resize-handle';
        resizeHandle.title = '调整大小';
        container.appendChild(resizeHandle);
        
        // 添加拖动事件
        this.setupDragHandlers(dragHandle, container);
        
        // 添加调整大小事件
        this.setupResizeHandlers(resizeHandle, container);
        
        // 创建内容区域包装器
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'widget-content-wrapper';
        container.appendChild(contentWrapper);
        
        // 创建内容区域
        const contentArea = document.createElement('div');
        contentArea.className = 'widget-content';
        contentWrapper.appendChild(contentArea);
        
        // 添加小部件指示器容器
        const indicatorsContainer = document.createElement('div');
        indicatorsContainer.className = 'widget-indicators';
        contentWrapper.appendChild(indicatorsContainer);

        // 如果有已保存的小部件，添加它们
        if (data.items && Array.isArray(data.items)) {
            data.items.forEach(item => {
                this.addWidgetItem(container, item.type, item.data);
            });
            
            // 设置初始活动状态，使用保存的activeIndex或默认为0
            const activeIndex = typeof data.activeIndex !== 'undefined' ? data.activeIndex : 0;
            this.setActiveWidgetItem(container, activeIndex);
        }
        
        // 如果容器为空，添加一个"添加"按钮
        if (!data.items || data.items.length === 0) {
            this.addAddButton(container);
        }
        
        // 添加滚轮事件监听器
        this.setupScrollHandlers(container);
        
        // 添加到DOM
        document.body.appendChild(container);
        
        // 添加到管理列表
        widgetContainers.push(container);
        
        // 保存状态
        this.saveWidgets();
        
        return container;
    },
    
    /**
     * 设置滚轮事件处理
     * @param {HTMLElement} container - 小部件容器元素
     */
    setupScrollHandlers(container) {
        container.addEventListener('wheel', (e) => {
            e.preventDefault(); // 防止页面滚动
            
            const contentArea = container.querySelector('.widget-content');
            if (!contentArea || contentArea.children.length <= 1) return;
            
            const activeWidgetIndex = this.getActiveWidgetIndex(container);
            const widgetItems = Array.from(contentArea.querySelectorAll('.widget-item'));
            
            // 确定滚动方向
            const delta = e.deltaY || e.detail || e.wheelDelta;
            const direction = delta > 0 ? 1 : -1;
            
            // 计算新的索引（循环滚动）
            let newIndex = (activeWidgetIndex + direction) % widgetItems.length;
            if (newIndex < 0) newIndex = widgetItems.length - 1;
            
            // 设置新的活动小部件
            this.setActiveWidgetItem(container, newIndex);
        }, { passive: false });
    },
    
    /**
     * 获取当前活动的小部件索引
     * @param {HTMLElement} container - 小部件容器元素
     * @returns {number} 活动小部件的索引
     */
    getActiveWidgetIndex(container) {
        const contentArea = container.querySelector('.widget-content');
        if (!contentArea) return -1;
        
        const widgetItems = Array.from(contentArea.querySelectorAll('.widget-item'));
        return widgetItems.findIndex(item => item.classList.contains('active-widget'));
    },
    
    /**
     * 设置活动小部件
     * @param {HTMLElement} container - 小部件容器元素
     * @param {number} index - 要激活的小部件索引
     */
    setActiveWidgetItem(container, index) {
        const contentArea = container.querySelector('.widget-content');
        if (!contentArea) return;
        
        const widgetItems = Array.from(contentArea.querySelectorAll('.widget-item'));
        if (widgetItems.length === 0) return;
        
        // 确保索引有效
        const validIndex = Math.max(0, Math.min(index, widgetItems.length - 1));
        
        // 取消所有小部件的活动状态
        widgetItems.forEach(item => {
            item.classList.remove('active-widget');
            item.style.opacity = '0';
            item.style.visibility = 'hidden';
            item.style.zIndex = '0'; // 修正: 降低非活动项的z-index
        });
        
        // 设置新的活动小部件
        widgetItems[validIndex].classList.add('active-widget');
        widgetItems[validIndex].style.opacity = '1';
        widgetItems[validIndex].style.visibility = 'visible';
        widgetItems[validIndex].style.zIndex = '2'; // 修正: 提高活动项的z-index
        
        // 更新指示器
        this.updateActiveIndicator(container, validIndex);
        
        // 保存活动状态的变更
        document.dispatchEvent(new CustomEvent('widget-data-changed'));
    },
    
    /**
     * 更新小部件指示器
     * @param {HTMLElement} container - 小部件容器元素
     */
    updateWidgetIndicators(container) {
        const contentArea = container.querySelector('.widget-content');
        const indicatorsContainer = container.querySelector('.widget-indicators');
        
        if (!contentArea || !indicatorsContainer) return;
        
        // 清空现有指示器
        indicatorsContainer.innerHTML = '';
        
        // 获取小部件项
        const widgetItems = contentArea.querySelectorAll('.widget-item');
        if (widgetItems.length <= 1) {
            indicatorsContainer.classList.add('hidden'); // 隐藏指示器
            return;
        }
        
        indicatorsContainer.classList.remove('hidden'); // 显示指示器
        
        // 创建指示器点
        Array.from(widgetItems).forEach((_, index) => {
            const indicator = document.createElement('span');
            indicator.className = 'widget-indicator';
            indicator.dataset.index = index;
            
            // 添加点击事件
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setActiveWidgetItem(container, index);
            });
            
            indicatorsContainer.appendChild(indicator);
        });
        
        // 激活当前小部件的指示器
        const activeIndex = this.getActiveWidgetIndex(container);
        if (activeIndex === -1) {
            // 如果没有活动的小部件，激活第一个
            this.setActiveWidgetItem(container, 0);
        } else {
            this.updateActiveIndicator(container, activeIndex);
        }
    },
    
    /**
     * 更新活动指示器
     * @param {HTMLElement} container - 小部件容器元素
     * @param {number} activeIndex - 活动小部件索引
     */
    updateActiveIndicator(container, activeIndex) {
        const indicators = container.querySelectorAll('.widget-indicator');
        if (!indicators.length) return;
        
        // 移除所有活动状态
        Array.from(indicators).forEach(indicator => {
            indicator.classList.remove('active');
        });
        
        // 设置新的活动指示器
        if (activeIndex >= 0 && activeIndex < indicators.length) {
            indicators[activeIndex].classList.add('active');
        }
    },
    
    /**
     * 添加"添加"按钮到容器
     * @param {HTMLElement} container - 小部件容器 
     */
    addAddButton(container) {
        const contentArea = container.querySelector('.widget-content');
        if (!contentArea) return;
        
        // 清除现有内容
        const existingButton = contentArea.querySelector('.widget-add-button');
        if (existingButton) return;
        
        const addButton = document.createElement('button');
        addButton.className = 'widget-add-button';
        addButton.innerHTML = '+';
        addButton.title = I18n.getMessage('addWidget') || '添加小部件';
        
        addButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showAddWidgetDialog(container);
        });
        
        contentArea.appendChild(addButton);
    },
    
    /**
     * 显示添加小部件对话框
     * @param {HTMLElement} container - 小部件容器
     */
    async showAddWidgetDialog(container) {
        try {
            // 获取可用小部件列表，确保是数组
            const availableWidgets = await this.getAvailableWidgets();
            
            // 如果不是数组或为空数组，显示提示
            if (!Array.isArray(availableWidgets) || availableWidgets.length === 0) {
                Notification.notify({
                    title: getI18nMessage('notice', '提示'),
                    message: getI18nMessage('noWidgetsAvailable', '没有可用的小部件'),
                    type: 'info'
                });
                return;
            }
            
            // 创建对话框选项
            const formItems = availableWidgets.map(widget => ({
                id: widget.type,
                label: widget.name,
                type: 'checkbox',
                value: false
            }));
            
            // 使用安全的国际化方法
            const titleText = getI18nMessage('addWidgetTitle', '添加小部件');
            const addText = getI18nMessage('add', '添加');
            const cancelText = getI18nMessage('cancel', '取消');
            
            // 防止重复操作
            let isProcessing = false;
            
            Menu.showFormModal(
                titleText,
                formItems,
                async (formData) => {
                    if (isProcessing) return; // 防止重复操作
                    isProcessing = true;
                    
                    try {
                        // 记录需要添加的小部件类型
                        const selectedWidgetTypes = [];
                        
                        // 检查每个小部件类型是否被选中
                        Object.entries(formData).forEach(([key, value]) => {
                            // 只有当值为 true 时才添加到选中列表
                            if (value === true) {
                                selectedWidgetTypes.push(key);
                            }
                        });
                        
                        // 如果没有选择任何小部件，显示提示
                        if (selectedWidgetTypes.length === 0) {
                            Notification.notify({
                                title: getI18nMessage('notice', '提示'),
                                message: getI18nMessage('noWidgetSelected', '未选择任何小部件'),
                                type: 'info'
                            });
                            return;
                        }
                        
                        // 按顺序添加选中的小部件
                        for (const type of selectedWidgetTypes) {
                            await this.addWidgetItem(container, type);
                        }
                        
                        // 添加成功提示
                        if (selectedWidgetTypes.length > 0) {
                            Notification.notify({
                                title: getI18nMessage('success', '成功'),
                                message: getI18nMessage('widgetsAdded', '已添加所选小部件'),
                                type: 'success'
                            });
                        }
                    } catch (error) {
                        console.error('添加小部件失败:', error);
                        Notification.notify({
                            title: getI18nMessage('error', '错误'),
                            message: getI18nMessage('addWidgetFailed', '添加小部件失败'),
                            type: 'error'
                        });
                    } finally {
                        isProcessing = false;
                    }
                },
                addText,
                cancelText
            );
        } catch (error) {
            console.error('获取可用小部件失败:', error);
            Notification.notify({
                title: getI18nMessage('error', '错误'),
                message: getI18nMessage('loadingWidgetsFailed', '加载可用小部件失败'),
                type: 'error'
            });
        }
    },
    
    /**
     * 获取可用的小部件列表
     * @returns {Promise<Array>} 小部件类型列表
     */
    async getAvailableWidgets() {
        try {
            // 从注册中心获取所有已注册的小部件，添加 true 参数强制加载元数据
            const widgets = await WidgetRegistry.getAllWidgets(true);
            
            // 确保返回数组
            if (!widgets) return [];
            if (Array.isArray(widgets)) return widgets;
            
            // 如果返回的是对象但不是数组，尝试转换为数组
            if (typeof widgets === 'object') {
                return Object.values(widgets);
            }
            
            return [];
        } catch (error) {
            console.error('获取小部件列表失败:', error);
            return [];
        }
    },
    
    /**
     * 删除小部件容器
     * @param {HTMLElement} container - 小部件容器元素 
     */
    deleteWidgetContainer(container) {
        // 从DOM中移除
        document.body.removeChild(container);
        
        // 从管理列表中移除
        widgetContainers = widgetContainers.filter(c => c !== container);
        
        // 保存状态
        this.saveWidgets();
    },
    
    /**
     * 切换小部件容器的固定状态
     * @param {HTMLElement} container - 小部件容器元素
     */
    toggleFixedContainer(container) {
        const isFixed = container.dataset.fixed === 'true';
        const pinButton = container.querySelector('.widget-pin-button');
        
        if (isFixed) {
            // 取消固定
            container.dataset.fixed = 'false';
            container.classList.remove('widget-fixed');
            
            if (pinButton) {
                pinButton.innerHTML = '📍';
                pinButton.title = I18n.getMessage('fixWidgetContainer') || '固定小部件';
            }
        } else {
            // 固定小部件
            container.dataset.fixed = 'true';
            container.classList.add('widget-fixed');
            
            if (pinButton) {
                pinButton.innerHTML = '📌';
                pinButton.title = I18n.getMessage('unfixWidgetContainer') || '取消固定';
            }
        }
        
        // 保存状态
        this.saveWidgets();
    },
    
    /**
     * 设置拖拽事件处理
     * @param {HTMLElement} handle - 拖拽手柄元素
     * @param {HTMLElement} container - 小部件容器元素
     */
    setupDragHandlers(handle, container) {
        let isDragging = false;
        
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault(); // 阻止默认行为
            e.stopPropagation(); // 阻止事件冒泡
            
            // 如果容器是固定的，不允许拖动
            if (container.dataset.fixed === 'true') {
                // 使用安全的国际化方法
                const fixedTitle = getI18nMessage('widgetFixed', '小部件已固定');
                const fixedMessage = getI18nMessage('unfixWidgetToMove', '请先取消固定再移动');
                
                // 显示提示信息
                Notification.notify({
                    title: fixedTitle,
                    message: fixedMessage,
                    type: 'info',
                    duration: 2000
                });
                return;
            }
            
            // 设置初始拖动状态
            isDragging = true;
            
            // 记录初始位置
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = parseInt(container.style.left) || 0;
            const startTop = parseInt(container.style.top) || 0;
            
            container.classList.add('widget-dragging');
            
            // 移动处理函数
            function handleMouseMove(moveEvent) {
                if (!isDragging) return;
                
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                // 计算新位置
                let newLeft = Math.max(0, startLeft + dx);
                let newTop = Math.max(0, startTop + dy);
                
                // 应用新位置
                container.style.left = `${newLeft}px`;
                container.style.top = `${newTop}px`;
                
                moveEvent.preventDefault();
            }
            
            // 放开处理函数
            function handleMouseUp() {
                if (isDragging) {
                    isDragging = false;
                    container.classList.remove('widget-dragging');
                    
                    if (WidgetSystem.gridEnabled) {
                        // 获取当前像素位置
                        const currentLeft = parseInt(container.style.left) || 0;
                        const currentTop = parseInt(container.style.top) || 0;
                        const currentWidth = parseInt(container.style.width) || 200;
                        const currentHeight = parseInt(container.style.height) || 150;
                        
                        // 转换为网格位置
                        const gridPos = WidgetSystem.pixelToGridPosition(
                            currentLeft, 
                            currentTop, 
                            currentWidth, 
                            currentHeight
                        );
                        
                        // 再从网格位置转回像素位置进行捕捉
                        const snappedPos = WidgetSystem.gridToPixelPosition(gridPos);
                        
                        // 平滑过渡到网格位置
                        container.classList.add('grid-snapping');
                        container.style.left = `${snappedPos.left}px`;
                        container.style.top = `${snappedPos.top}px`;
                        
                        // 更新网格位置数据
                        WidgetSystem.updateGridPositionData(container);
                        
                        // 移除过渡类
                        setTimeout(() => {
                            container.classList.remove('grid-snapping');
                        }, 200);
                    }
                    
                    // 保存位置信息
                    document.dispatchEvent(new CustomEvent('widget-data-changed'));
                }
                
                // 移除临时事件处理
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
            
            // 绑定移动和放开事件
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    },
    
    /**
     * 设置调整大小事件处理
     * @param {HTMLElement} handle - 调整大小控制点元素
     * @param {HTMLElement} container - 小部件容器元素
     */
    setupResizeHandlers(handle, container) {
        let isResizing = false;
        
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 如果容器是固定的，不允许调整大小
            if (container.dataset.fixed === 'true') {
                // 显示提示信息
                Notification.notify({
                    title: I18n.getMessage('widgetFixed') || '小部件已固定',
                    message: I18n.getMessage('unfixWidgetToResize') || '请先取消固定再调整大小',
                    type: 'info',
                    duration: 2000
                });
                return;
            }
            
            // 设置初始调整状态
            isResizing = true;
            
            // 记录初始位置和尺寸
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = parseInt(container.style.width) || 200;
            const startHeight = parseInt(container.style.height) || 150;
            
            // 设置最大和最小尺寸限制
            const maxWidth = 300;
            const maxHeight = 300;
            const minWidth = 150;
            const minHeight = 100;
            
            container.classList.add('widget-resizing');
            
            // 移动处理函数
            function handleMouseMove(moveEvent) {
                if (!isResizing) return;
                
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                // 计算新尺寸，确保在最小和最大尺寸限制内
                let newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + dx));
                let newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + dy));
                
                // 应用新尺寸
                container.style.width = `${newWidth}px`;
                container.style.height = `${newHeight}px`;
                
                moveEvent.preventDefault();
            }
            
            // 放开处理函数
            function handleMouseUp() {
                if (isResizing) {
                    isResizing = false;
                    container.classList.remove('widget-resizing');
                    
                    if (WidgetSystem.gridEnabled) {
                        // 获取当前尺寸并捕捉到网格
                        const currentWidth = parseInt(container.style.width) || 200;
                        const currentHeight = parseInt(container.style.height) || 150;
                        
            // 计算网格尺寸
            const gridPosition = WidgetSystem.pixelToGridPosition(
                parseInt(container.style.left) || 0,
                parseInt(container.style.top) || 0,
                currentWidth,
                currentHeight
            );
            
            // 根据网格位置计算像素尺寸
            const pixelPosition = WidgetSystem.gridToPixelPosition(gridPosition);
            
            // 平滑过渡到网格尺寸
            container.classList.add('grid-snapping');
            container.style.width = `${pixelPosition.width}px`;
            container.style.height = `${pixelPosition.height}px`;
            
            // 更新网格位置数据
            WidgetSystem.updateGridPositionData(container);
            
            // 检查是否需要缩放
            const minWidgetWidth = parseInt(container.dataset.minWidth) || 150;
            const minWidgetHeight = parseInt(container.dataset.minHeight) || 100;
            
            if (pixelPosition.width < minWidgetWidth || pixelPosition.height < minWidgetHeight) {
                // 计算缩放比例
                const scaleX = pixelPosition.width / minWidgetWidth;
                const scaleY = pixelPosition.height / minWidgetHeight;
                const scale = Math.min(scaleX, scaleY);
                
                // 应用缩放到内容
                const contentWrapper = container.querySelector('.widget-content-wrapper');
                if (contentWrapper) {
                    contentWrapper.style.transform = `scale(${scale})`;
                    contentWrapper.style.transformOrigin = 'top left';
                    
                    // 标记容器已缩放
                    container.dataset.scaled = 'true';
                    container.dataset.scale = scale;
                }
            } else {
                // 移除缩放
                const contentWrapper = container.querySelector('.widget-content-wrapper');
                if (contentWrapper) {
                    contentWrapper.style.transform = '';
                    
                    // 清除缩放标记
                    delete container.dataset.scaled;
                    delete container.dataset.scale;
                }
            }
            
            // 移除过渡类
            setTimeout(() => {
                container.classList.remove('grid-snapping');
            }, 200);
                    }
                    
                    // 触发尺寸变更事件
                    document.dispatchEvent(new CustomEvent('widget-data-changed'));
                }
                
                // 移除临时事件处理
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
            
            // 绑定移动和放开事件
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    },
    
    /**
     * 窗口尺寸变化处理
     */
    handleWindowResize() {
        // 计算窗口网格尺寸
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const cellSize = this.gridSize + this.gridGap;
        const gridColumns = Math.floor(viewportWidth / cellSize);
        const gridRows = Math.floor(viewportHeight / cellSize);
        
        // 获取之前的viewport尺寸(如果有存储)
        const previousGridColumns = parseInt(document.body.dataset.previousGridColumns) || gridColumns;
        const previousGridRows = parseInt(document.body.dataset.previousGridRows) || gridRows;
        
        // 存储当前viewport网格尺寸
        document.body.dataset.previousGridColumns = gridColumns;
        document.body.dataset.previousGridRows = gridRows;
        
        // 如果网格尺寸没有变化，不需要重定位
        if (previousGridColumns === gridColumns && previousGridRows === gridRows) return;
        
        // 计算缩放比例
        const columnRatio = gridColumns / previousGridColumns;
        const rowRatio = gridRows / previousGridRows;
        
        // 为所有小部件容器应用响应式重定位
        widgetContainers.forEach(container => {
            // 获取存储的网格位置
            const gridX = parseInt(container.dataset.gridX) || 0;
            const gridY = parseInt(container.dataset.gridY) || 0;
            
            // 适应新的网格尺寸
            let newGridX = Math.round(gridX * columnRatio);
            let newGridY = Math.round(gridY * rowRatio);
            
            // 确保不超出视口
            newGridX = Math.min(newGridX, gridColumns - 1);
            newGridY = Math.min(newGridY, gridRows - 1);
            
            // 更新位置
            const newPosition = this.gridToPixelPosition({
                gridX: newGridX,
                gridY: newGridY,
                gridColumns: parseInt(container.dataset.gridColumns) || 1,
                gridRows: parseInt(container.dataset.gridRows) || 1
            });
            
            // 应用新位置
            container.classList.add('grid-snapping');
            container.style.left = `${newPosition.left}px`;
            container.style.top = `${newPosition.top}px`;
            
            // 更新存储的网格位置
            container.dataset.gridX = newGridX;
            container.dataset.gridY = newGridY;
            
            // 移除过渡类
            setTimeout(() => {
                container.classList.remove('grid-snapping');
            }, 300);
        });
        
        // 保存更新后的位置
        this.saveWidgets();
    },
    
    /**
     * 计算新的固定位置，考虑网格
     * @param {Object} position - 当前位置信息
     * @returns {Object} 新的位置信息
     */
    calculateNewFixedPosition(position) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let x = position.x;
        let y = position.y;
        
        // 确保位置在视口范围内
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x > viewportWidth - 100) x = viewportWidth - 100;
        if (y > viewportHeight - 100) y = viewportHeight - 100;
        
        // 如果启用网格，捕捉到网格
        if (this.gridEnabled) {
            x = this.snapToGrid(x);
            y = this.snapToGrid(y);
        }
        
        return { x, y };
    },

    // 添加到文件顶部的变量声明区域

    gridEnabled: true,  // 默认启用网格
    gridSize: 20,       // 初始网格单元格大小（将被动态计算）
    gridGap: 10,        // 初始网格间隙（将被动态计算）
    snapThreshold: 15,  // 网格吸附阈值
    isDebugMode: false, // 是否显示网格辅助线
    gridColumnCount: 36, // 从12增加到24列，提供更精细的水平网格
    gridRowCount: 20,   // 从8增加到16行，提供更精细的垂直网格
    minCellSize: 40,    // 从60减小到40，允许更小的网格单元
    minGridGap: 4,      // 从5减少到4，允许更紧凑的网格

    /**
     * 初始化网格系统
     */
    initGridSystem() {
        // 计算当前视口的网格尺寸
        this.calculateGridDimensions();
        
        // 应用网格调试样式
        this.applyGridStyles();
        
        // 添加窗口大小变化监听器
        window.addEventListener('resize', () => {
            this.calculateGridDimensions();
            this.applyGridStyles();
            this.repositionWidgetsOnResize();
        });
        
        // 添加页面缩放监听
        window.addEventListener('resize', this.handleZoomChange.bind(this));
        
        // 监听缩放事件 (Ctrl+滚轮缩放)
        window.visualViewport.addEventListener('resize', this.handleZoomChange.bind(this));
        
        // 初始保存当前缩放比例
        document.body.dataset.previousZoom = window.devicePixelRatio;
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
        
        // 将这些变量同步到widget-specific变量
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
     * 当页面缩放比例变化时，调整小部件位置
     */
    handleZoomChange() {
        // 检测当前页面缩放比例
        const currentZoom = window.devicePixelRatio;
        
        // 如果存储了之前的缩放比例，计算变化率
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
        
        if (this.gridEnabled) {
            // 网格系统启用时，重新计算网格尺寸并重定位小部件
            this.calculateGridDimensions();
            this.applyGridStyles();
            this.repositionWidgetsOnResize();
        } else {
            // 网格系统禁用时，根据缩放比例调整小部件位置和尺寸
            widgetContainers.forEach(container => {
                // 获取当前位置和尺寸
                const left = parseInt(container.style.left) || 0;
                const top = parseInt(container.style.top) || 0;
                const width = parseInt(container.style.width) || 200;
                const height = parseInt(container.style.height) || 150;
                
                // 应用缩放调整，保持位置不变
                container.style.left = `${Math.round(left)}px`;
                container.style.top = `${Math.round(top)}px`;
                container.style.width = `${Math.round(width)}px`;
                container.style.height = `${Math.round(height)}px`;
            });
        }
        
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
                title: I18n.getMessage('gridDebugEnabled') || '网格调试已启用',
                message: I18n.getMessage('gridDebugEnabledMessage') || '现在您可以看到网格线',
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
                title: I18n.getMessage('gridDebugDisabled') || '网格调试已禁用',
                message: I18n.getMessage('gridDebugDisabledMessage') || '网格线已隐藏',
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
            
            // 重新定位所有小部件到网格
            this.repositionWidgetsOnResize();
            
            // 显示成功消息
            Notification.notify({
                title: I18n.getMessage('gridSystemEnabled') || '网格系统已启用',
                message: I18n.getMessage('gridSystemEnabledMessage') || '小部件将吸附到网格',
                type: 'success',
                duration: 2000
            });
        } else {
            // 显示消息
            Notification.notify({
                title: I18n.getMessage('gridSystemDisabled') || '网格系统已禁用',
                message: I18n.getMessage('gridSystemDisabledMessage') || '小部件将自由放置',
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
     * 更新小部件容器的网格位置数据
     * @param {HTMLElement} container - 小部件容器元素
     */
    updateGridPositionData(container) {
        // 获取像素位置
        const left = parseInt(container.style.left) || 0;
        const top = parseInt(container.style.top) || 0;
        const width = parseInt(container.style.width) || 200;
        const height = parseInt(container.style.height) || 150;

        // 转换为网格位置
        const gridPosition = this.pixelToGridPosition(left, top, width, height);

        // 存储网格位置数据
        container.dataset.gridX = gridPosition.gridX;
        container.dataset.gridY = gridPosition.gridY;
        container.dataset.gridColumns = gridPosition.gridColumns;
        container.dataset.gridRows = gridPosition.gridRows;
    },

    /**
     * 在窗口大小变化时重新定位小部件
     */
    repositionWidgetsOnResize() {
        if (!this.gridEnabled) return;

        widgetContainers.forEach(container => {
            // 获取存储的网格位置
            const gridPosition = {
                gridX: parseInt(container.dataset.gridX) || 0,
                gridY: parseInt(container.dataset.gridY) || 0,
                gridColumns: parseInt(container.dataset.gridColumns) || 1,
                gridRows: parseInt(container.dataset.gridRows) || 1
            };

            // 计算新的像素位置
            const pixelPosition = this.gridToPixelPosition(gridPosition);

            // 应用新位置
            container.style.left = `${pixelPosition.left}px`;
            container.style.top = `${pixelPosition.top}px`;
            container.style.width = `${pixelPosition.width}px`;
            container.style.height = `${pixelPosition.height}px`;
        });
    },
};

