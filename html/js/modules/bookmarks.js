/**
 * 书签管理模块
 * 负责处理Chrome书签的显示和交互
 * @module BookmarkManager
 */

import { Utils, Menu, I18n, IconManager, Notification, GridSystem } from './core/index.js';

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
    },    /**
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
     * 显示指定文件夹的快捷方式
     */
    showShortcuts: async function(folder) {
        const shortcutList = document.getElementById("shortcut-list");
        if (!shortcutList) return;
        
        // 保存小部件容器
        const widgetContainers = [];
        shortcutList.querySelectorAll('.widget-container').forEach(container => {
            widgetContainers.push(container);
        });
        
        // 清空快捷方式列表
        shortcutList.innerHTML = "";

        if (!folder || !folder.children || folder.children.length === 0) {
            shortcutList.classList.add('hidden');
            // 恢复小部件容器
            widgetContainers.forEach(container => {
                shortcutList.appendChild(container);
            });
            return;
        }

        let shortcuts = folder.children.filter(node => !node.children);
        if (shortcuts.length === 0) {
            shortcutList.classList.add('hidden');
            // 恢复小部件容器
            widgetContainers.forEach(container => {
                shortcutList.appendChild(container);
            });
            return;
        }

        // 加载保存的网格布局
        let gridLayout = [];
        try {
            const result = await chrome.storage.local.get(`gridLayout_${folder.id}`);
            const savedLayout = result[`gridLayout_${folder.id}`] || [];
            
            // 重新关联shortcut对象
            gridLayout = savedLayout.map(item => {
                if (item.type === 'shortcut') {
                    const shortcut = shortcuts.find(s => s.id === item.id);
                    return shortcut ? { ...item, shortcut: shortcut } : { ...item, type: 'empty' };
                }
                return item;
            });
            
            // 确保布局包含所有快捷方式
            const existingIds = new Set(gridLayout.map(item => item.id));
            const newShortcuts = shortcuts.filter(shortcut => !existingIds.has(shortcut.id));
            
            // 添加新的快捷方式到布局末尾
            newShortcuts.forEach(shortcut => {
                gridLayout.push({ id: shortcut.id, type: 'shortcut', shortcut: shortcut });
            });
            
            console.log('加载保存的网格布局:', gridLayout);
        } catch (error) {
            console.error('加载网格布局失败:', error);
            // 如果没有保存的布局，创建默认布局
            gridLayout = shortcuts.map(shortcut => ({
                id: shortcut.id,
                type: 'shortcut',
                shortcut: shortcut
            }));
        }
        
        // 确保布局至少有一定数量的空位置
        const minEmptySlots = 16; // 增加空位置数量，以便拖动时可以超出当前高度
        while (gridLayout.length < shortcuts.length + minEmptySlots) {
            gridLayout.push({ id: `empty_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, type: 'empty' });
        }
        
        // 保存this上下文供回调使用
        const self = this;

        shortcutList.classList.remove('hidden');
        // 设置为网格布局
        shortcutList.style.position = 'relative';
        shortcutList.style.height = 'auto';
        shortcutList.style.width = '100%';
        
        // 默认隐藏空位置
        self.showEmptySlots(false);
        
        // 计算网格配置
        // 强制使用更大的宽度来测试
        const containerWidth = Math.max(shortcutList.offsetWidth, 800);
        console.log('快捷方式容器宽度:', containerWidth);
        const gridConfig = GridSystem.calculateShortcutGrid(containerWidth);
        console.log('计算得到的网格配置:', gridConfig);
        
        // 确保至少有4列
        gridConfig.columns = Math.max(gridConfig.columns, 4);
        console.log('最终网格配置:', gridConfig);
        
        gridLayout.forEach((item, index) => {
            // 获取网格位置
            const position = GridSystem.getShortcutGridPosition(index, gridConfig.columns, gridConfig.cellSize, gridConfig.gap);
            
            if (item.type === 'shortcut') {
                const shortcut = item.shortcut;
                if (!shortcut || !shortcut.url) return;
                
                const shortcutButton = Utils.createElement("button", "shortcut-button", {
                    title: shortcut.title,
                    'data-shortcut-id': shortcut.id,
                    'data-grid-index': index
                });
                
                // 设置位置和大小
                shortcutButton.style.position = 'absolute';
                shortcutButton.style.left = `${position.x}px`;
                shortcutButton.style.top = `${position.y}px`;
                shortcutButton.style.width = `${gridConfig.cellSize}px`;
                shortcutButton.style.height = `${gridConfig.cellSize}px`;
                
                // 添加右键菜单事件
                shortcutButton.addEventListener('contextmenu', event => {
                    event.preventDefault();
                    this.showIconSelectorModal(shortcut);
                });
                
                // 添加拖动排序功能
                if (GridSystem && typeof GridSystem.registerDraggable === 'function') {
                    // 标记是否为真正的拖动（有足够的移动距离）
                    let isRealDrag = false;
                    let startX = 0;
                    let startY = 0;
                    let originalIndex = index;
                    
                    // 先添加点击事件
                    shortcutButton.addEventListener('click', () => {
                        if (!isRealDrag) {
                            chrome.tabs.create({ url: shortcut.url });
                        }
                    });
                    
                    GridSystem.registerDraggable(shortcutButton, {
                        gridSnapEnabled: true,
                        showGridHint: true,
                        onDragStart: (e, dragState) => {
                            // 记录起始位置
                            startX = e.clientX;
                            startY = e.clientY;
                            isRealDrag = false;
                            shortcutButton.classList.add('shortcut-dragging');
                            originalIndex = index;
                            // 显示空位置
                            console.log('开始拖动，显示空位置');
                            self.showEmptySlots(true);
                        },
                        onDragMove: (e, dragState, position) => {
                            // 检查是否有足够的移动距离
                            const distance = Math.sqrt(
                                Math.pow(e.clientX - startX, 2) + 
                                Math.pow(e.clientY - startY, 2)
                            );
                            // 如果移动距离超过5像素，认为是真正的拖动
                            if (distance > 5) {
                                isRealDrag = true;
                            }
                        },
                        onDragEnd: (e, dragState) => {
                            shortcutButton.classList.remove('shortcut-dragging');
                            
                            // 拖动结束后，基于位置计算新的索引
                            if (isRealDrag) {
                                const rect = shortcutButton.getBoundingClientRect();
                                const parentRect = shortcutButton.parentElement.getBoundingClientRect();
                                const relativeX = rect.left - parentRect.left;
                                const relativeY = rect.top - parentRect.top;
                                
                                // 计算新的网格索引
                                if (GridSystem && typeof GridSystem.getGridIndexFromPosition === 'function') {
                                    const newIndex = GridSystem.getGridIndexFromPosition(
                                        relativeX,
                                        relativeY,
                                        gridConfig.columns,
                                        gridConfig.cellSize,
                                        gridConfig.gap
                                    );
                                    
                                    // 确保索引在有效范围内
                                    const validIndex = Math.max(0, Math.min(newIndex, gridLayout.length - 1));
                                    
                                    if (validIndex !== originalIndex) {
                                        // 重新排序网格布局
                                        this.reorderGridLayout(gridLayout, originalIndex, validIndex);
                                        // 保存新的布局
                                        this.saveGridLayout(folder, gridLayout);
                                        // 重新渲染
                                        this.showShortcuts(folder);
                                    } else {
                                        // 如果没有移动，隐藏空位置
                                        console.log('没有移动，隐藏空位置');
                                        self.showEmptySlots(false);
                                    }
                                }
                            } else {
                                // 如果不是真正的拖动，隐藏空位置
                                console.log('不是真正的拖动，隐藏空位置');
                                self.showEmptySlots(false);
                            }
                            
                            // 重置拖动标记
                            setTimeout(() => {
                                isRealDrag = false;
                            }, 100);
                        }
                    });
                } else {
                    // 如果没有拖动功能，添加普通点击事件
                    shortcutButton.addEventListener('click', () => {
                        chrome.tabs.create({ url: shortcut.url });
                    });
                }
                
                // 获取图标
                this.getCustomIconForShortcut(shortcut, shortcutButton);
                
                // 添加标题
                shortcutButton.appendChild(
                    Utils.createElement("span", "shortcut-title", {}, shortcut.title)
                );
                
                // 添加元素到DOM
                shortcutList.appendChild(shortcutButton);
            } else if (item.type === 'empty') {
                // 创建空位置元素（可选，用于可视化）
                const emptySlot = Utils.createElement("div", "shortcut-empty-slot", {
                    'data-grid-index': index,
                    'data-empty-id': item.id
                });
                
                // 设置位置和大小
                emptySlot.style.position = 'absolute';
                emptySlot.style.left = `${position.x}px`;
                emptySlot.style.top = `${position.y}px`;
                emptySlot.style.width = `${gridConfig.cellSize}px`;
                emptySlot.style.height = `${gridConfig.cellSize}px`;
                emptySlot.style.border = '1px dashed rgba(255, 255, 255, 0.3)';
                emptySlot.style.borderRadius = '12px';
                emptySlot.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                emptySlot.style.display = 'none'; // 默认隐藏
                
                // 添加元素到DOM
                shortcutList.appendChild(emptySlot);
            }
        });
        
        // 调整容器高度，使其与左侧文件夹按钮框高度一致
        const folderList = document.getElementById('folder-list');
        if (folderList) {
            const folderListHeight = folderList.offsetHeight;
            shortcutList.style.height = `${folderListHeight}px`;
            console.log('设置快捷方式列表高度与文件夹列表一致:', folderListHeight, 'px');
        } else {
            // 如果没有文件夹列表，使用默认高度
            const margin = 10;
            const rowCount = Math.ceil(gridLayout.length / gridConfig.columns);
            const containerHeight = rowCount * (gridConfig.cellSize + gridConfig.gap) + 2 * margin;
            shortcutList.style.height = `${containerHeight}px`;
            console.log('设置快捷方式列表默认高度:', containerHeight, 'px, 行数:', rowCount);
        }
        
        // 保存网格布局
        this.saveGridLayout(folder, gridLayout);
        
        // 恢复小部件容器
        widgetContainers.forEach(container => {
            shortcutList.appendChild(container);
        });
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
                if (isPinned) {
                    const pinBtn = document.querySelector(`[data-folder-id="${folder}"][data-pinned="true"]`);
                    if (pinBtn) pinBtn.classList.add('selected');
                } else {
                    const regBtn = document.querySelector(`[data-folder-id="${folder}"][data-pinned="false"]`);
                    if (regBtn) regBtn.classList.add('selected');
                }
            }
        } catch (err) {
            this.showError(err);
        }
    },

    /**
     * 显示图标选择模态框
     */
    showIconSelectorModal: function(shortcut) {
        try {
            Menu.ImageSelector.show({
                title: I18n.getMessage('customIcon', '自定义图标'),
                modalId: 'icon-selector-modal',
                mode: 'icon',
                urlLabel: I18n.getMessage('iconUrl', '图标链接'),
                uploadLabel: I18n.getMessage('uploadIcon', '上传图标'),
                urlPlaceholder: 'https://example.com/icon.png',
                showReset: true,
                onReset: () => this.resetShortcutIcon(shortcut),
                onConfirm: async (iconData) => {
                    if (iconData) {
                        await this.saveCustomIconForShortcut(shortcut, iconData);
                    }
                },
                onShow: async () => {
                    const preview = document.getElementById('icon-selector-modal-preview');
                    if (!preview) return;
                    preview.innerHTML = `<div class="loading-spinner"></div>`;
                    try {
                        const customIcons = await this.getCustomIcons();
                        const customIcon = customIcons[shortcut.id];
                        if (customIcon) {
                            preview.innerHTML = `<img src="${customIcon}" alt="Current Icon" class="preview-icon-img">`;
                        } else {
                            try {
                                const iconUrl = await IconManager.getIconUrlAsync(shortcut.url);
                                if (iconUrl) {
                                    preview.innerHTML = `<img src="${iconUrl}" alt="Current Icon" class="preview-icon-img">`;
                                    // 移除早期return，允许后续debug信息处理
                                }
                            } catch (e) {
                                console.log('通过IconManager获取图标失败');
                            }
                        }
                    } catch (error) {
                        console.error('加载当前图标失败:', error);
                        preview.innerHTML = `<img src="../icons/default.png" alt="Default Icon" class="preview-icon-img">`;
                    }
                   // 如果开启调试模式，显示图标实际尺寸
                   if (window.DEBUG_MODE) {
                       const img = preview.querySelector('.preview-icon-img');
                       if (img) {
                           const appendSize = () => {
                               const info = Utils.createElement('div', 'icon-size-info', {}, `${img.naturalWidth}x${img.naturalHeight}px`);
                               preview.appendChild(info);
                           };
                           if (img.complete) {
                               appendSize();
                           } else {
                               img.addEventListener('load', appendSize);
                           }
                       }
                   }
                }
            });
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 保存自定义图标
     */
    saveCustomIconForShortcut: async function(shortcut, iconData) {
        try {
            if (!iconData) return;
            
            const customIcons = await this.getCustomIcons();
            customIcons[shortcut.id] = iconData;
            await chrome.storage.local.set({ customIcons });
            
            await this.reloadCurrentFolder();
            
            Notification.notify({
                title: I18n.getMessage('success', '成功'),
                message: I18n.getMessage('iconUpdated', '图标已更新'),
                type: 'success',
                duration: 2000
            });
            
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 重置书签图标
     */
    resetShortcutIcon: async function(shortcut) {
        try {
            const customIcons = await this.getCustomIcons();
            const shortcutList = document.getElementById("shortcut-list");
            
            if (shortcutList) {
                const shortcutButtons = shortcutList.querySelectorAll('.shortcut-button');
                
                for (const button of shortcutButtons) {
                    if (button.title === shortcut.title) {
                        button.style.backgroundImage = '';
                        button.style.transition = 'all 0.3s';
                        button.style.boxShadow = '0 0 15px rgba(0, 123, 255, 0.8)';
                        
                        if (customIcons[shortcut.id]) {
                            delete customIcons[shortcut.id];
                            await chrome.storage.local.set({ customIcons });
                        }
                        
                        await IconManager.resetIcon(shortcut.url);
                        
                        const domain = Utils.getDomain(shortcut.url);
                        await chrome.storage.local.remove(domain);
                        await chrome.storage.local.remove(shortcut.url);
                        
                        setTimeout(() => {
                            button.style.boxShadow = '';
                            button.style.backgroundImage = '';
                            
                            const timestamp = Date.now();
                            const refreshedUrl = shortcut.url + (shortcut.url.includes('?') ? '&' : '?') + '_t=' + timestamp;
                            IconManager.getIconUrl(refreshedUrl, button);
                        }, 300);
                        
                        break;
                    }
                }
            }
            
            Notification.notify({
                title: I18n.getMessage('iconReset', '图标已重置'),
                message: I18n.getMessage('fetchingDefaultIcon', '正在获取默认图标'),
                type: 'info',
                duration: 2000
            });
            
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 获取保存的自定义图标
     */
    getCustomIcons: async function() {
        try {
            const result = await chrome.storage.local.get('customIcons');
            return result.customIcons || {};
        } catch (error) {
            this.showError(error);
            return {};
        }
    },

    /**
     * 重新加载当前文件夹内容
     */
    reloadCurrentFolder: async function() {
        try {
            const tree = await chrome.bookmarks.getTree();
            const root = tree[0];
            
            if (!currentFolder) return;
            
            const folder = this.findFolderById(root, currentFolder);
            if (folder) {
                this.showShortcuts(folder);
            }
        } catch (error) {
            this.showError(error);
        }
    },

    /**
     * 为快捷方式获取自定义图标
     */
    getCustomIconForShortcut: async function(shortcut, element) {
        try {
            const customIcons = await this.getCustomIcons();
            const customIcon = customIcons[shortcut.id];
            
            if (customIcon) {
                element.style.backgroundImage = `url(${customIcon})`;
            } else {
                IconManager.getIconUrl(shortcut.url, element);
            }
        } catch (error) {
            this.showError(error);
            IconManager.getIconUrl(shortcut.url, element);
        }
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
     * 重新排序网格布局
     */
    reorderGridLayout: function(gridLayout, fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        
        // 保存要移动的元素
        const movedItem = gridLayout[fromIndex];
        
        // 1. 将原位置替换为空位置
        gridLayout[fromIndex] = {
            id: `empty_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'empty'
        };
        
        // 2. 将目标位置的元素替换为移动的元素
        gridLayout[toIndex] = movedItem;
        
        console.log('重新排序网格布局:', `从 ${fromIndex} 到 ${toIndex}`);
    },
    
    /**
     * 保存网格布局
     */
    saveGridLayout: async function(folder, gridLayout) {
        try {
            // 保存包含空位置的完整布局
            const layoutToSave = gridLayout.map(item => {
                if (item.type === 'shortcut') {
                    return {
                        id: item.id,
                        type: 'shortcut'
                    };
                } else {
                    return {
                        id: item.id,
                        type: 'empty'
                    };
                }
            });
            
            await chrome.storage.local.set({ 
                [`gridLayout_${folder.id}`]: layoutToSave 
            });
            
            console.log('网格布局已保存:', layoutToSave);
        } catch (error) {
            console.error('保存网格布局失败:', error);
        }
    },
    
    /**
     * 显示或隐藏空位置
     */
    showEmptySlots: function(show) {
        const emptySlots = document.querySelectorAll('.shortcut-empty-slot');
        emptySlots.forEach(slot => {
            slot.style.display = show ? 'block' : 'none';
        });
    },

    /**
     * 处理右键菜单事件
     */
    handleContextMenu: function(event) {
        if (event.target.matches('input, textarea, [contenteditable="true"]')) {
            return;
        }        const shortcutButton = event.target.closest('.shortcut-button');
        
        if (shortcutButton) {
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
