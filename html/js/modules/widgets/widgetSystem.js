/**
 * 小部件系统模块
 * 提供小部件容器的创建、管理和交互功能，支持响应式布局、国际化、主题适配等。
 * @author System
 * @version 1.0.1
 * @date 2025-07-09
 */

import { Utils, Menu, GridSystem, I18n, Notification, WidgetRegistry } from '../core/index.js';

/**
 * 小部件系统状态管理类
 * @class WidgetSystemState
 * @description 管理小部件容器、状态、观察者等运行时数据。
 */
class WidgetSystemState {
    constructor() {
        this.widgets = [];
        this.widgetContainers = [];
        this.dragData = null;
        this.isInitialized = false;
        this.observers = new Map(); // 存储 ResizeObserver 等观察器
    }

    addContainer(container) {
        this.widgetContainers.push(container);
    }

    removeContainer(container) {
        this.widgetContainers = this.widgetContainers.filter(c => c !== container);
    }

    cleanup() {
        // 清理所有观察器
        this.observers.forEach((observer, key) => {
            if (observer && typeof observer.disconnect === 'function') {
                observer.disconnect();
            }
        });
        this.observers.clear();
    }

    /**
     * 清空所有数据
     */
    clear() {
        this.widgets.length = 0;
        this.widgetContainers.length = 0;
        this.dragData = null;
        this.isInitialized = false;
        this.clearCache();
    }

    /**
     * 清理缓存
     */
    clearCache() {
        // 清理观察器
        this.cleanup();
        // 可以在这里清理任何其他缓存数据
    }
}

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
 * 事件处理器集合
 * @namespace EventHandlers
 */
