/**
 * 小部件系统模块
 * 提供小部件容器的创建、管理和交互功能，支持响应式布局、国际化、主题适配等。
 * @author System
 * @version 1.0.1
 * @date 2025-07-09
 */

import { Utils, Menu, I18n, Notification, WidgetRegistry, DesktopSystem } from '../core/index.js';

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
        if (window.DesktopSystem && typeof window.DesktopSystem.addDraggableFunctionality === 'function') {
            const dragController = window.DesktopSystem.addDraggableFunctionality(container, {
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
            
            // 加载已保存的小部件数据
            await this.loadWidgets();
            
            // 添加右键菜单项
            this.setupContextMenus();
            
            // 监听小部件数据变更
            document.addEventListener('widget-data-changed', () => {
                this.saveWidgets();
            });
            
            // 添加窗口大小变化监听器，确保小部件在视口内
            window.addEventListener('resize', Utils.debounce(() => {
                // 手动确保所有小部件在视口内
                state.widgetContainers.forEach(container => {
                    this.ensureElementInViewport(container);
                });
                // 保存更新的位置
                this.saveWidgets();
            }, 250));
            
            // 初始化文件夹绑定功能
            this.initFolderBinding();
            
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
            let widgets = data.widgets || [];
            
            // 迁移逻辑：将旧的没有文件夹绑定的小部件容器自动绑定到ID为1的文件夹
            try {
                console.log('开始执行迁移逻辑');
                
                // 硬编码使用ID为1的文件夹作为默认文件夹
                const targetFolderId = '1';
                console.log('使用固定文件夹ID作为默认文件夹:', targetFolderId);
                
                // 检查是否需要迁移
                const needMigration = widgets.some(widget => widget.folderId === undefined || widget.folderId === null || widget.folderId === 'null' || widget.folderId === '0');
                console.log('是否需要迁移:', needMigration);
                
                if (needMigration) {
                    console.log('开始执行迁移');
                    // 执行迁移
                    widgets = widgets.map(widget => {
                        if (widget.folderId === undefined || widget.folderId === null || widget.folderId === 'null' || widget.folderId === '0') {
                            // 为没有folderId或folderId为'0'的小部件添加目标文件夹ID
                            console.log('迁移小部件容器:', widget.id, '到文件夹:', targetFolderId);
                            return { ...widget, folderId: targetFolderId };
                        }
                        return widget;
                    });
                    
                    // 保存迁移后的数据
                    await chrome.storage.local.set({ widgets });
                    console.log('小部件容器迁移完成：所有未绑定文件夹的小部件已绑定到ID为1的文件夹');
                    console.log('迁移后的数据:', widgets);
                }
            } catch (error) {
                console.error('小部件容器迁移失败:', error);
            }
            
            // 确保所有小部件容器都有folderId
            console.log('迁移后的widgets数据:', widgets);
            
            state.widgets = widgets;
            
            // 清除现有小部件容器
            state.widgetContainers.forEach(container => {
                // 检查容器是否在document.body或shortcut-list中
                if (document.body.contains(container)) {
                    document.body.removeChild(container);
                } else {
                    const shortcutList = document.getElementById('shortcut-list');
                    if (shortcutList && shortcutList.contains(container)) {
                        shortcutList.removeChild(container);
                    }
                }
            });
            state.widgetContainers = [];
            
            // 不再直接创建DOM元素，而是让desktopSystem.js在需要时加载小部件
            // 小部件将在切换文件夹时通过desktopSystem.js的网格系统加载
            console.log('小部件数据加载完成，共', state.widgets.length, '个小部件容器');
            
            // 触发小部件数据加载完成事件，通知其他模块
            document.dispatchEvent(new CustomEvent('widgets-loaded', {
                detail: { widgets: state.widgets }
            }));
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
                return {
                    id: container.id,
                    folderId: container.dataset.folderId || null,
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
     * 获取指定文件夹ID的小部件数据
     * @param {string} folderId - 文件夹ID
     * @returns {Array} 小部件数据数组
     */
    getWidgetsByFolderId(folderId) {
        return state.widgets.filter(widget => widget.folderId === folderId);
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
        if (event.target.closest('.folder-button, .shortcut-button, input, textarea, #background-button, #time')) {
            return;
        }
        
        // 检查是否点击在快捷方式按钮框内
        const isInShortcutList = event.target.closest('#shortcut-list') || 
            document.elementsFromPoint(event.clientX, event.clientY).some(el => el.closest('#shortcut-list'));
        
        // 检查是否点击在小部件或小部件容器上
        const widgetItem = event.target.closest('.widget-item');
        const widgetContainer = event.target.closest('.widget-container');
        
        // 小部件项的右键菜单 - 确保不是在功能区点击
        if (widgetItem && !event.target.closest('.widget-functional-area')) {
            event.preventDefault();
            this.showWidgetItemContextMenu(event, widgetItem);
        }
        // 小部件容器的右键菜单 - 确保不是点击在小部件项上
        else if (widgetContainer && !widgetItem) {
            event.preventDefault();
            this.showWidgetContainerContextMenu(event, widgetContainer);
        }
        // 只在快捷方式按钮框内显示创建菜单
        else if (isInShortcutList) {
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
                    // 获取当前选中的文件夹
                    chrome.storage.local.get('folder', (result) => {
                        const currentFolderId = result.folder;
                        
                        this.createWidgetContainer({ 
                            folderId: currentFolderId,
                        });
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
            },
            {
                id: container.dataset.folderId ? 'unbind-folder' : 'bind-folder',
                text: container.dataset.folderId 
                    ? I18n.getMessage('unbindFolder', '取消绑定文件夹') 
                    : I18n.getMessage('bindFolder', '绑定到文件夹'),
                callback: () => {
                    if (container.dataset.folderId) {
                        this.unbindWidgetFromFolder(container);
                    } else {
                        this.showFolderSelectionDialog(container);
                    }
                }
            },
            {
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
                errorElement.className = 'widget-error';
                errorElement.innerHTML = `<div>${getI18nMessage('loadFailed', '加载失败')}: ${error.message}</div>
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
     * @returns {Object} 创建的小部件数据对象
     */
    createWidgetContainer(data = {}) {
        // 生成唯一ID
        const containerId = data.id || `widget-container-${Date.now()}`;
        
        // 设置文件夹绑定
        const folderId = data.folderId !== undefined ? data.folderId : null;
        console.log('createWidgetContainer - folderId:', folderId);
        
        // 设置固定状态
        const fixed = data.fixed ? true : false;
        
        // 创建小部件数据对象（与desktopSystem.js兼容的格式）
        const widgetData = {
            id: containerId,
            folderId: folderId,
            fixed: fixed,
            activeIndex: 0,
            items: data.items && Array.isArray(data.items) ? data.items : []
        };
        
        // 添加到状态
        state.widgets.push(widgetData);
        
        // 显示通知
        const title = getI18nMessage('widgetContainerCreated', '小部件容器已创建');
        const message = getI18nMessage('widgetContainerCreatedMessage', '您可以通过右键菜单添加小部件');
        
        Notification.notify({
            title: title,
            message: message,
            type: 'success',
            duration: 2000
        });
        
        // 保存小部件容器
        this.saveWidgets();
        
        console.log('创建小部件容器:', containerId, '绑定到文件夹:', folderId);
        
        // 触发小部件创建事件，通知desktopSystem.js重新渲染
        document.dispatchEvent(new CustomEvent('widget-created', {
            detail: { widgetData: widgetData }
        }));
        
        return widgetData;
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
        
        const widgetItems = contentArea.querySelectorAll('.widget-item');
        if (widgetItems.length <= 1) return; // 只有一个小部件时不需要指示器
        
        const activeIndex = this.getActiveWidgetIndex(container);
        
        widgetItems.forEach((_, index) => {
            const indicator = Utils.createElement('div', 'widget-indicator');
            if (index === activeIndex) {
                indicator.classList.add('active');
            }
            
            // 添加点击事件
            indicator.addEventListener('click', () => {
                this.setActiveWidgetItem(container, index);
            });
            
            indicatorsContainer.appendChild(indicator);
        });
    },
    
    /**
     * 更新活动指示器
     * @param {HTMLElement} container - 小部件容器元素
     * @param {number} activeIndex - 活动小部件的索引
     */
    updateActiveIndicator(container, activeIndex) {
        const indicatorsContainer = container.querySelector('.widget-indicators');
        if (!indicatorsContainer) return;
        
        const indicators = indicatorsContainer.querySelectorAll('.widget-indicator');
        indicators.forEach((indicator, index) => {
            if (index === activeIndex) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });
    },
    
    /**
     * 添加"添加"按钮到小部件容器
     * @param {HTMLElement} container - 小部件容器元素
     */
    addAddButton(container) {
        const contentArea = container.querySelector('.widget-content');
        if (!contentArea) return;
        
        // 检查是否已经有添加按钮
        if (contentArea.querySelector('.widget-add-button')) return;
        
        const addButton = Utils.createElement('div', 'widget-add-button');
        
        const addIcon = Utils.createElement('div', 'add-icon');
        addIcon.textContent = '+';
        
        const addText = Utils.createElement('div', 'add-text');
        addText.textContent = getI18nMessage('addWidget', '添加小部件');
        
        addButton.appendChild(addIcon);
        addButton.appendChild(addText);
        
        addButton.addEventListener('click', () => {
            this.showAddWidgetDialog(container);
        });
        
        contentArea.appendChild(addButton);
    },
    
    /**
     * 显示添加小部件对话框
     * @param {HTMLElement} container - 小部件容器元素
     */
    showAddWidgetDialog(container) {
        const widgetTypes = WidgetRegistry.getWidgetTypes();
        
        const menuItems = widgetTypes.map(type => ({
            id: type.type,
            text: type.name,
            callback: () => {
                this.addWidgetItem(container, type.type);
            }
        }));
        
        const dialogTitle = getI18nMessage('addWidget', '添加小部件');
        Menu.ContextMenu.show({ clientX: 100, clientY: 100 }, menuItems, { 
            menuId: 'add-widget-dialog',
            title: dialogTitle
        });
    },
    
    /**
     * 删除小部件容器
     * @param {HTMLElement} container - 小部件容器元素
     */
    deleteWidgetContainer(container) {
        const confirmMessage = getI18nMessage('confirmDeleteWidgetContainer', '确定要删除这个小部件容器吗？');
        if (!confirm(confirmMessage)) return;
        
        // 从DOM中移除
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }
        
        // 从管理列表中移除
        state.removeContainer(container);
        
        // 保存状态
        this.saveWidgets();
        
        // 显示通知
        const title = getI18nMessage('widgetContainerDeleted', '小部件容器已删除');
        Notification.notify({
            title: title,
            type: 'success',
            duration: 2000
        });
    },
    
    /**
     * 切换小部件容器的固定状态
     * @param {HTMLElement} container - 小部件容器元素
     */
    toggleFixedContainer(container) {
        const isFixed = container.dataset.fixed === 'true';
        container.dataset.fixed = (!isFixed).toString();
        
        if (!isFixed) {
            container.classList.add('widget-fixed');
        } else {
            container.classList.remove('widget-fixed');
        }
        
        // 更新固定按钮
        const pinButton = container.querySelector('.widget-pin-button');
        if (pinButton) {
            const unfixText = getI18nMessage('unfixWidgetContainer', '取消固定');
            const fixText = getI18nMessage('fixWidgetContainer', '固定小部件');
            pinButton.title = !isFixed ? unfixText : fixText;
            
            if (!isFixed) {
                pinButton.classList.add('widget-pinned');
                pinButton.textContent = '\uE841';
            } else {
                pinButton.classList.remove('widget-pinned');
                pinButton.textContent = '\uE842';
            }
        }
        
        // 保存状态
        this.saveWidgets();
        
        // 显示通知
        const title = !isFixed 
            ? getI18nMessage('widgetFixed', '小部件已固定') 
            : getI18nMessage('widgetUnfixed', '小部件已取消固定');
        Notification.notify({
            title: title,
            type: 'success',
            duration: 2000
        });
    },
    
    /**
     * 绑定小部件到文件夹
     * @param {HTMLElement} container - 小部件容器元素
     * @param {string} folderId - 文件夹ID
     */
    bindWidgetToFolder(container, folderId) {
        container.dataset.folderId = folderId;
        container.classList.add('widget-bound-to-folder');
        
        // 保存状态
        this.saveWidgets();
        
        // 显示通知
        const title = getI18nMessage('widgetBoundToFolder', '小部件已绑定到文件夹');
        Notification.notify({
            title: title,
            type: 'success',
            duration: 2000
        });
    },
    
    /**
     * 取消绑定小部件与文件夹的关联
     * @param {HTMLElement} container - 小部件容器元素
     */
    unbindWidgetFromFolder(container) {
        container.dataset.folderId = null;
        container.classList.remove('widget-bound-to-folder');
        
        // 保存状态
        this.saveWidgets();
        
        // 显示通知
        const title = getI18nMessage('widgetUnboundFromFolder', '小部件已取消绑定文件夹');
        Notification.notify({
            title: title,
            type: 'success',
            duration: 2000
        });
    },
    
    /**
     * 显示文件夹选择对话框
     * @param {HTMLElement} container - 小部件容器元素
     */
    showFolderSelectionDialog(container) {
        // 获取所有非空文件夹
        chrome.bookmarks.getTree().then(bookmarks => {
            const root = bookmarks[0];
            const folders = this.getAllNonEmptyFolders(root);
            
            const menuItems = folders.map(folder => ({
                id: folder.id,
                text: folder.title,
                callback: () => {
                    this.bindWidgetToFolder(container, folder.id);
                }
            }));
            
            const dialogTitle = getI18nMessage('selectFolder', '选择文件夹');
            Menu.ContextMenu.show({ clientX: 100, clientY: 100 }, menuItems, { 
                menuId: 'folder-selection-dialog',
                title: dialogTitle
            });
        });
    },
    
    /**
     * 获取所有非空文件夹
     * @param {Object} node - 书签节点
     * @returns {Array} 非空文件夹数组
     */
    getAllNonEmptyFolders(node) {
        const folders = [];
        
        function traverse(currentNode) {
            if (currentNode.children) {
                // 检查文件夹是否非空
                const hasBookmarks = currentNode.children.some(child => !child.children);
                if (hasBookmarks) {
                    folders.push(currentNode);
                }
                
                // 递归遍历子文件夹
                currentNode.children.forEach(child => {
                    if (child.children) {
                        traverse(child);
                    }
                });
            }
        }
        
        traverse(node);
        return folders;
    },
    
    /**
     * 初始化文件夹绑定功能
     */
    initFolderBinding() {
        // 监听文件夹变化事件
        document.addEventListener('folder-changed', (e) => {
            const folderId = e.detail.folderId;
            
            // 显示或隐藏与当前文件夹绑定的小部件容器
            state.widgetContainers.forEach(container => {
                const containerFolderId = container.dataset.folderId;
                
                if (containerFolderId === folderId) {
                    // 显示与当前文件夹绑定的小部件容器
                    container.style.display = 'block';
                } else if (containerFolderId !== null) {
                    // 隐藏与其他文件夹绑定的小部件容器
                    container.style.display = 'none';
                }
            });
        });
    },
    
    /**
     * 确保元素在视口内
     * @param {HTMLElement} element - 目标元素
     */
    ensureElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // 检查元素是否完全在视口内
        const isInViewport = (
            rect.left >= 0 &&
            rect.right <= viewportWidth &&
            rect.top >= 0 &&
            rect.bottom <= viewportHeight
        );
        
        if (!isInViewport) {
            // 计算新位置，确保元素在视口内
            let newLeft = parseInt(element.style.left) || 0;
            let newTop = parseInt(element.style.top) || 0;
            
            if (rect.left < 0) newLeft = 0;
            if (rect.right > viewportWidth) newLeft = viewportWidth - rect.width - 20;
            if (rect.top < 0) newTop = 0;
            if (rect.bottom > viewportHeight) newTop = viewportHeight - rect.height - 20;
            
            // 应用新位置
            element.style.left = `${newLeft}px`;
            element.style.top = `${newTop}px`;
        }
    },
    
    /**
     * 处理页面缩放变化
     * @param {Object} zoomInfo - 缩放信息对象
     */
    handleZoomChange(zoomInfo) {
        // 处理页面缩放变化，确保小部件在视口内
        state.widgetContainers.forEach(container => {
            this.ensureElementInViewport(container);
        });
        
        // 保存更新的位置
        this.saveWidgets();
    },
    
    /**
     * 清理小部件系统
     */
    cleanup() {
        state.clearCache();
    }
};

// 确保在模块加载时就暴露到全局
if (typeof window !== 'undefined') {
    window.WidgetSystem = WidgetSystem;
}
