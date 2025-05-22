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
                    // 保存尺寸信息
                    size: {
                        width: parseInt(container.style.width) || 200,
                        height: parseInt(container.style.height) || 150
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
                id: 'resize-widget-container',
                text: I18n.getMessage('resizeWidgetContainer') || '调整大小',
                submenu: [
                    {
                        id: 'size-small',
                        text: '小',
                        callback: () => {
                            this.resizeWidgetContainer(container, 180, 120);
                        }
                    },
                    {
                        id: 'size-medium',
                        text: '中',
                        callback: () => {
                            this.resizeWidgetContainer(container, 220, 160);
                        }
                    },
                    {
                        id: 'size-large',
                        text: '大',
                        callback: () => {
                            this.resizeWidgetContainer(container, 260, 200);
                        }
                    },
                    {
                        id: 'size-custom',
                        text: '自定义',
                        callback: () => {
                            this.showResizeDialog(container);
                        }
                    }
                ]
            },
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
     * 显示调整大小对话框
     * @param {HTMLElement} container - 小部件容器 
     */
    showResizeDialog(container) {
        const currentWidth = parseInt(container.style.width) || 200;
        const currentHeight = parseInt(container.style.height) || 150;
        
        const formItems = [
            {
                id: 'width',
                label: '宽度',
                type: 'number',
                value: currentWidth,
                min: 150,
                max: 500
            },
            {
                id: 'height',
                label: '高度',
                type: 'number',
                value: currentHeight,
                min: 100, 
                max: 400
            }
        ];
        
        Menu.showFormModal(
            '调整小部件大小',
            formItems,
            (formData) => {
                const width = parseInt(formData.width) || 200;
                const height = parseInt(formData.height) || 150;
                this.resizeWidgetContainer(container, width, height);
            },
            '确定',
            '取消'
        );
    },
    
    /**
     * 调整小部件容器大小
     * @param {HTMLElement} container - 小部件容器
     * @param {number} width - 新宽度
     * @param {number} height - 新高度
     */
    resizeWidgetContainer(container, width, height) {
        // 限制最小尺寸
        width = Math.max(150, width);
        height = Math.max(100, height);
        
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
            
            // 根据类型加载小部件
            let widgetModule;
            try {
                // 记录加载开始
                console.log(`开始加载小部件模块: ${widgetType}`);
                
                switch(widgetType) {
                    case 'counter':
                        console.log('当前模块路径基准:', import.meta.url);
                        try {
                            // 修改为正确的相对路径
                            const moduleURL = new URL('./widgets/counterWidget.js', import.meta.url).href;
                            console.log('尝试加载模块:', moduleURL);
                            widgetModule = await import(moduleURL);
                        } catch (loadError) {
                            console.error('模块加载错误详情:', loadError);
                            // 尝试多种可能的路径
                            try {
                                const paths = [
                                    '../widgets/counterWidget.js',
                                    '/html/js/modules/widgets/counterWidget.js',
                                    '/html/js/widgets/counterWidget.js',
                                    './counterWidget.js'
                                ];
                                
                                console.log('尝试备用路径加载');
                                let loaded = false;
                                
                                for (const path of paths) {
                                    if (loaded) break;
                                    try {
                                        const backupURL = new URL(path, import.meta.url).href;
                                        console.log('尝试路径:', backupURL);
                                        widgetModule = await import(backupURL);
                                        loaded = true;
                                        console.log('成功加载:', path);
                                    } catch (e) {
                                        console.log(`路径 ${path} 加载失败:`, e.message);
                                    }
                                }
                                
                                if (!loaded) {
                                    throw new Error(`所有备用路径均加载失败`);
                                }
                            } catch (backupError) {
                                console.error('所有路径尝试失败:', backupError);
                                throw new Error(`无法加载计数器模块: ${loadError.message}`);
                            }
                        }
                        console.log('计数器模块加载结果:', widgetModule);
                        break;
                    // 可以添加更多小部件类型
                    default:
                        throw new Error(`未知的小部件类型: ${widgetType}`);
                }
                
                // 移除加载指示器
                if (loadingIndicator && widgetItem.contains(loadingIndicator)) {
                    widgetItem.removeChild(loadingIndicator);
                }
                
                // 检查模块是否正确加载
                if (!widgetModule) {
                    throw new Error(`加载小部件模块 ${widgetType} 失败: 模块为空`);
                }
                
                if (!widgetModule.default) {
                    throw new Error(`小部件模块 ${widgetType} 缺少默认导出`);
                }
                
                if (typeof widgetModule.default.initialize !== 'function') {
                    throw new Error(`小部件模块 ${widgetType} 缺少initialize方法`);
                }
                
                // 初始化小部件
                console.log(`开始初始化小部件: ${widgetType}`, widgetData);
                await widgetModule.default.initialize(widgetItem, widgetData);
                
                // 检查初始化后是否有内容
                if (widgetItem.childElementCount === 0) {
                    throw new Error(`小部件 ${widgetType} 初始化后内容为空`);
                }
                
                // 设置为活动项
                this.setActiveWidgetItem(container, Array.from(contentArea.children).indexOf(widgetItem));
                
                console.log(`小部件 ${widgetType} 初始化成功`);
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
                        widgetItem.removeChild(errorElement);
                        // 重新尝试加载
                        this.addWidgetItem(container, widgetType, widgetData);
                        // 移除当前项
                        this.removeWidgetItem(widgetItem);
                    });
                }
                
                if (removeButton) {
                    removeButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeWidgetItem(widgetItem);
                    });
                }
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
        
        // 移除小部件
        contentArea.removeChild(widgetItem);
        
        // 如果容器为空，添加"添加"按钮
        if (contentArea.children.length === 0) {
            this.addAddButton(container);
        } else {
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
        
        // 设置位置
        const position = data.position || { x: 100, y: 100 };
        container.style.left = `${position.x}px`;
        container.style.top = `${position.y}px`;
        
        // 设置尺寸
        const size = data.size || { width: 200, height: 150 };
        container.style.width = `${size.width}px`;
        container.style.height = `${size.height}px`;
        
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
            
            // 设置初始活动状态
            this.setActiveWidgetItem(container, 0);
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
        
        console.log(`小部件已激活: 索引 ${validIndex}`);
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
            console.log('开始拖动尝试'); // 调试日志
            e.preventDefault(); // 阻止默认行为
            e.stopPropagation(); // 阻止事件冒泡
            
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
            
            // 设置初始拖动状态
            isDragging = true;
            
            // 记录初始位置
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = parseInt(container.style.left) || 0;
            const startTop = parseInt(container.style.top) || 0;
            
            container.classList.add('widget-dragging');
            console.log('拖动状态已设置'); // 调试日志
            
            // 移动处理函数
            function handleMouseMove(moveEvent) {
                if (!isDragging) return;
                
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                // 计算新位置
                const newLeft = Math.max(0, startLeft + dx);
                const newTop = Math.max(0, startTop + dy);
                
                // 应用新位置
                container.style.left = `${newLeft}px`;
                container.style.top = `${newTop}px`;
                
                moveEvent.preventDefault();
                console.log(`移动到: ${newLeft}, ${newTop}`); // 调试日志
            }
            
            // 放开处理函数
            function handleMouseUp() {
                if (isDragging) {
                    isDragging = false;
                    container.classList.remove('widget-dragging');
                    
                    // 触发位置变更事件
                    document.dispatchEvent(new CustomEvent('widget-data-changed'));
                    console.log('拖动结束'); // 调试日志
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
            
            container.classList.add('widget-resizing');
            
            // 移动处理函数
            function handleMouseMove(moveEvent) {
                if (!isResizing) return;
                
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                // 计算新尺寸，确保最小尺寸
                const newWidth = Math.max(150, startWidth + dx);
                const newHeight = Math.max(100, startHeight + dy);
                
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