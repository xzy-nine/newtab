/**
 * 书签管理模块
 * 负责处理Chrome书签的显示和交互
 * @module BookmarkManager
 */

import { Utils, Menu, I18n, IconManager, Notification, DesktopSystem, WidgetItem, WidgetSystem } from './core/index.js';

// 当前文件夹
let currentFolder = "";

// 文件夹展开状态
let expandedFolders = new Set();

// 统一的展开符号定义
const EXPAND_SYMBOLS = {
    COLLAPSED: '▶', // U+25B6 - 向右三角形
    EXPANDED: '▼'   // U+25BC - 向下三角形
};

/**
 * 书签管理API
 * @namespace
 */
export const BookmarkManager = {
    /**
     * 初始化书签功能
     * @returns {Promise<void>} 无
     */
    init: async function() {
        try {
            // 先初始化右键菜单功能
            Menu.ContextMenu.init();
            
            // 加载文件夹展开状态
            await this.loadExpandedFolders();
            
            // 渲染文件夹（包括固定文件夹）
            await this.renderFolders();
            
            // 注册全局事件处理
            document.addEventListener('contextmenu', this.handleContextMenu.bind(this));
            
            // 监听小部件创建事件，重新渲染当前文件夹
            document.addEventListener('widget-created', async (event) => {
                console.log('检测到小部件创建事件，重新渲染当前文件夹');
                // 获取当前文件夹的完整数据（包括子项）并重新渲染
                try {
                    const [folderTree] = await chrome.bookmarks.getSubTree(currentFolder);
                    if (folderTree) {
                        this.showShortcuts(folderTree);
                    }
                } catch (error) {
                    console.error('重新渲染文件夹失败:', error);
                }
            });
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 显示错误通知
     * @param {Error} error 错误对象
     */
    showError: function(error) {
        Notification.notify({
            title: I18n.getMessage('errorTitle', '错误'),
            message: error.message || I18n.getMessage('genericError', '发生未知错误'),
            type: 'error',
            duration: 5000
        });
    },

    /**
     * 加载文件夹展开状态
     * @returns {Promise<void>} 无
     */
    loadExpandedFolders: async function() {
        try {
            const result = await chrome.storage.local.get('expandedFolders');
            expandedFolders = new Set(result.expandedFolders || []);
        } catch (error) {
            console.error('加载文件夹展开状态失败:', error);
            expandedFolders = new Set();
        }
    },

    /**
     * 保存文件夹展开状态
     * @returns {Promise<void>} 无
     */
    saveExpandedFolders: async function() {
        try {
            await chrome.storage.local.set({ 
                expandedFolders: Array.from(expandedFolders) 
            });
        } catch (error) {
            console.error('保存文件夹展开状态失败:', error);
        }
    },

    /**
     * 创建文件夹按钮
     * @param {Object} folder 文件夹数据
     * @param {HTMLElement} container 容器元素
     * @param {boolean} isPinned 是否为固定文件夹
     * @param {number} level 缩进级别（默认0）
     */
    createFolderButton: function(folder, container, isPinned = false, level = 0) {
        try {
            // 创建文件夹按钮
            const folderButton = Utils.createElement("div", `folder-button folder-indent-${level}`, {
                id: `folder-${folder.id}${isPinned ? '-pinned' : ''}`,
                'data-folder-id': folder.id,
                'data-pinned': isPinned ? 'true' : 'false'
            });
            
            // 检查是否有非空子文件夹
            const nonEmptySubFolders = folder.children ? 
                folder.children.filter(child => child.children && !this.isFolderEmpty(child)) : [];
            const hasNonEmptySubFolders = nonEmptySubFolders.length > 0;
            
            // 检查当前展开状态
            const isExpanded = expandedFolders.has(folder.id);
            
            // 创建文件夹内容
            const folderContent = Utils.createElement("div", "folder-content");
            
            // 创建箭头元素
            const arrowElement = Utils.createElement("span", "folder-arrow");
            if (isPinned || !hasNonEmptySubFolders) {
                // 固定文件夹或没有子文件夹不显示箭头
                arrowElement.textContent = '';
                arrowElement.setAttribute('data-expandable', 'false');
                if (!hasNonEmptySubFolders) {
                    arrowElement.style.display = 'none';
                }
            } else {
                // 根据展开状态设置箭头
                arrowElement.textContent = isExpanded ? EXPAND_SYMBOLS.EXPANDED : EXPAND_SYMBOLS.COLLAPSED;
                arrowElement.setAttribute('data-expandable', 'true');
            }
            
            // 创建图标和名称包装器
            const iconNameWrapper = Utils.createElement("div", "folder-icon-name-wrapper");
            const iconElement = Utils.createElement("span", "folder-icon");
            iconElement.classList.add('segoe-icon');
            iconElement.textContent = isPinned ? '\uE718' : '\uE8B7';
            const nameElement = Utils.createElement("span", "folder-name");
            nameElement.textContent = folder.title || I18n.getMessage('untitledFolder', '未命名文件夹');
            
            // 组装元素
            iconNameWrapper.appendChild(iconElement);
            iconNameWrapper.appendChild(nameElement);
            folderContent.appendChild(arrowElement);
            folderContent.appendChild(iconNameWrapper);
            folderButton.appendChild(folderContent);
            
            // 设置展开状态
            if (isExpanded && !isPinned) {
                folderButton.classList.add('open');
            }
            
            // 存储文件夹数据
            folderButton.folderData = folder;
            container.appendChild(folderButton);
            
            // 创建子文件夹容器（仅限非固定文件夹）
            if (!isPinned && hasNonEmptySubFolders) {
                this.createChildrenContainer(folder, container, nonEmptySubFolders, isExpanded, level);
            }
            
            // 添加事件监听
            this.addFolderEventListeners(folderButton, folder);
            
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 创建子文件夹容器
     */
    createChildrenContainer: function(folder, container, nonEmptySubFolders, isExpanded, level) {
        const childrenContainer = Utils.createElement("div", "folder-children", {
            id: `children-${folder.id}`
        });
        
        // 设置初始状态
        if (isExpanded) {
            childrenContainer.classList.add('folder-children-open');
            childrenContainer.style.pointerEvents = 'auto';
        } else {
            childrenContainer.classList.add('folder-children-closed');
            childrenContainer.style.pointerEvents = 'none';
        }
        
        // 排序并创建子文件夹
        const sortedSubFolders = this.sortFoldersByStructure(nonEmptySubFolders);
        for (let subFolder of sortedSubFolders) {
            this.createFolderButton(subFolder, childrenContainer, false, level + 1);
        }
        
        container.appendChild(childrenContainer);
    },

    /**
     * 添加文件夹事件监听器
     */
    addFolderEventListeners: function(folderButton, folder) {
        const isPinned = folderButton.getAttribute('data-pinned') === 'true';
        const arrowElement = folderButton.querySelector('.folder-arrow');
        
        // 统一的点击事件处理
        folderButton.addEventListener('click', (event) => {
            event.stopPropagation();
            
            const clickedArrow = event.target === arrowElement || arrowElement.contains(event.target);
            
            if (clickedArrow && arrowElement.getAttribute('data-expandable') === 'true' && !isPinned) {
                this.toggleFolderExpansion(folderButton);
            } else {
                this.toggleFolderSelection(folderButton, folder);
            }
        });
    },

    /**
     * 切换文件夹展开/收起状态
     */
    toggleFolderExpansion: function(folderButton) {
        if (!folderButton) return;
        
        const children = folderButton.nextElementSibling;
        const isPinned = folderButton.getAttribute('data-pinned') === 'true';
        const arrowElement = folderButton.querySelector('.folder-arrow');
        const folderId = folderButton.getAttribute('data-folder-id');
        
        // 固定文件夹不允许展开
        if (isPinned) return;
        
        if (children && children.classList.contains('folder-children') && 
            arrowElement && arrowElement.getAttribute('data-expandable') === 'true') {

            const isOpen = folderButton.classList.contains('open');
            
            if (isOpen) {
                // 收起文件夹
                folderButton.classList.remove('open');
                children.classList.remove('folder-children-open');
                children.classList.add('folder-children-closed');
                arrowElement.textContent = EXPAND_SYMBOLS.COLLAPSED;
                children.style.pointerEvents = 'none';
                
                if (folderId) {
                    expandedFolders.delete(folderId);
                    this.saveExpandedFolders();
                }
            } else {
                // 展开文件夹
                folderButton.classList.add('open');
                children.classList.remove('folder-children-closed');
                children.classList.add('folder-children-open');
                arrowElement.textContent = EXPAND_SYMBOLS.EXPANDED;
                children.style.pointerEvents = 'auto';
                
                if (folderId) {
                    expandedFolders.add(folderId);
                    this.saveExpandedFolders();
                }
                
                // 确保展开的内容可见
                setTimeout(() => this.ensureChildrenVisibility(folderButton), 350);
                
                // 延迟触发窗口大小变化事件，确保快捷方式列表正确渲染
                setTimeout(() => {
                    // 触发窗口大小变化事件，重新计算快捷方式列表尺寸
                    window.dispatchEvent(new Event('resize'));
                }, 400);
            }
        }
    },

    /**
     * 应用选中的文件夹
     */
    applySelectedFolder: async function(root) {
        try {
            // 获取当前选中文件夹或使用根节点
            const { folder = root.id } = await chrome.storage.local.get("folder");
            currentFolder = folder;

            // 查找并显示快捷方式
            const selectedFolder = this.findFolderById(root, folder);
            if (selectedFolder) {
                this.showShortcuts(selectedFolder);

                // 清除所有选中状态
                document.querySelectorAll('.folder-button.selected').forEach(btn => btn.classList.remove('selected'));

                // 获取固定文件夹列表
                let pinnedFolders = [];
                try {
                    const result = await chrome.storage.local.get("pinnedFolders");
                    pinnedFolders = result.pinnedFolders || [];
                } catch (err) {
                    console.warn('获取固定文件夹失败:', err);
                }

                // 判断并选中对应按钮
                const isPinned = pinnedFolders.includes(folder);
                let targetBtn;
                if (isPinned) {
                    targetBtn = document.querySelector(`[data-folder-id="${folder}"][data-pinned="true"]`);
                } else {
                    targetBtn = document.querySelector(`[data-folder-id="${folder}"][data-pinned="false"]`);
                }
                
                if (targetBtn) {
                    targetBtn.classList.add('selected');
                    // 更新为打开文件夹图标
                    const iconElement = targetBtn.querySelector('.folder-icon');
                    if (iconElement) {
                        iconElement.textContent = '\uE838';
                    }
                }
            }
        } catch (err) {
            this.showError(err);
        }
    },

    /**
     * 切换文件夹选择状态
     */
    toggleFolderSelection: function(folderButton, folder) {
        if (!folderButton || !folder) return;
        
        const isCurrentlySelected = folderButton.classList.contains('selected');
        const iconElement = folderButton.querySelector('.folder-icon');
        const isPinned = folderButton.getAttribute('data-pinned') === 'true';
        
        if (isCurrentlySelected) {
            // 取消选中
            folderButton.classList.remove('selected');
            // 恢复原始图标
            if (iconElement) {
                iconElement.textContent = isPinned ? '\uE718' : '\uE8B7';
            }
            this.hideShortcuts();
            currentFolder = "";
            chrome.storage.local.remove('folder');
            
            // 触发文件夹变化事件
            document.dispatchEvent(new CustomEvent('folder-changed', {
                detail: { folderId: null }
            }));
        } else {
            // 选中文件夹
            this.showShortcuts(folder);
            currentFolder = folder.id;
            chrome.storage.local.set({ folder: folder.id });
            
            // 清除所有选中状态并恢复原始图标
            document.querySelectorAll('.folder-button.selected').forEach(btn => {
                btn.classList.remove('selected');
                const btnIcon = btn.querySelector('.folder-icon');
                if (btnIcon) {
                    const btnIsPinned = btn.getAttribute('data-pinned') === 'true';
                    btnIcon.textContent = btnIsPinned ? '\uE718' : '\uE8B7';
                }
            });
            
            // 只选中当前点击的按钮
            folderButton.classList.add('selected');
            // 更新为打开文件夹图标
            if (iconElement) {
                iconElement.textContent = '\uE838';
            }
            
            // 如果点击的是固定文件夹，确保原始文件夹不被选中
            const folderId = folderButton.getAttribute('data-folder-id');
            
            if (isPinned) {
                // 确保原始版本不被选中
                const regularButton = document.querySelector(`[data-folder-id="${folderId}"][data-pinned="false"]`);
                if (regularButton) {
                    regularButton.classList.remove('selected');
                    const regularIcon = regularButton.querySelector('.folder-icon');
                    if (regularIcon) {
                        regularIcon.textContent = '\uE8B7';
                    }
                }
            } else {
                // 确保固定版本不被选中
                const pinnedButton = document.querySelector(`[data-folder-id="${folderId}"][data-pinned="true"]`);
                if (pinnedButton) {
                    pinnedButton.classList.remove('selected');
                }
            }
            
            // 触发文件夹变化事件
            document.dispatchEvent(new CustomEvent('folder-changed', {
                detail: { folderId: folder.id }
            }));
        }
    },

    /**
     * 显示指定文件夹的快捷方式和小部件
     */
    showShortcuts: async function(folder) {
        const shortcutList = document.getElementById("shortcut-list");
        if (!shortcutList) return;
        
        if (!folder) {
            shortcutList.classList.add('hidden');
            return;
        }

        shortcutList.classList.remove('hidden');
        await new Promise(resolve => requestAnimationFrame(resolve));

        const hasValidSize = () => {
            const rect = shortcutList.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };

        if (!hasValidSize()) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        if (!hasValidSize()) {
            if (!shortcutList._gridSizeRetry) {
                shortcutList._gridSizeRetry = true;
                setTimeout(() => {
                    this.showShortcuts(folder);
                }, 60);
            }
            return;
        }

        shortcutList._gridSizeRetry = false;

        // 计算网格配置
        const gridConfig = DesktopSystem.calculateGridConfig(shortcutList);

        // 从文件夹中提取快捷方式
        const bookmarks = folder.children ? folder.children.filter(node => !node.children) : [];
        
        // 使用 DesktopSystem 创建快捷方式项目（传递folder.id以计算统一的颜色）
        const shortcuts = DesktopSystem.createShortcutsFromBookmarks(bookmarks, folder.id, gridConfig.cols);
        
        // 加载与当前文件夹id对应的小部件容器
        let widgets = [];
        try {
            if (WidgetSystem && typeof WidgetSystem.whenReady === 'function') {
                await WidgetSystem.whenReady();
            }

            if (!WidgetSystem || typeof WidgetSystem.getWidgetsByFolderId !== 'function') {
                throw new Error('WidgetSystem未就绪');
            }

            // 使用WidgetSystem.getWidgetsByFolderId获取小部件数据
            const folderWidgets = WidgetSystem.getWidgetsByFolderId(folder.id);
            
            console.log('找到与文件夹', folder.id, '对应的小部件容器:', folderWidgets.length, '个');
            
            // 将每个小部件容器转换为一个WidgetItem对象
            const baseRow = Math.ceil(shortcuts.length / Math.max(1, gridConfig.cols));
            folderWidgets.forEach((widgetData, containerIndex) => {
                const widgetWidth = Math.min(2, gridConfig.cols);
                const widgetHeight = 2;
                const x = 0;
                const y = baseRow + containerIndex * widgetHeight;

                const firstItemType = (widgetData.items && widgetData.items[0]) ? widgetData.items[0].type : 'unknown';
                
                widgets.push(new WidgetItem(
                    widgetData.id || `widget-container-${containerIndex}`,
                    firstItemType || 'unknown',
                    firstItemType || 'unknown',
                    widgetData,
                    x,
                    y,
                    widgetWidth,
                    widgetHeight
                ));
                
                console.log('添加小部件容器:', widgetData.id, '到位置:', x, y);
            });
        } catch (error) {
            console.error('加载小部件数据失败:', error);
        }
        
        // 合并所有项目
        const allItems = [...shortcuts, ...widgets];
        const pageSize = Math.max(1, gridConfig.cols * gridConfig.rows);

        allItems.forEach((item, index) => {
            if (!Number.isFinite(item.page)) {
                item.page = Math.floor(index / pageSize);
            }
        });
        
        // 记录当前文件夹，供布局持久化使用
        shortcutList.dataset.folderId = folder.id;
        
        if (!WidgetSystem || typeof WidgetSystem.isReady !== 'function' || !WidgetSystem.isReady()) {
            if (!shortcutList._widgetInitListenerAdded) {
                shortcutList._widgetInitListenerAdded = true;
                document.addEventListener('widgets-loaded', async () => {
                    try {
                        const [folderTree] = await chrome.bookmarks.getSubTree(folder.id);
                        if (folderTree) {
                            this.showShortcuts(folderTree);
                        }
                    } catch (error) {
                        console.error('小部件加载完成后重新渲染失败:', error);
                    }
                }, { once: true });
            }
        }
        
        // 使用requestAnimationFrame确保DOM更新后再计算和渲染
        requestAnimationFrame(async () => {
            if (WidgetSystem && typeof WidgetSystem.resetRenderedContainers === 'function') {
                WidgetSystem.resetRenderedContainers();
            }
            const layout = await DesktopSystem.loadLayout(folder.id);
            let layoutItems = DesktopSystem.applyLayout(allItems, layout, gridConfig);
            if (DesktopSystem.needsReflow(layoutItems, gridConfig)) {
                layoutItems = DesktopSystem.reflowItems(layoutItems, gridConfig);
            }

            const maxPage = layoutItems.reduce((maxValue, item) => {
                const value = Number.isFinite(item.page) ? item.page : 0;
                return Math.max(maxValue, value);
            }, 0);
            const pageCount = Math.max(1, maxPage + 1, Math.ceil(layoutItems.length / pageSize));
            let pageIndex = Number.isFinite(shortcutList._desktopPageIndex) ? shortcutList._desktopPageIndex : 0;
            if (pageIndex >= pageCount) pageIndex = pageCount - 1;
            shortcutList._desktopPageIndex = pageIndex;

            const pageItems = layoutItems.filter(item => (Number.isFinite(item.page) ? item.page : 0) === pageIndex);

            // 将allItems存储在shortcutList元素上，确保事件监听器使用正确的数据
            shortcutList._allItems = layoutItems;
            
            // 显示快捷方式和小部件（异步处理）
            await DesktopSystem.createDesktopGrid(shortcutList, pageItems, gridConfig);

            const existingIndicators = shortcutList.querySelector('.desktop-page-indicators');
            if (existingIndicators) {
                existingIndicators.remove();
            }

            if (pageCount > 1) {
                const indicators = document.createElement('div');
                indicators.className = 'desktop-page-indicators';
                for (let i = 0; i < pageCount; i += 1) {
                    const dot = document.createElement('div');
                    dot.className = 'desktop-page-indicator';
                    if (i === pageIndex) {
                        dot.classList.add('active');
                    }
                    dot.addEventListener('click', () => {
                        shortcutList._desktopPageIndex = i;
                        this.showShortcuts(folder);
                    });
                    indicators.appendChild(dot);
                }
                shortcutList.appendChild(indicators);

                if (!shortcutList._pageWheelHandler) {
                    shortcutList._pageWheelHandler = (event) => {
                        if (pageCount <= 1) return;
                        if (event.target && event.target.closest && event.target.closest('.widget-container')) {
                            return;
                        }
                        event.preventDefault();
                        const direction = event.deltaY > 0 ? 1 : -1;
                        const nextIndex = Math.min(pageCount - 1, Math.max(0, shortcutList._desktopPageIndex + direction));
                        if (nextIndex !== shortcutList._desktopPageIndex) {
                            shortcutList._desktopPageIndex = nextIndex;
                            this.showShortcuts(folder);
                        }
                    };
                    shortcutList.addEventListener('wheel', shortcutList._pageWheelHandler, { passive: false });
                }
            }
        });
        
        // 移除之前的窗口大小变化事件监听器
        // 为了避免监听器累积，我们使用一个唯一的事件监听器
        window.removeEventListener('resize', window._shortcutResizeHandler);
        
        // 响应窗口大小变化
        window._shortcutResizeHandler = async () => {
            const newGridConfig = DesktopSystem.calculateGridConfig(shortcutList);
            const layout = await DesktopSystem.loadLayout(folder.id);
            const currentItems = shortcutList._allItems || allItems;
            let layoutItems = DesktopSystem.applyLayout(currentItems, layout, newGridConfig);
            if (DesktopSystem.needsReflow(layoutItems, newGridConfig)) {
                layoutItems = DesktopSystem.reflowItems(layoutItems, newGridConfig);
            }
            shortcutList._allItems = layoutItems;
            await DesktopSystem.createDesktopGrid(shortcutList, layoutItems, newGridConfig);
        };
        
        window.addEventListener('resize', window._shortcutResizeHandler);
    },

    /**
     * 隐藏快捷方式
     */
    hideShortcuts: function() {
        const shortcutList = document.getElementById("shortcut-list");
        if (!shortcutList) return;
        
        shortcutList.innerHTML = "";
        shortcutList.classList.add('hidden');
    },

    /**
     * 判断文件夹是否为空
     */
    isFolderEmpty: function(folder) {
        if (!folder.children || folder.children.length === 0) return true;
        if (folder.children.some(item => item.url)) return false;
        return folder.children.every(child => !child.children || this.isFolderEmpty(child));
    },

    /**
     * 对文件夹进行排序
     */
    sortFoldersByStructure: function(folders) {
        try {
            const foldersWithChildren = [];
            const foldersWithoutChildren = [];
            
            for (let folder of folders) {
                const hasSubfolders = folder.children.some(child => 
                    child.children && !this.isFolderEmpty(child)
                );
                
                if (hasSubfolders) {
                    foldersWithChildren.push(folder);
                } else {
                    foldersWithoutChildren.push(folder);
                }
            }
            
            foldersWithoutChildren.sort((a, b) => a.title.localeCompare(b.title));
            foldersWithChildren.sort((a, b) => a.title.localeCompare(b.title));
            
            return [...foldersWithoutChildren, ...foldersWithChildren];
        } catch (error) {
            this.showError(error);
            return folders;
        }
    },

    /**
     * 递归查找指定ID的文件夹
     */
    findFolderById: function(node, id) {
        if (node.id === id) return node;
        if (!node.children) return null;
        
        for (let child of node.children) {
            const found = this.findFolderById(child, id);
            if (found) return found;
        }
        return null;
    },

    /**
     * 确保文件夹子元素在视图中可见
     */
    ensureChildrenVisibility: function(folderButton) {
        const children = folderButton.nextElementSibling;
        if (!children || !children.classList.contains('folder-children')) return;
        
        const folderList = document.getElementById('folder-list');
        if (!folderList) return;
        
        requestAnimationFrame(() => {
            const containerRect = folderList.getBoundingClientRect();
            const childrenRect = children.getBoundingClientRect();
            
            const bottomOverflow = childrenRect.bottom - containerRect.bottom;
            if (bottomOverflow > 0) {
                folderList.scrollTo({
                    top: folderList.scrollTop + bottomOverflow + 20,
                    behavior: 'smooth'
                });
            }
            
            const topOverflow = containerRect.top - folderButton.getBoundingClientRect().top;
            if (topOverflow > 0) {
                folderList.scrollTo({
                    top: folderList.scrollTop - topOverflow - 10,
                    behavior: 'smooth'
                });
            }
        });
    },

    /**
     * 处理右键菜单事件
     */
    handleContextMenu: function(event) {
        if (event.target.matches('input, textarea, [contenteditable="true"]')) {
            return;
        }
        const shortcutButton = event.target.closest('.shortcut-button');
        
        if (shortcutButton) {
            event.preventDefault();
            this.showShortcutContextMenu(event, shortcutButton);
            return;
        }
        
        event.preventDefault();

        const folderButton = event.target.closest('.folder-button');
        if (folderButton && folderButton.folderData) {
            this.showFolderContextMenu(event, folderButton.folderData);
            return;
        }
    },

    /**
     * 显示快捷方式右键菜单
     * @param {MouseEvent} event - 鼠标事件
     * @param {HTMLElement} shortcutButton - 快捷方式元素
     */
    showShortcutContextMenu: function(event, shortcutButton) {
        const shortcutUrl = shortcutButton.dataset.shortcutUrl;
        if (!shortcutUrl) return;

        const menuItems = [
            {
                id: 'shortcut-custom-icon',
                text: I18n.getMessage('shortcutCustomIcon', '自定义图标'),
                callback: () => {
                    this.showShortcutIconModal(shortcutUrl, shortcutButton);
                }
            },
            {
                id: 'shortcut-reset-icon',
                text: I18n.getMessage('shortcutResetIcon', '重置图标'),
                callback: async () => {
                    await IconManager.resetIcon(shortcutUrl);
                    this.refreshShortcutIcon(shortcutButton, shortcutUrl);
                }
            }
        ];

        Menu.ContextMenu.show(event, menuItems, { menuId: 'shortcut-context-menu' });
    },

    /**
     * 显示快捷方式自定义图标弹窗
     * @param {string} shortcutUrl - 快捷方式URL
     * @param {HTMLElement} shortcutButton - 快捷方式元素
     */
    showShortcutIconModal: function(shortcutUrl, shortcutButton) {
        const formItems = [
            {
                type: 'custom',
                id: 'shortcut-icon-input',
                label: I18n.getMessage('shortcutIconInput', '图标设置'),
                render: (container) => {
                    const wrapper = Utils.createElement('div', '', { id: 'shortcut-icon-input' });

                    const previewLabel = Utils.createElement('label', '', {}, I18n.getMessage('shortcutIconPreview', '当前图标预览'));
                    const previewImage = Utils.createElement('img', 'shortcut-icon-preview', {
                        alt: I18n.getMessage('shortcutIconPreview', '当前图标预览')
                    });
                    previewImage.style.width = '48px';
                    previewImage.style.height = '48px';
                    previewImage.style.borderRadius = '8px';
                    previewImage.style.display = 'block';
                    previewImage.style.margin = '8px 0 12px 0';

                    const refreshButton = Utils.createElement('button', 'btn', {}, I18n.getMessage('shortcutIconRefresh', '重新获取图标'));
                    refreshButton.type = 'button';
                    refreshButton.addEventListener('click', async (e) => {
                        e.preventDefault();
                        await IconManager.resetIcon(shortcutUrl);
                        IconManager.setIconForElement(previewImage, shortcutUrl);
                        this.refreshShortcutIcon(shortcutButton, shortcutUrl);
                    });

                    const fileLabel = Utils.createElement('label', '', {}, I18n.getMessage('shortcutIconFile', '本地图标（可选）'));
                    const fileInput = Utils.createElement('input', '', {
                        type: 'file',
                        accept: 'image/*'
                    });

                    const urlLabel = Utils.createElement('label', '', {}, I18n.getMessage('shortcutIconUrl', '图标URL（可选）'));
                    const urlInput = Utils.createElement('input', '', {
                        type: 'url',
                        placeholder: 'https://example.com/icon.png'
                    });

                    wrapper.appendChild(previewLabel);
                    wrapper.appendChild(previewImage);
                    wrapper.appendChild(refreshButton);
                    wrapper.appendChild(fileLabel);
                    wrapper.appendChild(fileInput);
                    wrapper.appendChild(urlLabel);
                    wrapper.appendChild(urlInput);
                    container.appendChild(wrapper);

                    IconManager.setIconForElement(previewImage, shortcutUrl);
                    wrapper._shortcutIconFile = fileInput;
                    wrapper._shortcutIconUrl = urlInput;
                },
                getValue: () => {
                    const wrapper = document.getElementById('shortcut-icon-input');
                    if (!wrapper) return { file: null, url: '' };
                    const fileInput = wrapper._shortcutIconFile;
                    const urlInput = wrapper._shortcutIconUrl;
                    return {
                        file: fileInput && fileInput.files ? fileInput.files[0] : null,
                        url: urlInput ? urlInput.value.trim() : ''
                    };
                }
            }
        ];

        Menu.showFormModal(
            I18n.getMessage('shortcutCustomIcon', '自定义图标'),
            formItems,
            async (formData) => {
                const iconInput = formData['shortcut-icon-input'] || {};
                if (!iconInput.file && !iconInput.url) {
                    return;
                }
                const iconData = await this.resolveShortcutIconData(iconInput);

                if (!iconData) {
                    Notification.notify({
                        title: I18n.getMessage('error', '错误'),
                        message: I18n.getMessage('shortcutIconEmpty', '请提供图标文件或URL'),
                        type: 'error',
                        duration: 2500
                    });
                    return;
                }

                await IconManager.setCustomIcon(shortcutUrl, iconData);
                this.refreshShortcutIcon(shortcutButton, shortcutUrl);
            },
            I18n.getMessage('confirm', '确认'),
            I18n.getMessage('cancel', '取消')
        );
    },

    /**
     * 解析快捷方式图标输入数据
     * @param {{file: File|null, url: string}} iconInput - 图标输入
     * @returns {Promise<string|null>} 图标数据
     */
    resolveShortcutIconData: async function(iconInput) {
        if (!iconInput) return null;
        if (iconInput.file) {
            return await Utils.blobToBase64(iconInput.file);
        }

        const iconUrl = iconInput.url;
        if (!iconUrl) return null;
        if (iconUrl.startsWith('data:')) {
            return iconUrl;
        }

        try {
            const response = await fetch(iconUrl);
            if (!response.ok) throw new Error('fetch failed');
            const blob = await response.blob();
            return await Utils.blobToBase64(blob);
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('error', '错误'),
                message: I18n.getMessage('shortcutIconFetchFailed', '图标获取失败'),
                type: 'error',
                duration: 2500
            });
            return null;
        }
    },

    /**
     * 刷新快捷方式图标
     * @param {HTMLElement} shortcutButton - 快捷方式元素
     * @param {string} shortcutUrl - 快捷方式URL
     */
    refreshShortcutIcon: function(shortcutButton, shortcutUrl) {
        const iconElement = shortcutButton.querySelector('img.shortcut-icon');
        if (!iconElement) return;
        IconManager.setIconForElement(iconElement, shortcutUrl);
    },

    /**
     * 显示文件夹上下文菜单
     */
    showFolderContextMenu: async function(event, folder) {
        try {
            event.preventDefault();
            const data = await chrome.storage.local.get("pinnedFolders");
            const pinnedFolders = data.pinnedFolders || [];
            const isPinned = pinnedFolders.includes(folder.id);
            
            const menuItems = [
                {
                    id: isPinned ? 'unpin-folder' : 'pin-folder',
                    text: isPinned ? I18n.getMessage('unpinFolder', '取消固定文件夹') : I18n.getMessage('pinFolder', '固定文件夹'),
                    callback: () => {
                        if (isPinned) {
                            this.unpinFolder(folder);
                        } else {
                            this.pinFolder(folder);
                        }
                    }
                },
                {
                    id: 'open-all-bookmarks',
                    text: I18n.getMessage('openAllBookmarks', '打开所有书签'),
                    callback: () => {
                        if (folder.children) {
                            const bookmarks = folder.children.filter(item => item.url);
                            bookmarks.forEach(bookmark => {
                                chrome.tabs.create({ url: bookmark.url });
                            });
                        }
                    }
                }
            ];
            
            Menu.ContextMenu.show(event, menuItems, {menuId: 'folder-context-menu'});
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 固定文件夹到顶层
     */
    pinFolder: async function(folder) {
        try {
            const data = await chrome.storage.local.get("pinnedFolders");
            const pinnedFolders = data.pinnedFolders || [];
            
            if (!pinnedFolders.includes(folder.id)) {
                pinnedFolders.push(folder.id);
                await chrome.storage.local.set({ pinnedFolders });
                
                this.renderFolders();
                
                Notification.notify({
                    title: I18n.getMessage('success', '成功'),
                    message: I18n.getMessage('folderPinned', '文件夹已固定到顶层'),
                    type: 'success',
                    duration: 2000
                });
            }
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 取消固定文件夹
     */
    unpinFolder: async function(folder) {
        try {
            const data = await chrome.storage.local.get("pinnedFolders");
            let pinnedFolders = data.pinnedFolders || [];
            
            pinnedFolders = pinnedFolders.filter(id => id !== folder.id);
            await chrome.storage.local.set({ pinnedFolders });
            
            this.renderFolders();
            
            Notification.notify({
                title: I18n.getMessage('success', '成功'),
                message: I18n.getMessage('folderUnpinned', '文件夹已取消固定'),
                type: 'success',
                duration: 2000
            });
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 渲染固定文件夹和普通文件夹
     */
    renderFolders: async function() {
        try {
            const container = document.getElementById("folder-list");
            if (!container) return;
            
            container.innerHTML = "";
            
            const bookmarks = await chrome.bookmarks.getTree();
            const root = bookmarks[0];
            
            const data = await chrome.storage.local.get("pinnedFolders");
            const pinnedFolders = data.pinnedFolders || [];
            
            // 渲染固定文件夹
            let hasPinnedFolders = false;
            const pinnedSection = Utils.createElement("div", "pinned-folders-section");
            
            for (const folderId of pinnedFolders) {
                const folder = this.findFolderById(root, folderId);
                if (folder && !this.isFolderEmpty(folder)) {
                    if (!hasPinnedFolders) {
                        // 只有在有实际固定文件夹时才添加标题
                        const pinnedHeader = Utils.createElement("h3", "section-header", {}, I18n.getMessage('pinnedFolders', '固定文件夹'));
                        pinnedSection.appendChild(pinnedHeader);
                        hasPinnedFolders = true;
                    }
                    this.createFolderButton(folder, pinnedSection, true);
                }
            }
            
            if (hasPinnedFolders) {
                container.appendChild(pinnedSection);
                container.appendChild(Utils.createElement("hr", "folder-section-divider"));
            }
            
            // 渲染常规文件夹
            const regularSection = Utils.createElement("div", "regular-folders-section");
            
            if (pinnedFolders.length > 0) {
                const regularHeader = Utils.createElement("h3", "section-header", {}, I18n.getMessage('allFolders', '所有文件夹'));
                regularSection.appendChild(regularHeader);
            }
            
            let hasRegularFolders = false;
            for (let folder of root.children) {
                if (!this.isFolderEmpty(folder)) {
                    hasRegularFolders = true;
                    this.createFolderButton(folder, regularSection, false);
                }
            }
            
            if (hasRegularFolders) {
                container.appendChild(regularSection);
            }
            
            await new Promise(resolve => setTimeout(resolve, 0));
            this.applySelectedFolder(root);
            
        } catch (error) {
            this.showError(error);
        }
    }
};