const EventHandlers = {
    /**
     * 设置拖拽事件处理
     * @param {HTMLElement} handle - 拖拽手柄元素
     * @param {HTMLElement} container - 小部件容器元素
     */
    setupDragHandlers(handle, container) {
        // 使用网格系统的统一拖拽功能
        if (window.GridSystem && typeof window.GridSystem.registerDraggable === 'function') {
            const dragController = window.GridSystem.registerDraggable(container, {
                gridSnapEnabled: true,
                showGridHint: true,
                dragHandle: handle,
                onDragStart: (e, dragState) => {
                    // 如果容器是固定的，不允许拖动
                    if (container.dataset.fixed === 'true') {
                        const fixedTitle = getI18nMessage('widgetFixed', '小部件已固定');
                        const fixedMessage = getI18nMessage('unfixWidgetToMove', '请先取消固定再移动');
                        
                        Notification.notify({
                            title: fixedTitle,
                            message: fixedMessage,
                            type: 'info',
                            duration: 2000
                        });
                        
                        // 阻止拖拽
                        dragState.isDragging = false;
                        window.GridSystem.currentDragElement = null;
                        return;
                    }
                    
                    container.classList.add('widget-dragging');
                },
                onDragMove: (e, dragState, position) => {
                    // 确保小部件在视口内
                    WidgetSystem.ensureElementInViewport(container);
                },
                onDragEnd: (e, dragState) => {
                    container.classList.remove('widget-dragging');
                    
                    // 自动网格吸附（无论是否按住 Shift）
                    if (GridSystem.gridEnabled) {
                        GridSystem.snapElementToGrid(container, true);
                    }
                    
                    // 触发数据更改事件
                    document.dispatchEvent(new CustomEvent('widget-data-changed'));
                }
            });
            
            // 存储拖拽控制器引用，便于后续操作
            container._dragController = dragController;
        } else {
            // 降级到原始拖拽实现
            this.setupDragHandlersFallback(handle, container);
        }
    },

    /**
     * 降级的拖拽事件处理（当网格系统不可用时使用）
     * @param {HTMLElement} handle - 拖拽手柄元素
     * @param {HTMLElement} container - 小部件容器元素
     */
    setupDragHandlersFallback(handle, container) {
        let isDragging = false;
        
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 如果容器是固定的，不允许拖动
            if (container.dataset.fixed === 'true') {
                const fixedTitle = getI18nMessage('widgetFixed', '小部件已固定');
                const fixedMessage = getI18nMessage('unfixWidgetToMove', '请先取消固定再移动');
                
                Notification.notify({
                    title: fixedTitle,
                    message: fixedMessage,
                    type: 'info',
                    duration: 2000
                });
                return;
            }
            
            isDragging = true;
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = parseInt(container.style.left) || 0;
            const startTop = parseInt(container.style.top) || 0;
            
            container.classList.add('widget-dragging');
            
            function handleMouseMove(moveEvent) {
                if (!isDragging) return;
                
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                let newLeft = Math.max(0, startLeft + dx);
                let newTop = Math.max(0, startTop + dy);
                
                container.style.left = `${newLeft}px`;
                container.style.top = `${newTop}px`;
                
                moveEvent.preventDefault();
            }
            
            function handleMouseUp() {
                if (isDragging) {
                    isDragging = false;
                    container.classList.remove('widget-dragging');
                    
                    if (GridSystem.gridEnabled) {
                        GridSystem.snapElementToGrid(container, true);
                    }
                    
                    document.dispatchEvent(new CustomEvent('widget-data-changed'));
                }
                
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

// 添加对移动端触摸事件的支持
handle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 如果容器是固定的，不允许拖动
    if (container.dataset.fixed === 'true') {
        const fixedTitle = getI18nMessage('widgetFixed', '小部件已固定');
        const fixedMessage = getI18nMessage('unfixWidgetToMove', '请先取消固定再移动');

        Notification.notify({
            title: fixedTitle,
            message: fixedMessage,
            type: 'info',
            duration: 2000
        });
        return;
    }

    isDragging = true;

    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const startLeft = parseInt(container.style.left) || 0;
    const startTop = parseInt(container.style.top) || 0;

    container.classList.add('widget-dragging');

    function handleTouchMove(moveEvent) {
        if (!isDragging) return;
        const touchMove = moveEvent.touches[0];
        const dx = touchMove.clientX - startX;
        const dy = touchMove.clientY - startY;

        let newLeft = Math.max(0, startLeft + dx);
        let newTop = Math.max(0, startTop + dy);

        container.style.left = `${newLeft}px`;
        container.style.top = `${newTop}px`;

        moveEvent.preventDefault();
    }

    function handleTouchEnd() {
        if (isDragging) {
            isDragging = false;
            container.classList.remove('widget-dragging');

            if (GridSystem.gridEnabled) {
                GridSystem.snapElementToGrid(container, true);
            }

            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        }

        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
}, { passive: false });
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
            
            if (container.dataset.fixed === 'true') {
                Notification.notify({
                    title: I18n.getMessage('widgetFixed', '小部件已固定'),
                    message: I18n.getMessage('unfixWidgetToResize', '请先取消固定再调整大小'),
                    type: 'info',
                    duration: 2000
                });
                return;
            }
            
            isResizing = true;
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = parseInt(container.style.width) || 200;
            const startHeight = parseInt(container.style.height) || 150;
            
            container.classList.add('widget-resizing');
            
            function handleMouseMove(moveEvent) {
                if (!isResizing) return;
                
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                let newWidth = Math.max(100, startWidth + dx);
                let newHeight = Math.max(80, startHeight + dy);
                
                container.style.width = `${newWidth}px`;
                container.style.height = `${newHeight}px`;
                
                moveEvent.preventDefault();
            }
            
            function handleMouseUp() {
                if (isResizing) {
                    isResizing = false;
                    container.classList.remove('widget-resizing');
                    
                    if (GridSystem.gridEnabled) {
                        GridSystem.snapElementToGrid(container, true);
                    }
                    
                    document.dispatchEvent(new CustomEvent('widget-data-changed'));
                }
                
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    },

    /**
     * 设置滚轮事件处理
     * @param {HTMLElement} container - 小部件容器元素
     */
    setupScrollHandlers(container) {
        container.addEventListener('wheel', (e) => {
            // 如果事件发生在可滚动的子元素上，并且该元素还能在滚动方向上继续滚动，
            // 则允许默认滚动行为；否则拦截并用于切换小部件。
            try {
                const path = e.composedPath ? e.composedPath() : (function(){
                    const p = [];
                    let el = e.target;
                    while (el) { p.push(el); el = el.parentElement; }
                    return p;
                })();

                // 在事件路径中查找最近的可滚动元素（到 container 为止）
                const isScrollable = (el) => {
                    if (!el || el === document || el === window) return false;
                    const style = window.getComputedStyle(el);
                    const overflowY = style.overflowY;
                    const canScroll = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
                        && el.scrollHeight > el.clientHeight;
                    return !!canScroll;
                };

                let scrollableEl = null;
                for (const el of path) {
                    if (!el || el === container) break;
                    if (el.nodeType === 1 && isScrollable(el)) { scrollableEl = el; break; }
                }

                if (scrollableEl) {
                    // 判断能否在滚动方向上继续滚动
                    const atTop = scrollableEl.scrollTop === 0;
                    const atBottom = Math.ceil(scrollableEl.scrollTop + scrollableEl.clientHeight) >= scrollableEl.scrollHeight;
                    if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
                        // 允许默认滚动，退出处理
                        return;
                    }
                }
            } catch (err) {
                // 如果判断过程中出错，回退到拦截行为（用于切换小部件）
                console.warn('滚轮判断出现异常，使用切换行为', err);
            }

            // 否则阻止默认并进行 widget 切换
            e.preventDefault();
            const contentArea = container.querySelector('.widget-content');
            if (!contentArea) return;

            const widgetItems = contentArea.querySelectorAll('.widget-item');
            if (widgetItems.length <= 1) return;

            const currentIndex = WidgetSystem.getActiveWidgetIndex(container);
            let newIndex = currentIndex;

            if (e.deltaY > 0) {
                newIndex = (currentIndex + 1) % widgetItems.length;
            } else {
                newIndex = (currentIndex - 1 + widgetItems.length) % widgetItems.length;
            }

            WidgetSystem.setActiveWidgetItem(container, newIndex);
        }, { passive: false });
    }
};

// 创建状态管理实例
const state = new WidgetSystemState();

/**
 * 小部件系统API
 * @namespace WidgetSystem
 */
