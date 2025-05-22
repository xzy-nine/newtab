/**
 * 小部件系统模块
 * 提供小部件容器创建、管理和交互功能
 */

import { Utils } from './utils.js';
import { I18n } from './i18n.js';
import { Menu } from './menu.js';
import { Notification } from './notification.js';

// 储存小部件数据和实例
let widgets = [];
let widgetContainers = [];
let dragData = null;

/**
 * 小部件系统API
 */
export const WidgetSystem = {
    /**
     * 初始化小部件系统
     * @returns {Promise<void>}
     */
    async init() {
        try {
            // 加载已保存的小部件数据
            await this.loadWidgets();
            
            // 添加右键菜单项
            this.setupContextMenus();
            
            // 监听小部件数据变更
            document.addEventListener('widget-data-changed', () => {
                this.saveWidgets();
            });
            
            // 添加窗口尺寸变化监听，处理固定小部件位置
            window.addEventListener('resize', this.handleWindowResize.bind(this));
            
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
            startMessage: I18n.getMessage('loadingWidgets') || '加载小部件中...',
            successMessage: I18n.getMessage('widgetsLoaded') || '小部件加载完成'
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
                return {
                    id: container.id,
                    position: {
                        x: parseInt(container.style.left) || 0,
                        y: parseInt(container.style.top) || 0
                    },
                    fixed: container.dataset.fixed === 'true',
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
        if (event.target.closest('.folder-button, .shortcut-button, .bookmark, input, textarea')) {
            return;
        }
        
        // 获取鼠标位置下的所有元素（包括可能被覆盖的元素）
        const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
        
        // 检查是否有更高层级的交互元素，避免小部件菜单干扰其他元素
        const hasHigherLevelInteractive = elementsAtPoint.some(el => 
            el.closest('#folder-list, #shortcut-list, #search-box, .bookmark') && 
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
            // 在空白区域创建小部件容器，但排除文件夹列表和快捷方式列表区域
            !event.target.closest('#folder-list, #shortcut-list, #search-box, .bookmark')
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
            // 删除单个浮于最上层的选项
            // {
            //     id: 'float-to-top',
            //     text: I18n.getMessage('floatToTop') || '临时浮于最上层',
            //     callback: () => {
            //         this.floatContainerToTop(container);
            //     }
            // },
            {
                id: 'delete-widget-container',
                text: I18n.getMessage('deleteWidgetContainer') || '删除小部件容器',
                callback: () => {
                    this.deleteWidgetContainer(container);
                }
            }
        ];
        
        Menu.ContextMenu.show(event, menuItems, { menuId: 'widget-container-menu' });
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
        
        const menuItems = [
            {
                id: 'add-widget',
                text: I18n.getMessage('addWidget') || '添加小部件',
                callback: () => {
                    this.showAddWidgetDialog(container);
                }
            },
            {
                id: 'remove-widget',
                text: I18n.getMessage('removeWidget') || '删除小部件',
                callback: () => {
                    this.removeWidgetItem(widgetItem);
                }
            }
        ];
        
        Menu.ContextMenu.show(event, menuItems, { menuId: 'widget-item-menu' });
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
        
        // 设置位置
        const position = data.position || { x: 100, y: 100 };
        container.style.left = `${position.x}px`;
        container.style.top = `${position.y}px`;
        
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
        pinButton.title = data.fixed ? I18n.getMessage('unfixWidgetContainer') || '取消固定' : I18n.getMessage('fixWidgetContainer') || '固定小部件';
        pinButton.innerHTML = data.fixed ? '📌' : '📍';

        // 使用更明确的事件处理
        pinButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.toggleFixedContainer(container);
        });

        container.appendChild(pinButton);
        
        // 添加拖动事件
        this.setupDragHandlers(dragHandle, container);
        
        // 创建内容区域
        const contentArea = document.createElement('div');
        contentArea.className = 'widget-content';
        container.appendChild(contentArea);
        
        // 如果有已保存的小部件，添加它们
        if (data.items && Array.isArray(data.items)) {
            data.items.forEach(item => {
                this.addWidgetItem(container, item.type, item.data);
            });
        }
        
        // 如果容器为空，添加一个"添加"按钮
        if (!data.items || data.items.length === 0) {
            this.addAddButton(container);
        }
        
        // 添加到DOM
        document.body.appendChild(container);
        
        // 添加到管理列表
        widgetContainers.push(container);
        
        // 保存状态
        this.saveWidgets();
        
        return container;
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
        
        // 使用click.bind确保正确的this指向
        const clickHandler = this.showAddWidgetDialog.bind(this, container);
        
        // 移除旧事件处理器
        addButton.removeEventListener('click', clickHandler);
        // 添加新事件处理器
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
    showAddWidgetDialog(container) {
        // 获取可用小部件列表
        const availableWidgets = this.getAvailableWidgets();
        
        // 创建对话框选项
        const formItems = availableWidgets.map(widget => ({
            id: widget.type,
            label: widget.name,
            type: 'checkbox',
            value: false
        }));
        
        Menu.showFormModal(
            I18n.getMessage('addWidgetTitle') || '添加小部件',
            formItems,
            async (formData) => {
                for (const [type, selected] of Object.entries(formData)) {
                    if (selected) {
                        await this.addWidgetItem(container, type);
                    }
                }
            },
            I18n.getMessage('add') || '添加',
            I18n.getMessage('cancel') || '取消'
        );
    },
    
    /**
     * 获取可用的小部件列表
     * @returns {Array} 小部件类型列表
     */
    getAvailableWidgets() {
        // 此处应该动态获取所有可用小部件
        return [
            { 
                type: 'counter', 
                name: I18n.getMessage('counterWidget') || '计数器'
            },
            // 未来可以添加更多小部件类型
        ];
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
            
            // 根据类型加载小部件
            let widgetModule;
            switch(widgetType) {
                case 'counter':
                    widgetModule = await import('./widgets/counterWidget.js');
                    break;
                // 可以添加更多小部件类型
                default:
                    throw new Error(`未知的小部件类型: ${widgetType}`);
            }
            
            // 初始化小部件
            if (widgetModule && widgetModule.default) {
                await widgetModule.default.initialize(widgetItem, widgetData);
            }
            
            // 添加到容器
            contentArea.appendChild(widgetItem);
            
            // 保存状态
            this.saveWidgets();
            
            return widgetItem;
        } catch (error) {
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
        
        // 移除小部件
        contentArea.removeChild(widgetItem);
        
        // 如果容器为空，添加"添加"按钮
        if (contentArea.children.length === 0) {
            this.addAddButton(container);
        }
        
        // 保存状态
        this.saveWidgets();
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
            // 如果容器是固定的，不允许拖动
            if (container.dataset.fixed === 'true') {
                // 显示提示信息
                Notification.notify({
                    title: I18n.getMessage('widgetFixed') || '小部件已固定',
                    message: I18n.getMessage('unfixWidgetToMove') || '请先取消固定再移动',
                    type: 'info',
                    duration: 2000
                });
                return;
            }
            
            // 记录拖动开始
            isDragging = false;
            
            // 记录初始位置
            dragData = {
                element: container,
                startX: e.clientX,
                startY: e.clientY,
                startLeft: parseInt(container.style.left) || 0,
                startTop: parseInt(container.style.top) || 0
            };
            
            // 直接在元素上绑定临时事件处理
            const handleMouseMove = (moveEvent) => {
                // 设置为正在拖动
                if (!isDragging) {
                    isDragging = true;
                    container.classList.add('widget-dragging');
                }
                
                const dx = moveEvent.clientX - dragData.startX;
                const dy = moveEvent.clientY - dragData.startY;
                
                // 计算新位置
                const newLeft = Math.max(0, dragData.startLeft + dx);
                const newTop = Math.max(0, dragData.startTop + dy);
                
                // 应用新位置
                dragData.element.style.left = `${newLeft}px`;
                dragData.element.style.top = `${newTop}px`;
                
                moveEvent.preventDefault();
            };
            
            const handleMouseUp = (upEvent) => {
                if (isDragging) {
                    // 拖动结束，移除临时样式
                    container.classList.remove('widget-dragging');
                    
                    // 触发位置变更事件
                    document.dispatchEvent(new CustomEvent('widget-data-changed'));
                }
                
                // 移除临时事件处理
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            // 绑定移动和放开事件
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    },
    
    /**
     * 窗口尺寸变化处理
     */
    handleWindowResize() {
        // 固定小部件位置
        widgetContainers.forEach(container => {
            if (container.dataset.fixed === 'true') {
                const position = {
                    x: parseInt(container.style.left) || 0,
                    y: parseInt(container.style.top) || 0
                };
                
                // 计算新的位置，确保在可视区域内
                const newPosition = this.calculateNewFixedPosition(position);
                
                container.style.left = `${newPosition.x}px`;
                container.style.top = `${newPosition.y}px`;
            }
        });
    },
    
    /**
     * 计算新的固定位置
     * @param {Object} position - 当前位置信息
     * @param {number} position.x - 当前X坐标
     * @param {number} position.y - 当前Y坐标
     * @returns {Object} 新的位置信息
     */
    calculateNewFixedPosition(position) {
        const offset = 10; // 边缘留白
        const newX = Math.min(window.innerWidth - offset, Math.max(offset, position.x));
        const newY = Math.min(window.innerHeight - offset, Math.max(offset, position.y));
        
        return { x: newX, y: newY };
    }
};

// 立即初始化
WidgetSystem.init().catch(error => {
    console.error('小部件系统初始化失败:', error);
});