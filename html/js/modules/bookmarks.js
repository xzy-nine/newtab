/**
 * 书签管理模块
 * 负责处理Chrome书签的显示和交互
 */

import { Utils, Menu, I18n, IconManager, Notification } from './core/index.js';

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
     * @param {Object} folder - 文件夹数据
     * @param {HTMLElement} container - 容器元素
     * @param {boolean} isPinned - 是否为固定文件夹
     * @param {number} level - 缩进级别（默认为0）
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
            iconElement.textContent = isPinned ? '📌' : '📁';
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
    applySelectedFolder: function(root) {
        chrome.storage.local.get("folder").then(data => {
            let folder = data.folder || root.id;
            currentFolder = folder;
            
            const selectedFolder = this.findFolderById(root, folder);
            if (selectedFolder) {
                this.showShortcuts(selectedFolder);
                
                // 清除所有选中状态
                document.querySelectorAll('.folder-button.selected').forEach(btn => {
                    btn.classList.remove('selected');
                });
                
                // 获取固定文件夹列表
                chrome.storage.local.get("pinnedFolders").then(pinnedData => {
                    const pinnedFolders = pinnedData.pinnedFolders || [];
                    const isPinnedFolder = pinnedFolders.includes(folder);
                    
                    // 如果是固定文件夹，优先选中固定版本，否则选中原始版本
                    if (isPinnedFolder) {
                        // 选中固定版本
                        const pinnedButton = document.querySelector(`[data-folder-id="${folder}"][data-pinned="true"]`);
                        if (pinnedButton) {
                            pinnedButton.classList.add('selected');
                        }
                    } else {
                        // 选中原始版本
                        const regularButton = document.querySelector(`[data-folder-id="${folder}"][data-pinned="false"]`);
                        if (regularButton) {
                            regularButton.classList.add('selected');
                        }
                    }
                }).catch(err => {
                    // 如果获取固定文件夹列表失败，则选中所有匹配的按钮
                    const selectedButtons = document.querySelectorAll(`[data-folder-id="${folder}"]`);
                    selectedButtons.forEach(button => {
                        button.classList.add('selected');
                    });
                });
            }
        }).catch(err => this.showError(err));
    },

    /**
     * 切换文件夹选择状态
     */
    toggleFolderSelection: function(folderButton, folder) {
        if (!folderButton || !folder) return;
        
        const isCurrentlySelected = folderButton.classList.contains('selected');
        
        if (isCurrentlySelected) {
            // 取消选中
            folderButton.classList.remove('selected');
            this.hideShortcuts();
            currentFolder = "";
            chrome.storage.local.remove('folder');
        } else {
            // 选中文件夹
            this.showShortcuts(folder);
            currentFolder = folder.id;
            chrome.storage.local.set({ folder: folder.id });
            
            // 清除所有选中状态
            document.querySelectorAll('.folder-button.selected').forEach(btn => {
                btn.classList.remove('selected');
            });
            
            // 只选中当前点击的按钮
            folderButton.classList.add('selected');
            
            // 如果点击的是固定文件夹，确保原始文件夹不被选中
            const isPinned = folderButton.getAttribute('data-pinned') === 'true';
            const folderId = folderButton.getAttribute('data-folder-id');
            
            if (isPinned) {
                // 确保原始版本不被选中
                const regularButton = document.querySelector(`[data-folder-id="${folderId}"][data-pinned="false"]`);
                if (regularButton) {
                    regularButton.classList.remove('selected');
                }
            } else {
                // 确保固定版本不被选中
                const pinnedButton = document.querySelector(`[data-folder-id="${folderId}"][data-pinned="true"]`);
                if (pinnedButton) {
                    pinnedButton.classList.remove('selected');
                }
            }
        }
    },

    /**
     * 显示指定文件夹的快捷方式
     */
    showShortcuts: function(folder) {
        const shortcutList = document.getElementById("shortcut-list");
        if (!shortcutList) return;
        
        shortcutList.innerHTML = "";

        if (!folder || !folder.children || folder.children.length === 0) {
            shortcutList.classList.add('hidden');
            return;
        }

        const shortcuts = folder.children.filter(node => !node.children);
        if (shortcuts.length === 0) {
            shortcutList.classList.add('hidden');
            return;
        }

        shortcutList.classList.remove('hidden');
        
        shortcuts.forEach(shortcut => {
            if (!shortcut.url) return;
            
            const shortcutButton = Utils.createElement("button", "shortcut-button", {title: shortcut.title});
            
            // 获取图标
            this.getCustomIconForShortcut(shortcut, shortcutButton);
            
            // 添加标题
            shortcutButton.appendChild(
                Utils.createElement("span", "shortcut-title", {}, shortcut.title)
            );
            
            // 添加事件
            shortcutButton.addEventListener('click', () => window.open(shortcut.url, "_blank"));
            shortcutButton.addEventListener('contextmenu', event => {
                event.preventDefault();
                this.showIconSelectorModal(shortcut);
            });
            
            shortcutList.appendChild(shortcutButton);
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
    applySelectedFolder: function(root) {
        chrome.storage.local.get("folder").then(data => {
            let folder = data.folder || root.id;
            currentFolder = folder;
            
            const selectedFolder = this.findFolderById(root, folder);
            if (selectedFolder) {
                this.showShortcuts(selectedFolder);
                
                // 清除所有选中状态
                document.querySelectorAll('.folder-button.selected').forEach(btn => {
                    btn.classList.remove('selected');
                });
                
                // 获取固定文件夹列表
                chrome.storage.local.get("pinnedFolders").then(pinnedData => {
                    const pinnedFolders = pinnedData.pinnedFolders || [];
                    const isPinnedFolder = pinnedFolders.includes(folder);
                    
                    // 如果是固定文件夹，优先选中固定版本，否则选中原始版本
                    if (isPinnedFolder) {
                        // 选中固定版本
                        const pinnedButton = document.querySelector(`[data-folder-id="${folder}"][data-pinned="true"]`);
                        if (pinnedButton) {
                            pinnedButton.classList.add('selected');
                        }
                    } else {
                        // 选中原始版本
                        const regularButton = document.querySelector(`[data-folder-id="${folder}"][data-pinned="false"]`);
                        if (regularButton) {
                            regularButton.classList.add('selected');
                        }
                    }
                }).catch(err => {
                    // 如果获取固定文件夹列表失败，则选中所有匹配的按钮
                    const selectedButtons = document.querySelectorAll(`[data-folder-id="${folder}"]`);
                    selectedButtons.forEach(button => {
                        button.classList.add('selected');
                    });
                });
            }
        }).catch(err => this.showError(err));
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
                                    return;
                                }
                            } catch (e) {
                                console.log('通过IconManager获取图标失败');
                            }
                        }
                    } catch (error) {
                        console.error('加载当前图标失败:', error);
                        preview.innerHTML = `<img src="Icon.png" alt="Default Icon" class="preview-icon-img">`;
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
    showFolderContextMenu: function(event, folder) {
        chrome.storage.local.get("pinnedFolders").then(data => {
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
                                window.open(bookmark.url, "_blank");
                            });
                        }
                    }
                }
            ];
            
            Menu.ContextMenu.show(event, menuItems, {menuId: 'folder-context-menu'});
        });
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
            if (pinnedFolders.length > 0) {
                const pinnedSection = Utils.createElement("div", "pinned-folders-section");
                const pinnedHeader = Utils.createElement("h3", "section-header", {}, I18n.getMessage('pinnedFolders', '固定文件夹'));
                pinnedSection.appendChild(pinnedHeader);
                
                for (const folderId of pinnedFolders) {
                    const folder = this.findFolderById(root, folderId);
                    if (folder && !this.isFolderEmpty(folder)) {
                        this.createFolderButton(folder, pinnedSection, true);
                    }
                }
                
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