export const WidgetSystem = {
    /**
     * 初始化小部件系统
     * @returns {Promise<void>}
     */
    async init() {
        try {          
            // 防止重复初始化
            if (state.isInitialized) {
                return Promise.resolve();
            }
            
            // 等待100ms，给I18n模块一个初始化的机会
            // 这是一个比较简单的解决方案，防止在主应用初始化过程中太早调用
            if (!I18n.isInitialized) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 初始化网格系统
            await GridSystem.init();
            
            // 加载已保存的小部件数据
            await this.loadWidgets();
            
            // 添加右键菜单项
            this.setupContextMenus();
            
            // 监听小部件数据变更
            document.addEventListener('widget-data-changed', () => {
                this.saveWidgets();
            });
            
            // 监听网格系统状态变化
            document.addEventListener('grid-system-toggled', (e) => {
                // 当网格系统状态改变时重新定位小部件
                if (e.detail.enabled) {
                    this.repositionWidgetsOnGridChange();
                }
            });
            
            // 监听网格尺寸变化
            document.addEventListener('grid-dimensions-changed', () => {
                // 网格尺寸变化时，重新定位所有小部件
                if (GridSystem.gridEnabled) {
                    this.repositionWidgetsOnGridChange();
                }
            });
            
            // 监听缩放事件
            document.addEventListener('grid-zoom-changed', (e) => {
                this.handleZoomChange(e.detail);
            });
            
            // 添加窗口大小变化监听器，确保小部件在视口内
            window.addEventListener('resize', Utils.debounce(() => {
                if (!GridSystem.gridEnabled) {
                    // 如果不启用网格系统，手动确保所有小部件在视口内
                    state.widgetContainers.forEach(container => {
                        this.ensureElementInViewport(container);
                    });
                    // 保存更新的位置
                    this.saveWidgets();
                }
            }, 250));
            
            state.isInitialized = true;
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
            state.widgets = data.widgets || [];
            
            // 清除现有小部件容器
            state.widgetContainers.forEach(container => {
                if (document.body.contains(container)) {
                    document.body.removeChild(container);
                }
            });
            state.widgetContainers = [];
            
            // 为每个保存的小部件容器创建DOM元素
            state.widgets.forEach(widgetData => {
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
            const widgetsToSave = state.widgetContainers.map(container => {
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
    handleContextMenu(event) {        // 如果已经有特定元素处理了右键菜单，不再处理
        // 增加排除背景按钮和时钟元素
        if (event.target.closest('.folder-button, .shortcut-button, input, textarea, #background-button, #time')) {
            return;
        }
        
        // 获取鼠标位置下的所有元素（包括可能被覆盖的元素）
        const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
        
        // 检查是否有更高层级的交互元素，避免小部件菜单干扰其他元素
        const hasHigherLevelInteractive = elementsAtPoint.some(el => 
            el.closest('#folder-list, #shortcut-list, #search-box, #background-button, #time') && 
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
            this.showWidgetContainerContextMenu(event, widgetContainer);        } else if (
            // 在空白区域创建小部件容器，但排除特定区域
            !event.target.closest('#folder-list, #shortcut-list, #search-box, #background-button, #time')
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
                text: I18n.getMessage('createWidgetContainer', '创建小部件容器'),
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
                text: I18n.getMessage('deleteWidgetContainer', '删除小部件容器'),
                callback: () => {
                    this.deleteWidgetContainer(container);
                }
            },
            {
                id: 'toggle-widget-fixed',
                text: container.dataset.fixed === 'true' 
                    ? I18n.getMessage('unfixWidgetContainer', '取消固定') 
                    : I18n.getMessage('fixWidgetContainer', '固定位置'),
                callback: () => {
                    this.toggleFixedContainer(container);
                }
            },            {
                type: 'separator'
            }
        ];
        
        Menu.ContextMenu.show(event, menuItems, { menuId: 'widget-container-menu' });
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
            const widgetItem = Utils.createElement('div');
            widgetItem.className = 'widget-item';
            widgetItem.dataset.widgetType = widgetType;
            widgetItem.id = widgetData.id || `widget-${widgetType}-${Date.now()}`;
            
            // 存储小部件数据
            widgetItem.widgetData = widgetData;
              // 添加加载指示器
            const loadingIndicator = Utils.createElement('div');
            loadingIndicator.className = 'widget-loading';
            loadingIndicator.textContent = getI18nMessage('loading', '加载中...');
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
                const errorElement = Utils.createElement('div');
                errorElement.className = 'widget-error';                errorElement.innerHTML = `<div>${getI18nMessage('loadFailed', '加载失败')}: ${error.message}</div>
                                     <button class="retry-button">${getI18nMessage('retry', '重试')}</button>
                                     <button class="remove-button">${getI18nMessage('remove', '移除')}</button>`;
                
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
            Utils.handleError(error, I18n.getMessage('addWidgetFailed', '添加小部件失败'));
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
        if (data.gridPosition && GridSystem.gridEnabled) {
            const pixelPos = GridSystem.gridToPixelPosition(data.gridPosition);
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
            if (GridSystem.gridEnabled) {
                GridSystem.updateElementGridData(container);
            }
        }
        
        // 设置固定状态
        container.dataset.fixed = data.fixed ? 'true' : 'false';
        if (data.fixed) {
            container.classList.add('widget-fixed');
        }
        
        // 创建侧边拖动条
        const dragHandle = Utils.createElement('div', 'widget-drag-handle', {
            title: '拖动'
        });
        dragHandle.style.cursor = 'move';
        
        container.appendChild(dragHandle);
        
        // 创建固定按钮
        const pinButton = Utils.createElement('button', 'widget-pin-button');
        
        // 使用安全的国际化方法
        const unfixText = getI18nMessage('unfixWidgetContainer', '取消固定');
        const fixText = getI18nMessage('fixWidgetContainer', '固定小部件');
        
        pinButton.title = data.fixed ? unfixText : fixText;
        pinButton.classList.add('segoe-icon');
        if (data.fixed) {
            pinButton.classList.add('widget-pinned');
            pinButton.textContent = '\uE841';
        } else {
            pinButton.classList.remove('widget-pinned');
            pinButton.textContent = '\uE842';
        }
        
        pinButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.toggleFixedContainer(container);
        });
        
        container.appendChild(pinButton);
        
        // 添加调整大小控制点
        const resizeHandle = Utils.createElement('div', 'widget-resize-handle', {
            title: '调整大小'
        });
        container.appendChild(resizeHandle);
        
        // 添加拖动事件
        EventHandlers.setupDragHandlers(dragHandle, container);
        
        // 添加调整大小事件
        EventHandlers.setupResizeHandlers(resizeHandle, container);
        
        // 创建内容区域包装器
        const contentWrapper = Utils.createElement('div', 'widget-content-wrapper');
        container.appendChild(contentWrapper);
        
        // 创建内容区域
        const contentArea = Utils.createElement('div', 'widget-content');
        contentWrapper.appendChild(contentArea);
        
        // 添加小部件指示器容器
        const indicatorsContainer = Utils.createElement('div', 'widget-indicators');
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
        EventHandlers.setupScrollHandlers(container);
        
        // 添加到DOM
        document.body.appendChild(container);
        
        // 添加到管理列表
        state.addContainer(container);
        
        // 保存状态
        this.saveWidgets();
        
        return container;
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
            const indicator = Utils.createElement('span');
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
        
        const addButton = Utils.createElement('button', 'widget-add-button', {
            title: I18n.getMessage('addWidget', '添加小部件')
        }, '+');
        
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
        if (!container) {
            console.error('缺少必需的容器参数');
            return;
        }

        try {
            // 获取可用小部件列表
            const availableWidgets = await this.getAvailableWidgets();
            
            if (!this.validateAvailableWidgets(availableWidgets)) {
                return;
            }
            
            // 创建并显示对话框
            await this.createAndShowWidgetDialog(container, availableWidgets);
            
        } catch (error) {
            this.handleWidgetDialogError(error);
        }
    },

    /**
     * 验证可用小部件列表
     * @param {Array} availableWidgets - 可用小部件列表
     * @returns {boolean} 是否有效
     */
    validateAvailableWidgets(availableWidgets) {
        if (!Array.isArray(availableWidgets) || availableWidgets.length === 0) {
            Notification.notify({
                title: getI18nMessage('notice', '提示'),
                message: getI18nMessage('noWidgetsAvailable', '没有可用的小部件'),
                type: 'info',
                duration: 3000
            });
            return false;
        }
        return true;
    },

    /**
     * 创建并显示小部件对话框
     * @param {HTMLElement} container - 小部件容器
     * @param {Array} availableWidgets - 可用小部件列表
     */
    async createAndShowWidgetDialog(container, availableWidgets) {
        // 创建对话框选项
        const formItems = availableWidgets.map(widget => ({
            id: widget.type,
            label: widget.name,
            type: 'checkbox',
            value: false
        }));
        
        // 获取国际化文本
        const dialogTexts = this.getDialogTexts();
        
        // 防止重复操作
        let isProcessing = false;
        
        Menu.showFormModal(
            dialogTexts.title,
            formItems,
            async (formData) => {
                if (isProcessing) return;
                await this.handleWidgetSelection(container, formData, () => isProcessing = true, () => isProcessing = false);
            },
            dialogTexts.add,
            dialogTexts.cancel
        );
    },

    /**
     * 获取对话框文本
     * @returns {Object} 包含所有文本的对象
     */
    getDialogTexts() {
        return {
            title: getI18nMessage('addWidgetTitle', '添加小部件'),
            add: getI18nMessage('add', '添加'),
            cancel: getI18nMessage('cancel', '取消')
        };
    },

    /**
     * 处理小部件选择
     * @param {HTMLElement} container - 小部件容器
     * @param {Object} formData - 表单数据
     * @param {Function} setProcessing - 设置处理状态函数
     * @param {Function} clearProcessing - 清除处理状态函数
     */
    async handleWidgetSelection(container, formData, setProcessing, clearProcessing) {
        setProcessing();
        
        try {
            const selectedWidgetTypes = this.extractSelectedWidgetTypes(formData);
            
            if (selectedWidgetTypes.length === 0) {
                this.showNoSelectionNotification();
                return;
            }
            
            await this.addSelectedWidgets(container, selectedWidgetTypes);
            this.showSuccessNotification(selectedWidgetTypes.length);
            
        } catch (error) {
            this.handleAddWidgetError(error);
        } finally {
            clearProcessing();
        }
    },

    /**
     * 提取选中的小部件类型
     * @param {Object} formData - 表单数据
     * @returns {Array} 选中的小部件类型数组
     */
    extractSelectedWidgetTypes(formData) {
        return Object.entries(formData)
            .filter(([, value]) => value === true)
            .map(([key]) => key);
    },

    /**
     * 显示未选择通知
     */
    showNoSelectionNotification() {
        Notification.notify({
            title: getI18nMessage('notice', '提示'),
            message: getI18nMessage('noWidgetSelected', '未选择任何小部件'),
            type: 'info',
            duration: 3000
        });
    },

    /**
     * 添加选中的小部件
     * @param {HTMLElement} container - 小部件容器
     * @param {Array} selectedWidgetTypes - 选中的小部件类型
     */
    async addSelectedWidgets(container, selectedWidgetTypes) {
        for (const type of selectedWidgetTypes) {
            await this.addWidgetItem(container, type);
        }
    },

    /**
     * 显示成功通知
     * @param {number} count - 添加的小部件数量
     */
    showSuccessNotification(count) {
        if (count > 0) {
            Notification.notify({
                title: getI18nMessage('success', '成功'),
                message: getI18nMessage('widgetsAdded', '已添加所选小部件'),
                type: 'success',
                duration: 3000
            });
        }
    },

    /**
     * 处理添加小部件错误
     * @param {Error} error - 错误对象
     */
    handleAddWidgetError(error) {
        console.error('添加小部件失败:', error);
        Notification.notify({
            title: getI18nMessage('error', '错误'),
            message: getI18nMessage('addWidgetFailed', '添加小部件失败'),
            type: 'error',
            duration: 5000
        });
    },

    /**
     * 处理小部件对话框错误
     * @param {Error} error - 错误对象
     */
    handleWidgetDialogError(error) {
        console.error('获取可用小部件失败:', error);
        Notification.notify({
            title: getI18nMessage('error', '错误'),
            message: getI18nMessage('loadingWidgetsFailed', '加载可用小部件失败'),
            type: 'error',
            duration: 5000
        });
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
        state.removeContainer(container);
        
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
                pinButton.classList.add('segoe-icon');
                pinButton.classList.remove('widget-pinned');
                pinButton.textContent = '\uE842';
                pinButton.title = I18n.getMessage('fixWidgetContainer', '固定小部件');
            }
        } else {
            // 固定小部件
            container.dataset.fixed = 'true';
            container.classList.add('widget-fixed');
            
            if (pinButton) {
                pinButton.classList.add('segoe-icon');
                pinButton.classList.add('widget-pinned');
                pinButton.textContent = '\uE841';
                pinButton.title = I18n.getMessage('unfixWidgetContainer', '取消固定');
            }
        }
        
        // 保存状态
        this.saveWidgets();
    },
  
  
      /**
     * 处理缩放变化
     * @param {Object} zoomData - 缩放数据
     */
    handleZoomChange(zoomData) {
        const { previousZoom, currentZoom, zoomRatio, zoomCompensation } = zoomData;
        
        // 获取有效的网格尺寸
        const gridInfo = this.getEffectiveGridInfo();
        
        // 记录当前网格尺寸信息
        this.updateGridDataAttributes(gridInfo);
        
        if (GridSystem.gridEnabled) {
            // 网格系统启用时的处理
            this.handleGridEnabledZoom(zoomCompensation, gridInfo);
        } else {
            // 网格系统禁用时的处理
            this.handleGridDisabledZoom(zoomCompensation);
        }
    },

    /**
     * 获取有效的网格信息
     * @returns {Object} 网格信息
     */
    getEffectiveGridInfo() {
        return {
            columnCount: parseInt(document.body.dataset.effectiveColumnCount) || GridSystem.gridColumnCount,
            rowCount: parseInt(document.body.dataset.effectiveRowCount) || GridSystem.gridRowCount
        };
    },

    /**
     * 更新网格数据属性
     * @param {Object} gridInfo - 网格信息
     */
    updateGridDataAttributes(gridInfo) {
        document.body.dataset.currentGridColumns = gridInfo.columnCount;
        document.body.dataset.currentGridRows = gridInfo.rowCount;
    },

    /**
     * 处理网格启用时的缩放
     * @param {number} zoomCompensation - 缩放补偿
     * @param {Object} gridInfo - 网格信息
     */
    handleGridEnabledZoom(zoomCompensation, gridInfo) {
        this.repositionWidgetsOnGridChange(zoomCompensation, gridInfo.columnCount, gridInfo.rowCount);
    },    /**
     * 处理网格禁用时的缩放
     * @param {number} zoomCompensation - 缩放补偿
     */
    handleGridDisabledZoom(zoomCompensation) {
        // 使用requestAnimationFrame优化性能
        requestAnimationFrame(() => {
            state.widgetContainers.forEach(container => {
                WidgetSystem.applyZoomCompensationToContainer(container, zoomCompensation);
            });
            
            // 保存新的位置
            WidgetSystem.saveWidgets();
        });
    },

    /**
     * 对容器应用缩放补偿
     * @param {HTMLElement} container - 容器元素
     * @param {number} zoomCompensation - 缩放补偿
     */
    applyZoomCompensationToContainer(container, zoomCompensation) {
        // 获取当前位置和尺寸
        const position = this.getContainerPosition(container);
        const size = this.getContainerSize(container);
        
        // 计算补偿后的值
        const compensated = this.calculateCompensatedValues(position, size, zoomCompensation);
        
        // 应用新的位置和尺寸
        this.applyContainerTransform(container, compensated, zoomCompensation);
        
        // 确保容器在视口内
        this.ensureElementInViewport(container);
    },

    /**
     * 获取容器位置
     * @param {HTMLElement} container - 容器元素
     * @returns {Object} 位置信息
     */
    getContainerPosition(container) {
        return {
            left: parseInt(container.style.left) || 0,
            top: parseInt(container.style.top) || 0
        };
    },

    /**
     * 获取容器尺寸
     * @param {HTMLElement} container - 容器元素
     * @returns {Object} 尺寸信息
     */
    getContainerSize(container) {
        return {
            width: parseInt(container.style.width) || 200,
            height: parseInt(container.style.height) || 150
        };
    },

    /**
     * 计算补偿后的值
     * @param {Object} position - 位置信息
     * @param {Object} size - 尺寸信息
     * @param {number} zoomCompensation - 缩放补偿
     * @returns {Object} 补偿后的值
     */
    calculateCompensatedValues(position, size, zoomCompensation) {
        return {
            left: Math.round(position.left * zoomCompensation),
            top: Math.round(position.top * zoomCompensation),
            width: Math.round(size.width * zoomCompensation),
            height: Math.round(size.height * zoomCompensation)
        };
    },

    /**
     * 应用容器变换
     * @param {HTMLElement} container - 容器元素
     * @param {Object} compensated - 补偿后的值
     * @param {number} zoomCompensation - 缩放补偿
     */
    applyContainerTransform(container, compensated, zoomCompensation) {
        // 应用位置和尺寸
        container.style.left = `${compensated.left}px`;
        container.style.top = `${compensated.top}px`;
        container.style.width = `${compensated.width}px`;
        container.style.height = `${compensated.height}px`;
        
        // 设置CSS变量
        this.setZoomCSSVariables(container, zoomCompensation);
        
        // 应用变换
        this.applyZoomTransform(container, zoomCompensation);
    },

    /**
     * 设置缩放CSS变量
     * @param {HTMLElement} container - 容器元素
     * @param {number} zoomCompensation - 缩放补偿
     */
    setZoomCSSVariables(container, zoomCompensation) {
        container.style.setProperty('--widget-zoom-compensation', zoomCompensation);
        container.style.setProperty('--widget-inverse-zoom', 1/zoomCompensation);
    },

    /**
     * 应用缩放变换
     * @param {HTMLElement} container - 容器元素
     * @param {number} zoomCompensation - 缩放补偿
     */
    applyZoomTransform(container, zoomCompensation) {
        if (zoomCompensation !== 1) {
            container.style.transform = `scale(${1/zoomCompensation})`;
            container.style.transformOrigin = 'top left';
        } else {
            container.style.transform = '';
        }
    },
    
    /**
     * 当网格系统改变时重新定位所有小部件
     * @param {number} zoomCompensation - 缩放补偿系数
     * @param {number} effectiveColumnCount - 有效列数
     * @param {number} effectiveRowCount - 有效行数
     */
    repositionWidgetsOnGridChange(zoomCompensation = 1, effectiveColumnCount, effectiveRowCount) {
        if (!effectiveColumnCount) {
            effectiveColumnCount = parseInt(document.body.dataset.effectiveColumnCount) || GridSystem.gridColumnCount;
        }
        
        if (!effectiveRowCount) {
            effectiveRowCount = parseInt(document.body.dataset.effectiveRowCount) || GridSystem.gridRowCount;
        }
        
        // 首先检测冲突的小部件并调整它们的位置，防止重叠
        this.resolveWidgetConflicts(effectiveColumnCount, effectiveRowCount, zoomCompensation);
        
        // 排序处理 - 先处理固定的小部件
        const sorted = [...state.widgetContainers].sort((a, b) => {
            return (a.dataset.fixed === 'true' ? 1 : 0) - (b.dataset.fixed === 'true' ? 1 : 0);
        });

        sorted.forEach(container => {
            // 先验证网格位置数据是否在有效范围内
            const gridPosition = {
                gridX: parseInt(container.dataset.gridX) || 0,
                gridY: parseInt(container.dataset.gridY) || 0,
                gridColumns: parseInt(container.dataset.gridColumns) || 1,
                gridRows: parseInt(container.dataset.gridRows) || 1
            };
            
            // 验证并调整网格位置 - 确保不超出网格边界
            const validatedPosition = this.validateWidgetGridPosition(gridPosition, effectiveColumnCount, effectiveRowCount);
            
            // 更新容器的网格数据
            container.dataset.gridX = validatedPosition.gridX;
            container.dataset.gridY = validatedPosition.gridY;
            container.dataset.gridColumns = validatedPosition.gridColumns;
            container.dataset.gridRows = validatedPosition.gridRows;
            
            // 基于验证后的网格位置重新定位
            GridSystem.repositionElementFromGridData(container);
            
            // 设置缩放补偿CSS变量，供小部件内部元素使用
            container.style.setProperty('--widget-zoom-compensation', zoomCompensation);
            container.style.setProperty('--widget-inverse-zoom', 1/zoomCompensation);
            
            // 精确应用反向变换
            if (zoomCompensation !== 1) {
                container.style.transform = `scale(${1/zoomCompensation})`;
                container.style.transformOrigin = 'top left';
            } else {
                container.style.transform = '';
            }
        });
        
        // 保存更新后的位置
        this.saveWidgets();
    },
    
    /**
     * 验证小部件网格位置，确保在有效范围内且不重叠
     * @param {Object} gridPosition - 网格位置对象
     * @param {number} maxColumns - 最大列数
     * @param {number} maxRows - 最大行数
     * @returns {Object} 调整后的网格位置
     */
    validateWidgetGridPosition(gridPosition, maxColumns, maxRows) {
        const { gridX, gridY, gridColumns, gridRows } = gridPosition;
        
        // 确保小部件尺寸在允许范围内
        const validColumns = Math.min(gridColumns, Math.max(1, maxColumns / 2));
        const validRows = Math.min(gridRows, Math.max(1, maxRows / 2));
        
        // 确保小部件位置在网格范围内
        const validX = Math.max(0, Math.min(maxColumns - validColumns, gridX));
        const validY = Math.max(0, Math.min(maxRows - validRows, gridY));
        
        return {
            gridX: validX,
            gridY: validY,
            gridColumns: validColumns,
            gridRows: validRows
        };
    },
    
    /**
     * 解决小部件在网格中的冲突
     * @param {number} maxColumns - 最大列数
     * @param {number} maxRows - 最大行数
     * @param {number} zoomCompensation - 缩放补偿系数
     */
    resolveWidgetConflicts(maxColumns, maxRows, zoomCompensation = 1) {
        // 创建网格占用状态矩阵
        const gridState = Array(maxRows).fill().map(() => Array(maxColumns).fill(null));
        
        // 对小部件按照固定状态排序 - 固定的小部件优先占位
        const sortedContainers = [...state.widgetContainers].sort((a, b) => {
            const aFixed = a.dataset.fixed === 'true' ? 1 : 0;
            const bFixed = b.dataset.fixed === 'true' ? 1 : 0;
            return bFixed - aFixed; // 固定的优先
        });
        
        // 首先标记所有固定小部件的位置
        sortedContainers.filter(c => c.dataset.fixed === 'true').forEach(container => {
            const gridX = parseInt(container.dataset.gridX) || 0;
            const gridY = parseInt(container.dataset.gridY) || 0;
            const gridColumns = parseInt(container.dataset.gridColumns) || 1;
            const gridRows = parseInt(container.dataset.gridRows) || 1;
            
            // 标记小部件占用的网格位置
            for (let y = gridY; y < Math.min(gridY + gridRows, maxRows); y++) {
                for (let x = gridX; x < Math.min(gridX + gridColumns, maxColumns); x++) {
                    if (gridState[y][x] === null) {
                        gridState[y][x] = container;
                    }
                }
            }
        });
        
        // 然后检查并移动非固定的小部件
        sortedContainers.filter(c => c.dataset.fixed !== 'true').forEach(container => {
            const gridX = parseInt(container.dataset.gridX) || 0;
            const gridY = parseInt(container.dataset.gridY) || 0;
            const gridColumns = parseInt(container.dataset.gridColumns) || 1;
            const gridRows = parseInt(container.dataset.gridRows) || 1;
            
            // 检查此小部件是否需要重定位
            let needsRepositioning = false;
            
            // 检查小部件是否超出网格范围
            if (gridX + gridColumns > maxColumns || gridY + gridRows > maxRows) {
                needsRepositioning = true;
            } else {
                // 检查是否与其他小部件冲突
                for (let y = gridY; y < gridY + gridRows; y++) {
                    for (let x = gridX; x < gridX + gridColumns; x++) {
                        if (gridState[y][x] !== null && gridState[y][x] !== container) {
                            needsRepositioning = true;
                            break;
                        }
                    }
                    if (needsRepositioning) break;
                }
            }
            
            // 如果需要重定位，寻找新位置
            if (needsRepositioning) {
                const newPosition = this.findAvailableGridPosition(gridState, gridColumns, gridRows, maxColumns, maxRows);
                
                if (newPosition) {
                    // 更新小部件位置
                    container.dataset.gridX = newPosition.x;
                    container.dataset.gridY = newPosition.y;
                    
                    // 标记新位置为已占用
                    for (let y = newPosition.y; y < newPosition.y + gridRows; y++) {
                        for (let x = newPosition.x; x < newPosition.x + gridColumns; x++) {
                            if (y < maxRows && x < maxColumns) {
                                gridState[y][x] = container;
                            }
                        }
                    }
                } else {
                    // 如果找不到合适的位置，缩小小部件尺寸
                    const scaledColumns = Math.max(1, Math.floor(gridColumns / 2));
                    const scaledRows = Math.max(1, Math.floor(gridRows / 2));
                    
                    const scaledPosition = this.findAvailableGridPosition(gridState, scaledColumns, scaledRows, maxColumns, maxRows);
                    
                    if (scaledPosition) {
                        container.dataset.gridX = scaledPosition.x;
                        container.dataset.gridY = scaledPosition.y;
                        container.dataset.gridColumns = scaledColumns;
                        container.dataset.gridRows = scaledRows;
                        
                        // 标记新位置为已占用
                        for (let y = scaledPosition.y; y < scaledPosition.y + scaledRows; y++) {
                            for (let x = scaledPosition.x; x < scaledPosition.x + scaledColumns; x++) {
                                if (y < maxRows && x < maxColumns) {
                                    gridState[y][x] = container;
                                }
                            }
                        }
                    }
                }
            } else {
                // 如果不需要重定位，标记当前位置为已占用
                for (let y = gridY; y < Math.min(gridY + gridRows, maxRows); y++) {
                    for (let x = gridX; x < Math.min(gridX + gridColumns, maxColumns); x++) {
                        if (gridState[y][x] === null) {
                            gridState[y][x] = container;
                        }
                    }
                }
            }
        });
    },
    
    /**
     * 寻找网格中可用位置
     * @param {Array} gridState - 网格占用状态
     * @param {number} columns - 所需列数
     * @param {number} rows - 所需行数
     * @param {number} maxColumns - 最大列数
     * @param {number} maxRows - 最大行数
     * @returns {Object|null} 可用位置或null
     */
    findAvailableGridPosition(gridState, columns, rows, maxColumns, maxRows) {
        for (let y = 0; y <= maxRows - rows; y++) {
            for (let x = 0; x <= maxColumns - columns; x++) {
                let available = true;
                
                // 检查此位置是否可用
                checkPos: for (let dy = 0; dy < rows; dy++) {
                    for (let dx = 0; dx < columns; dx++) {
                        if (gridState[y + dy][x + dx] !== null) {
                            available = false;
                            break checkPos;
                        }
                    }
                }
                
                if (available) {
                    return { x, y };
                }
            }
        }
        
        return null; // 找不到可用位置
    },
    
    /**
     * 清理资源和事件监听器
     */
    cleanup() {
        try {
            // 清理所有小部件容器
            state.widgetContainers.forEach(container => {
                this.cleanupContainer(container);
            });
            
            // 清空状态
            state.clear();
            
            // 移除事件监听器
            this.removeGlobalEventListeners();
            
        } catch (error) {
            console.error('清理资源时发生错误:', error);
        }
    },

    /**
     * 清理单个容器
     * @param {HTMLElement} container - 要清理的容器
     */
    cleanupContainer(container) {
        if (!container) return;
        
        try {
            // 清理小部件项
            const widgetItems = container.querySelectorAll('.widget-item');
            widgetItems.forEach(item => {
                // 如果小部件有cleanup方法，调用它
                if (item.widgetInstance && typeof item.widgetInstance.cleanup === 'function') {
                    item.widgetInstance.cleanup();
                }
            });
            
            // 从DOM中移除
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
            
        } catch (error) {
            console.error('清理容器时发生错误:', error);
        }
    },

    /**
     * 移除全局事件监听器
     */
    removeGlobalEventListeners() {
        // 这里可以添加需要清理的全局事件监听器
        document.removeEventListener('widget-data-changed', this.saveWidgets.bind(this));
    },

    /**
     * 验证小部件数据的完整性
     * @param {Object} data - 要验证的数据
     * @returns {boolean} 是否有效
     */
    validateWidgetData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        // 验证必需字段
        const requiredFields = ['containers'];
        for (const field of requiredFields) {
            if (!(field in data)) {
                console.warn(`小部件数据缺少必需字段: ${field}`);
                return false;
            }
        }

        // 验证容器数据
        if (!Array.isArray(data.containers)) {
            console.warn('容器数据不是数组');
            return false;
        }

        return true;
    },    /**
     * 安全的DOM操作包装器
     * 现在使用Utils中的Environment.safeDOMOperation
     * @param {Function} operation - 要执行的DOM操作
     * @param {string} errorMessage - 错误消息
     * @returns {*} 操作结果
     */
    safeDOMOperation(operation, errorMessage = 'DOM操作失败') {
        return Utils.Environment.safeDOMOperation(operation, null) || Utils.handleError(new Error(errorMessage), errorMessage);
    },

    /**
     * 节流函数，直接使用Utils中的throttle方法
     * @param {Function} func - 要节流的函数
     * @param {number} limit - 节流间隔（毫秒）
     * @returns {Function} 节流后的函数
     */
    throttle(func, limit) {
        return Utils.throttle(func, limit);
    },

    /**
     * 批量更新DOM元素
     * @param {Array} updates - 更新操作数组
     */
    batchDOMUpdates(updates) {
        // 使用requestAnimationFrame优化性能
        requestAnimationFrame(() => {
            updates.forEach(update => {
                try {
                    update();
                } catch (error) {
                    console.error('批量DOM更新中的操作失败:', error);
                }
            });
        });
    },

    /**
     * 检查内存使用情况
     */
    checkMemoryUsage() {
        if (performance.memory) {
            const memInfo = performance.memory;
            const usedPercent = (memInfo.usedJSHeapSize / memInfo.totalJSHeapSize) * 100;
            
            if (usedPercent > 80) {
                console.warn(`内存使用率较高: ${usedPercent.toFixed(2)}%`);
                // 可以在这里触发垃圾回收或清理操作
                this.performMemoryCleanup();
            }
        }
    },

    /**
     * 执行内存清理
     */
    performMemoryCleanup() {
        try {
            // 清理不必要的缓存
            state.clearCache();
            
            // 强制垃圾回收（如果支持）
            if (window.gc) {
                window.gc();
            }
            
        } catch (error) {
            console.error('内存清理失败:', error);
        }
    },

    /**
     * 安全初始化小部件系统
     * @param {Object} options - 初始化选项
     */
    async safeInit(options = {}) {
        try {
            // 防止重复初始化
            if (state.isInitialized) {
                console.warn('小部件系统已经初始化');
                return;
            }

            // 验证依赖项
            if (!this.validateDependencies()) {
                throw new Error('依赖项验证失败');
            }

            // 执行初始化
            await this.init();

            // 设置性能监控
            this.setupPerformanceMonitoring();

        } catch (error) {
            console.error('小部件系统初始化失败:', error);
            this.handleInitializationError(error);
        }
    },

    /**
     * 验证依赖项
     * @returns {boolean} 是否所有依赖项都可用
     */
    validateDependencies() {
        const dependencies = [
            'Utils', 'I18n', 'WidgetRegistry', 'GridSystem', 'Notification', 'Menu'
        ];

        const missing = dependencies.filter(dep => typeof window[dep] === 'undefined');
        
        if (missing.length > 0) {
            console.error('缺少依赖项:', missing);
            return false;
        }

        return true;
    },

    /**
     * 处理初始化错误
     * @param {Error} error - 错误对象
     */
    handleInitializationError(error) {
        // 使用Utils中的统一错误处理
        Utils.handleError(error, '小部件系统无法正常启动，请刷新页面重试');

        // 尝试恢复到安全状态
        this.recoverToSafeState();
    },

    /**
     * 恢复到安全状态
     */
    recoverToSafeState() {
        try {
            // 清理可能损坏的状态
            state.clear();
            
            // 移除可能残留的DOM元素
            const orphanedContainers = document.querySelectorAll('.widget-container');
            orphanedContainers.forEach(container => {
                if (container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            });

        } catch (recoveryError) {
            console.error('恢复到安全状态失败:', recoveryError);
        }
    },

    /**
     * 设置性能监控
     */
    setupPerformanceMonitoring() {
        // 节流的内存检查
        const throttledMemoryCheck = this.throttle(() => {
            this.checkMemoryUsage();
        }, 30000); // 每30秒检查一次

        // 定期检查内存使用情况
        setInterval(throttledMemoryCheck, 30000);

        // 监听页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // 页面隐藏时执行清理
                this.performMemoryCleanup();
            }
        });
    },

    /**
     * 获取系统状态报告
     * @returns {Object} 系统状态信息
     */
    getSystemStatus() {
        return {
            initialized: state.isInitialized,
            containerCount: state.widgetContainers.length,
            widgetCount: state.widgets.length,
            memoryUsage: performance.memory ? {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            } : null,
            gridEnabled: GridSystem?.gridEnabled || false,
            timestamp: Date.now()
        };
    },

    /**
     * 确保元素在视口内
     * @param {HTMLElement} element - 要检查的元素
     */
    ensureElementInViewport(element) {
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let left = parseInt(element.style.left) || 0;
        let top = parseInt(element.style.top) || 0;
        const width = parseInt(element.style.width) || element.offsetWidth;
        const height = parseInt(element.style.height) || element.offsetHeight;
        
        let changed = false;
        
        // 确保不超出右边界
        if (left + width > viewportWidth) {
            left = Math.max(0, viewportWidth - width);
            changed = true;
        }
        
        // 确保不超出下边界
        if (top + height > viewportHeight) {
            top = Math.max(0, viewportHeight - height);
            changed = true;
        }
        
        // 确保不超出左边界
        if (left <  0) {
            left = 0;
            changed = true;
        }
        
        // 确保不超出上边界
        if (top < 0) {
            top = 0;
            changed = true;
        }
        
        // 如果位置发生了变化，更新元素位置
        if (changed) {
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        }    },
};

