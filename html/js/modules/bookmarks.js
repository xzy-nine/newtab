/**
 * 书签管理模块
 * 负责处理Chrome书签和自定义书签的显示和交互
 */

import { Utils } from './utils.js';
import { I18n } from './i18n.js';
import { IconManager } from './iconManager.js';
import { Notification } from './notification.js';
import { Menu } from './menu.js';

// 书签数据
let bookmarks = [];
let currentFolder = "";

/**
 * 书签管理API
 * @namespace
 */
export const BookmarkManager = {
    /**
     * 初始化书签功能
     * @returns {Promise<void>}
     */
    init: async function() {
        try {
            // 显示加载指示器
            Notification.showLoadingIndicator('bookmarks-container');
            Notification.updateLoadingProgress(10, I18n.getMessage('loadingBookmarks'));
            
            // 并行加载数据提高效率
            const [_, chromeBookmarks] = await Promise.all([
                this.loadBookmarks(),
                this.getChromeBookmarks()
            ]);
            
            Notification.updateLoadingProgress(80, I18n.getMessage('renderingBookmarks'));
            this.renderBookmarks();
            this.initEvents();
            
            Notification.updateLoadingProgress(100, I18n.getMessage('ready'));
            setTimeout(() => Notification.hideLoadingIndicator(), 500);
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
            throw error;
        }
    },

    /**
     * 从存储中加载书签数据
     * @returns {Promise<void>}
     */
    loadBookmarks: async function() {
        try {
            const result = await chrome.storage.sync.get('bookmarks');
            bookmarks = result.bookmarks || [];
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
            bookmarks = [];
        }
    },

    /**
     * 获取Chrome浏览器书签
     * @returns {Promise<void>}
     */
    getChromeBookmarks: async function() {
        try {
            const tree = await chrome.bookmarks.getTree();
            const root = tree[0];
            
            const folderList = document.getElementById('folder-list');
            if (!folderList) {
                return;
            }
            
            folderList.innerHTML = '';
            
            setTimeout(() => {
                if (root && root.children) {
                    const specialRootFolders = root.children;
                    
                    for (let specialRoot of specialRootFolders) {
                        if (specialRoot.children && !this.isFolderEmpty(specialRoot)) {
                            this.createRootFolderButton(specialRoot, folderList);
                        }
                    }
                }
                
                this.applySelectedFolder(root);
                this.initEvents();
            }, 0);
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 创建根文件夹按钮
     * @param {Object} folder - 文件夹数据
     * @param {HTMLElement} container - 容器元素
     */
    createRootFolderButton: function(folder, container) {
        try {
            // 创建文件夹按钮
            let folderButton = Utils.createElement("div", "folder-button", {id: `folder-${folder.id}`});
            
            // 检查是否有非空子文件夹
            const nonEmptySubFolders = folder.children.filter(child => 
                child.children && !this.isFolderEmpty(child)
            );
            const hasNonEmptySubFolders = nonEmptySubFolders.length > 0;
            
            // 添加内容
            const folderContent = Utils.createElement("div", "folder-content folder-indent-0", {}, `
                <span class="folder-arrow">${hasNonEmptySubFolders ? '▶' : ''}</span>
                <span class="folder-icon">📁</span>
                <span class="folder-name">${folder.title || I18n.getMessage('untitledFolder')}</span>
            `);
            
            folderButton.appendChild(folderContent);
            
            // 存储文件夹数据到按钮元素
            folderButton.folderData = folder;
            
            // 添加按钮到父元素
            container.appendChild(folderButton);
            
            // 只有存在非空子文件夹时才创建子容器
            if (hasNonEmptySubFolders) {
                // 创建子文件夹容器
                let subFolderContainer = Utils.createElement("div", "folder-children folder-children-initial", 
                                                    {id: `children-${folder.id}`});
                
                // 添加到DOM
                container.appendChild(subFolderContainer);
                
                // 对子文件夹进行排序处理
                const sortedSubFolders = this.sortFoldersByStructure(nonEmptySubFolders);
                
                // 递归处理子文件夹
                for (let childFolder of sortedSubFolders) {
                    this.createFolderButtonsRecursive(childFolder, subFolderContainer, 1);
                }
            }
            
            // 添加点击事件监听
            folderButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.handleFolderClick(folderButton, folder);
            });
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 递归查找指定ID的文件夹
     * @param {Object} node - 当前节点
     * @param {string} id - 要查找的ID
     * @returns {Object|null} - 找到的文件夹或null
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
     * 判断文件夹是否为空（不包含书签或只包含空子文件夹）
     * @param {Object} folder - 文件夹对象
     * @returns {boolean} - 如果为空返回true
     */
    isFolderEmpty: function(folder) {
        if (!folder.children || folder.children.length === 0) return true;
        if (folder.children.some(item => item.url)) return false;
        return folder.children.every(child => !child.children || this.isFolderEmpty(child));
    },

    /**
     * 对文件夹进行排序
     * @param {Array} folders - 文件夹数组
     * @returns {Array} - 排序后的数组
     */
    sortFoldersByStructure: function(folders) {
        try {
            // 先按是否有子文件夹分组
            const foldersWithChildren = [];
            const foldersWithoutChildren = [];
            
            // 遍历所有非空文件夹
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
            
            // 每组内按名字排序
            foldersWithoutChildren.sort((a, b) => a.title.localeCompare(b.title));
            foldersWithChildren.sort((a, b) => a.title.localeCompare(b.title));
            
            // 无子文件夹的排在前面
            return [...foldersWithoutChildren, ...foldersWithChildren];
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
            return folders;
        }
    },

    /**
     * 递归创建文件夹按钮
     * @param {Object} folder - 文件夹数据
     * @param {HTMLElement} parentElement - 父元素
     * @param {number} level - 缩进级别
     */
    createFolderButtonsRecursive: function(folder, parentElement, level) {
        try {
            // 跳过没有children属性的项目或空文件夹
            if (!folder.children || this.isFolderEmpty(folder)) return;
            
            // 创建文件夹按钮元素
            let folderButton = Utils.createElement("div", "folder-button", {
                id: `folder-${folder.id}`,
                'data-folder-name': folder.title || I18n.getMessage('untitledFolder')
            });
            
            // 获取所有非空子文件夹
            const nonEmptySubFolders = folder.children.filter(child => 
                child.children && !this.isFolderEmpty(child)
            );
            const hasNonEmptySubFolders = nonEmptySubFolders.length > 0;
            
            // 添加层级标识和展开/折叠指示器
            const folderContent = Utils.createElement("div", `folder-content folder-indent-${level}`, {}, `
                <span class="folder-arrow">${hasNonEmptySubFolders ? '▶' : ''}</span>
                <span class="folder-icon">📁</span>
                <span class="folder-name">${folder.title || I18n.getMessage('untitledFolder')}</span>
            `);
            
            folderButton.appendChild(folderContent);
            folderButton.folderData = folder;
            parentElement.appendChild(folderButton);
            
            // 只有存在非空子文件夹时才创建子容器
            if (hasNonEmptySubFolders) {
                let subFolderContainer = Utils.createElement("div", "folder-children folder-children-initial", 
                                                        {id: `children-${folder.id}`});
                parentElement.appendChild(subFolderContainer);
                
                // 排序子文件夹
                const sortedSubFolders = this.sortFoldersByStructure(nonEmptySubFolders);
                
                // 递归处理子文件夹
                for (let childFolder of sortedSubFolders) {
                    this.createFolderButtonsRecursive(childFolder, subFolderContainer, level + 1);
                }
            }
            
            // 添加点击事件监听
            folderButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.handleFolderClick(folderButton, folder);
            });
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 应用选中的文件夹
     * @param {Object} root - 根节点
     */
    applySelectedFolder: function(root) {
        chrome.storage.local.get("folder").then(data => {
            let folder = data.folder || root.id;
            currentFolder = folder;
            
            const selectedFolder = this.findFolderById(root, folder);
            if (selectedFolder) {
                this.showShortcuts(selectedFolder);
                
                const selectedButton = document.getElementById(`folder-${folder}`);
                if (selectedButton) {
                    document.querySelectorAll('.folder-button.selected').forEach(btn => {
                        btn.classList.remove('selected');
                    });
                    selectedButton.classList.add('selected');
                }
            }
        }).catch(err => {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: err.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        });
    },

    /**
     * 处理文件夹点击事件
     * @param {HTMLElement} folderButton - 文件夹按钮元素
     * @param {Object} folder - 文件夹数据
     */
    handleFolderClick: function(folderButton, folder) {
        if (!folderButton || !folder) return;
        
        const parent = folderButton.parentElement;
        const children = folderButton.nextElementSibling;
        
        // 判断是否有非空子文件夹
        const hasChildren = children && children.classList.contains('folder-children') && 
                            children.querySelector('.folder-button');
        
        // 处理展开/折叠
        if (hasChildren) {
            const isOpen = folderButton.classList.contains('open');
            
            // 关闭同级展开的文件夹
            parent.querySelectorAll(':scope > .folder-button.open').forEach(openButton => {
                if (openButton !== folderButton) {
                    const openChildren = openButton.nextElementSibling;
                    if (openChildren && openChildren.classList.contains('folder-children')) {
                        this.closeFolder(openButton, openChildren);
                    }
                }
            });
            
            // 展开或折叠
            if (isOpen) {
                this.closeFolder(folderButton, children);
            } else {
                this.openFolder(folderButton, children);
                // 确保可视
                setTimeout(() => this.ensureChildrenVisibility(folderButton), 300);
            }
        }
        
        // 显示快捷方式并更新状态
        this.showShortcuts(folder);
        currentFolder = folder.id;
        
        // 保存当前选中的文件夹
        chrome.storage.local.set({ folder: folder.id });
        
        // 更新选中状态
        document.querySelectorAll('.folder-button.selected').forEach(btn => {
            btn.classList.remove('selected');
        });
        folderButton.classList.add('selected');
    },

    /**
     * 打开文件夹
     * @param {HTMLElement} button - 文件夹按钮元素
     * @param {HTMLElement} children - 子元素容器
     */
    openFolder: function(button, children) {
        button.classList.add('open');
        
        // 只有在有箭头内容时才旋转箭头
        const arrow = button.querySelector('.folder-arrow');
        if (arrow && arrow.textContent) {
            arrow.textContent = '▼';
        }
        
        // 使用直观的类名切换
        children.classList.remove('folder-children-closed');
        children.classList.add('folder-children-open');
    },

    /**
     * 关闭文件夹
     * @param {HTMLElement} button - 文件夹按钮元素
     * @param {HTMLElement} children - 子元素容器
     */
    closeFolder: function(button, children) {
        if (!children) return;
        
        button.classList.remove('open');
        
        // 更新箭头方向
        const arrowElement = button.querySelector('.folder-arrow');
        if (arrowElement && arrowElement.textContent) {
            arrowElement.textContent = '▶';
        }
        
        // 使用直观的类名切换
        children.classList.remove('folder-children-open');
        children.classList.add('folder-children-closed');
        
        // 递归关闭所有子文件夹
        children.querySelectorAll('.folder-button.open').forEach(nestedButton => {
            const nestedChildren = nestedButton.nextElementSibling;
            if (nestedChildren && nestedChildren.classList.contains('folder-children')) {
                this.closeFolder(nestedButton, nestedChildren);
            }
        });
    },

    /**
     * 显示指定文件夹的快捷方式
     * @param {Object} folder - 文件夹数据
     */
    showShortcuts: function(folder) {
        const shortcutList = document.getElementById("shortcut-list");
        if (!shortcutList) return;
        
        shortcutList.innerHTML = "";

        if (!folder || !folder.children || folder.children.length === 0) {
            shortcutList.classList.add('hidden');
            return;
        }

        let shortcuts = folder.children.filter(node => !node.children);

        if (shortcuts.length === 0) {
            shortcutList.classList.add('hidden');
            return;
        }

        shortcutList.classList.remove('hidden');
        
        // 创建快捷方式按钮
        shortcuts.forEach(shortcut => {
            if (!shortcut.url) return;
            
            // 使用Utils.createElement代替手动创建
            let shortcutButton = Utils.createElement("button", "shortcut-button", {title: shortcut.title});
            
            // 检查是否有自定义图标
            this.getCustomIconForShortcut(shortcut, shortcutButton);
            
            // 添加标题，使用Utils.createElement替代createElement
            shortcutButton.appendChild(
                Utils.createElement("span", "shortcut-title", {}, shortcut.title)
            );
            
            // 添加事件
            shortcutButton.addEventListener('click', () => window.open(shortcut.url, "_blank"));
            
            // 直接调用图标选择器，不使用中间菜单层
            shortcutButton.addEventListener('contextmenu', event => {
                event.preventDefault();
                this.showIconSelectorModal(shortcut);
            });
            
            shortcutList.appendChild(shortcutButton);
        });
    },

    /**
     * 显示文件夹上下文菜单
     * @param {Event} event - 事件对象
     * @param {Object} folder - 文件夹数据
     */
    showFolderContextMenu: function(event, folder) {
        Menu.ContextMenu.show(event, [
            {
                id: 'open-all-bookmarks',
                text: I18n.getMessage('openAllBookmarks'),
                callback: () => {
                    // 打开文件夹中所有书签
                    if (folder.children) {
                        const bookmarks = folder.children.filter(item => item.url);
                        bookmarks.forEach(bookmark => {
                            window.open(bookmark.url, "_blank");
                        });
                    }
                }
            }
        ], {menuId: 'folder-context-menu'});
    },

    /**
     * 处理右键菜单事件
     * @param {Event} event - 事件对象
     */
    handleContextMenu: function(event) {
        // 检查是否在输入框内，如果是则使用默认右键菜单
        if (event.target.matches('input, textarea, [contenteditable="true"]')) {
            return; // 使用浏览器默认右键菜单
        }

        // 处理特定元素的右键菜单
        const shortcutButton = event.target.closest('.shortcut-button');
        const bookmarkElement = event.target.closest('.bookmark');
        
        // 快捷方式按钮或书签元素已有专门的处理逻辑，直接返回
        if (shortcutButton || bookmarkElement) {
            return; // 这些元素有自己的上下文菜单处理逻辑
        }
        
        // 阻止默认右键菜单
        event.preventDefault();

        // 检查是否在文件夹上右击
        const folderButton = event.target.closest('.folder-button');
        if (folderButton && folderButton.folderData) {
            this.showFolderContextMenu(event, folderButton.folderData);
            return;
        }
    },

    /**
     * 显示书签上下文菜单
     * @param {Event} e - 事件对象
     * @param {number} index - 书签索引
     */
    showContextMenu: function(e, index) {
        Menu.ContextMenu.show(e, [
            {
                id: 'bookmark-delete',
                text: I18n.getMessage('delete'),
                callback: () => {
                    Notification.notify({
                        title: I18n.getMessage('confirm'),
                        message: I18n.getMessage('confirmDeleteBookmark'),
                        type: 'confirm',
                        duration: 0,
                        buttons: [
                            {
                                text: I18n.getMessage('confirm'),
                                class: 'btn-primary',
                                callback: () => {
                                    bookmarks.splice(index, 1);
                                    this.saveBookmarks();
                                    this.renderBookmarks();
                                }
                            },
                            {
                                text: I18n.getMessage('cancel'),
                                callback: () => {}
                            }
                        ]
                    });
                }
            },
            {
                id: 'bookmark-move-up',
                text: I18n.getMessage('moveUp'),
                disabled: index === 0,
                callback: async () => {
                    if (index > 0) {
                        [bookmarks[index - 1], bookmarks[index]] = [bookmarks[index], bookmarks[index - 1]];
                        await this.saveBookmarks();
                        this.renderBookmarks();
                    }
                }
            },
            {
                id: 'bookmark-move-down',
                text: I18n.getMessage('moveDown'),
                disabled: index === bookmarks.length - 1,
                callback: async () => {
                    if (index < bookmarks.length - 1) {
                        [bookmarks[index + 1], bookmarks[index]] = [bookmarks[index], bookmarks[index + 1]];
                        await this.saveBookmarks();
                        this.renderBookmarks();
                    }
                }
            }
        ], {menuId: 'bookmark-context-menu'});
    },

    /**
     * 显示图标选择模态框
     * @param {Object} shortcut - 书签对象
     */
    showIconSelectorModal: function(shortcut) {
        try {
            Menu.ImageSelector.show({
                title: I18n.getMessage('customIcon'),
                modalId: 'icon-selector-modal',
                mode: 'icon',
                urlLabel: I18n.getMessage('iconUrl'),
                uploadLabel: I18n.getMessage('uploadIcon'),
                urlPlaceholder: 'https://example.com/icon.png',
                showReset: true,
                onReset: () => this.resetShortcutIcon(shortcut),
                onConfirm: async (iconData) => {
                    if (iconData) {
                        await this.saveCustomIconForShortcut(shortcut, iconData);
                    }
                },
                // 添加回调，在模态框打开后立即显示当前图标
                onShow: async () => {
                    // 获取预览区域
                    const preview = document.getElementById('icon-selector-modal-preview');
                    if (!preview) return;
                    
                    // 先显示加载状态
                    preview.innerHTML = `<div class="loading-spinner"></div>`;
                    
                    try {
                        // 检查是否有自定义图标
                        const customIcons = await this.getCustomIcons();
                        const customIcon = customIcons[shortcut.id];
                        
                        if (customIcon) {
                            // 使用自定义图标
                            preview.innerHTML = `<img src="${customIcon}" alt="Current Icon" class="preview-icon-img">`;
                        } else {
                            // 尝试使用IconManager获取图标
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
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 保存自定义图标
     * @param {Object} shortcut - 书签对象
     * @returns {Promise<void>}
     */
    saveCustomIconForShortcut: async function(shortcut, iconData) {
        try {
            if (!iconData) return;
            
            // 存储自定义图标
            const customIcons = await this.getCustomIcons();
            customIcons[shortcut.id] = iconData;
            await chrome.storage.local.set({ customIcons });
            
            // 刷新显示
            await this.reloadCurrentFolder();
            
            Notification.notify({
                title: I18n.getMessage('success'),
                message: I18n.getMessage('iconUpdated'),
                type: 'success',
                duration: 2000
            });
            
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 重置书签图标
     * @param {Object} shortcut - 书签对象
     * @returns {Promise<void>}
     */
    resetShortcutIcon: async function(shortcut) {
        try {
            // 获取当前自定义图标
            const customIcons = await this.getCustomIcons();
            
            // 查找当前显示的快捷方式按钮
            const shortcutList = document.getElementById("shortcut-list");
            if (shortcutList) {
                const shortcutButtons = shortcutList.querySelectorAll('.shortcut-button');
                
                for (const button of shortcutButtons) {
                    if (button.title === shortcut.title) {
                        // 清除当前背景图像并应用临时样式
                        button.style.backgroundImage = '';
                        button.style.transition = 'all 0.3s';
                        button.style.boxShadow = '0 0 15px rgba(0, 123, 255, 0.8)';
                        
                        // 删除存储中的自定义图标（如果有）
                        if (customIcons[shortcut.id]) {
                            delete customIcons[shortcut.id];
                            await chrome.storage.local.set({ customIcons });
                        }
                        
                        // 调用IconManager的重置方法清除图标缓存
                        await IconManager.resetIcon(shortcut.url);
                        
                        // 从所有可能的存储位置清除图标
                        const domain = Utils.getDomain(shortcut.url);
                        await chrome.storage.local.remove(domain);
                        await chrome.storage.local.remove(shortcut.url);
                        
                        // 重新获取图标
                        setTimeout(() => {
                            button.style.boxShadow = '';
                            // 完全清除背景
                            button.style.backgroundImage = '';
                            
                            // 清除DOM缓存，确保不使用缓存的图片
                            const timestamp = Date.now();
                            // 使用新的URL对象，添加时间戳来绕过缓存
                            const refreshedUrl = shortcut.url + (shortcut.url.includes('?') ? '&' : '?') + '_t=' + timestamp;
                            
                            // 从零开始获取新图标
                            IconManager.getIconUrl(refreshedUrl, button);
                        }, 300);
                        
                        break;
                    }
                }
            }
            
            Notification.notify({
                title: I18n.getMessage('iconReset'),
                message: I18n.getMessage('fetchingDefaultIcon'),
                type: 'info',
                duration: 2000
            });
            
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 获取保存的自定义图标
     * @returns {Promise<Object>} - 自定义图标对象
     */
    getCustomIcons: async function() {
        try {
            const result = await chrome.storage.local.get('customIcons');
            return result.customIcons || {};
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
            return {};
        }
    },

    /**
     * 重新加载当前文件夹内容
     * @returns {Promise<void>}
     */
    reloadCurrentFolder: async function() {
        try {
            // 获取Chrome书签树
            const tree = await chrome.bookmarks.getTree();
            const root = tree[0];
            
            // 根据当前文件夹ID查找文件夹对象
            if (!currentFolder) return;
            
            const folder = this.findFolderById(root, currentFolder);
            if (folder) {
                this.showShortcuts(folder);
            }
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 为快捷方式获取自定义图标，如果没有则使用默认图标
     * @param {Object} shortcut - 快捷方式数据
     * @param {HTMLElement} element - 要设置图标的元素
     */
    getCustomIconForShortcut: async function(shortcut, element) {
        try {
            // 获取自定义图标
            const customIcons = await this.getCustomIcons();
            const customIcon = customIcons[shortcut.id];
            
            if (customIcon) {
                // 使用自定义图标
                element.style.backgroundImage = `url(${customIcon})`;
            } else {
                // 使用默认图标获取逻辑
                IconManager.getIconUrl(shortcut.url, element);
            }
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
            // 出错时使用默认图标
            IconManager.getIconUrl(shortcut.url, element);
            console.error(I18n.getMessage('fetchCustomIconFailed'), error);
        }
    },

    /**
     * 确保文件夹子元素在视图中可见
     * @param {HTMLElement} folderButton - 文件夹按钮元素
     */
    ensureChildrenVisibility: function(folderButton) {
        const children = folderButton.nextElementSibling;
        if (!children || !children.classList.contains('folder-children')) return;
        
        // 检查文件夹列表容器
        const folderList = document.getElementById('folder-list');
        if (!folderList) return;
        
        // 计算可视区域底部与展开文件夹底部的差值
        const containerRect = folderList.getBoundingClientRect();
        const childrenRect = children.getBoundingClientRect();
        
        // 如果子元素超出了容器的可视范围，调整滚动位置
        if (childrenRect.bottom > containerRect.bottom) {
            const scrollAmount = childrenRect.bottom - containerRect.bottom + 20;
            folderList.scrollTop += scrollAmount;
        }
    },

    /**
     * 初始化书签相关事件
     */
    initEvents: function() {
        // 初始化文件夹状态
        document.querySelectorAll('.folder-children').forEach(container => {
            container.classList.add('folder-children-closed');
            container.classList.remove('folder-children-open');
        });
        
        // 移除旧事件并添加新事件
        document.querySelectorAll('.folder-button').forEach(button => {
            const newButton = button.cloneNode(true);
            newButton.folderData = button.folderData;
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', (event) => {
                event.stopPropagation();
                if (newButton.folderData) {
                    this.handleFolderClick(newButton, newButton.folderData);
                }
            });
        });

        // 添加其他事件处理
        document.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    },

    /**
     * 渲染自定义书签列表
     */
    renderBookmarks: function() {
        const bookmarkContainer = document.getElementById('custom-bookmark-container');
        if (!bookmarkContainer) return;
        
        // 清空现有书签
        bookmarkContainer.innerHTML = '';
        
        // 添加书签元素
        bookmarks.forEach((bookmark, index) => {
            const bookmarkElement = this.createBookmarkElement(bookmark, index);
            bookmarkContainer.appendChild(bookmarkElement);
        });
    },

    /**
     * 创建单个书签元素
     * @param {Object} bookmark - 书签数据
     * @param {number} index - 书签索引
     * @returns {HTMLElement} - 书签DOM元素
     */
    createBookmarkElement: function(bookmark, index) {
        const bookmarkElement = Utils.createElement('div', 'bookmark', {'data-index': index});
        
        // 创建图标
        const icon = Utils.createElement('div', 'bookmark-icon');
        const iconImg = Utils.createElement('img');
        // 使用Utils.getDomain获取域名
        iconImg.src = bookmark.customIcon || `${Utils.getDomain(bookmark.url)}/favicon.ico`;
        iconImg.onerror = () => { iconImg.src = 'Icon.png'; };
        
        icon.appendChild(iconImg);
        bookmarkElement.appendChild(icon);
        bookmarkElement.appendChild(Utils.createElement('div', 'bookmark-title', {}, bookmark.title));
        
        // 添加事件
        bookmarkElement.addEventListener('click', e => {
            if (!e.target.closest('.bookmark-menu')) window.open(bookmark.url, '_blank');
        });
        
        bookmarkElement.addEventListener('contextmenu', e => {
            e.preventDefault();
            this.showContextMenu(e, index);
        });
        
        return bookmarkElement;
    },

    /**
     * 保存书签数据到存储
     * @returns {Promise<void>}
     */
    saveBookmarks: async function() {
        try {
            await chrome.storage.sync.set({ bookmarks });
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 获取所有书签
     * @returns {Array} - 书签数组
     */
    getAllBookmarks: function() {
        return [...bookmarks];
    },

    /**
     * 导入书签
     * @param {Array} importedBookmarks - 要导入的书签数组
     * @returns {Promise<void>}
     */
    importBookmarks: async function(importedBookmarks) {
        try {
            if (!Array.isArray(importedBookmarks)) return;
            
            importedBookmarks.forEach(bookmark => {
                if (!bookmarks.some(b => b.url === bookmark.url)) {
                    bookmarks.push(bookmark);
                }
            });
            
            await this.saveBookmarks();
            this.renderBookmarks();
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },
};
