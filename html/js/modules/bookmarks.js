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
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 加载文件夹展开状态
     * @returns {Promise<void>}
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
     * @returns {Promise<void>}
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
            
            if (root && root.children) {
                const specialRootFolders = root.children;
                
                for (let specialRoot of specialRootFolders) {
                    if (specialRoot.children && !this.isFolderEmpty(specialRoot)) {
                        this.createRootFolderButton(specialRoot, folderList);
                    }
                }
            }
            
            this.applySelectedFolder(root);
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
     * @param {boolean} isPinned - 是否为固定文件夹
     */
    createRootFolderButton: function(folder, container, isPinned = false) {
        try {
            console.log('Creating root folder button:', {
                folderId: folder.id,
                folderTitle: folder.title,
                isPinned: isPinned,
                hasChildren: folder.children ? folder.children.length : 0,
                isExpanded: expandedFolders.has(folder.id)
            });
            
            // 创建文件夹按钮
            let folderButton = Utils.createElement("div", "folder-button", {
                id: `folder-${folder.id}${isPinned ? '-pinned' : ''}`,
                'data-folder-id': folder.id,
                'data-pinned': isPinned ? 'true' : 'false'
            });
            
            // 检查是否有非空子文件夹
            const nonEmptySubFolders = folder.children.filter(child => 
                child.children && !this.isFolderEmpty(child)
            );
            const hasNonEmptySubFolders = nonEmptySubFolders.length > 0;
            
            // 检查当前展开状态
            const isExpanded = expandedFolders.has(folder.id);
            
            // 创建文件夹内容
            const folderContent = Utils.createElement("div", "folder-content folder-indent-0");
            
            // 创建箭头元素 - 使用统一的Unicode字符
            const arrowElement = Utils.createElement("span", "folder-arrow");
            if (isPinned) {
                // 固定文件夹不允许展开，不显示箭头或显示禁用状态
                arrowElement.textContent = '';
                arrowElement.setAttribute('data-expandable', 'false');
            } else if (hasNonEmptySubFolders) {
                // 根据展开状态设置箭头
                arrowElement.textContent = isExpanded ? EXPAND_SYMBOLS.EXPANDED : EXPAND_SYMBOLS.COLLAPSED;
                arrowElement.setAttribute('data-expandable', 'true');
            } else {
                arrowElement.textContent = '';
                arrowElement.setAttribute('data-expandable', 'false');
                // 没有子文件夹时不显示箭头
                arrowElement.style.display = 'none';
            }
            
            // 创建图标和名称的包装容器
            const iconNameWrapper = Utils.createElement("div", "folder-icon-name-wrapper");
            
            // 创建图标元素
            const iconElement = Utils.createElement("span", "folder-icon");
            iconElement.textContent = isPinned ? '📌' : '📁';
            
            // 创建名称元素
            const nameElement = Utils.createElement("span", "folder-name");
            nameElement.textContent = folder.title || I18n.getMessage('untitledFolder');
            
            // 按顺序添加子元素
            iconNameWrapper.appendChild(iconElement);
            iconNameWrapper.appendChild(nameElement);
            
            folderContent.appendChild(arrowElement);
            folderContent.appendChild(iconNameWrapper);
            folderButton.appendChild(folderContent);
            
            // 根据展开状态设置按钮状态
            if (isExpanded && !isPinned) {
                folderButton.classList.add('open');
            }
            
            // 存储文件夹数据到按钮元素
            folderButton.folderData = folder;
            
            // 添加按钮到父元素
            container.appendChild(folderButton);
            
            // 只有非固定文件夹且有非空子文件夹时才创建子容器
            if (!isPinned && hasNonEmptySubFolders) {
                const childrenContainer = Utils.createElement("div", "folder-children", {
                    id: `children-${folder.id}`
                });
                
                // 根据展开状态设置子容器的初始状态
                if (isExpanded) {
                    childrenContainer.classList.add('folder-children-open');
                    childrenContainer.style.pointerEvents = 'auto';
                } else {
                    childrenContainer.classList.add('folder-children-closed');
                    childrenContainer.style.pointerEvents = 'none';
                }
                
                // 对子文件夹进行排序
                const sortedSubFolders = this.sortFoldersByStructure(nonEmptySubFolders);
                
                // 递归创建子文件夹
                for (let subFolder of sortedSubFolders) {
                    this.createFolderButtonsRecursive(subFolder, childrenContainer, 1);
                }
                
                container.appendChild(childrenContainer);
            }
            
            // 延迟添加事件监听，确保DOM完全构建完成
            setTimeout(() => {
                this.addFolderEventListeners(folderButton, folder);
            }, 0);
            
            console.log('Created folder button successfully:', {
                id: folderButton.id,
                hasArrow: arrowElement.textContent.trim() !== '',
                hasChildren: hasNonEmptySubFolders,
                isPinned,
                isExpanded,
                arrowExpandable: arrowElement.getAttribute('data-expandable'),
                canExpand: !isPinned && hasNonEmptySubFolders
            });
            
        } catch (error) {
            console.error('Error creating root folder button:', error);
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    },

    /**
     * 添加文件夹事件监听器
     * @param {HTMLElement} folderButton - 文件夹按钮元素
     * @param {Object} folder - 文件夹数据
     */
    addFolderEventListeners: function(folderButton, folder) {
        // 移除可能存在的旧事件监听器
        const newButton = folderButton.cloneNode(true);
        newButton.folderData = folder;
        
        if (folderButton.parentNode) {
            folderButton.parentNode.replaceChild(newButton, folderButton);
            folderButton = newButton;
        }
        
        const arrowElement = folderButton.querySelector('.folder-arrow');
        const folderContent = folderButton.querySelector('.folder-content');
        const isPinned = folderButton.getAttribute('data-pinned') === 'true';
        
        // 为整个文件夹按钮添加点击事件
        folderButton.addEventListener('click', (event) => {
            event.stopPropagation();
            
            // 检查点击的是否是箭头区域
            const clickedArrow = event.target === arrowElement || arrowElement.contains(event.target);
            
            if (clickedArrow && arrowElement && arrowElement.textContent.trim() && !isPinned) {
                // 只有非固定文件夹才能展开
                this.toggleFolderExpansion(folderButton);
            } else {
                // 点击文件夹名称区域，选择文件夹显示快捷方式
                this.toggleFolderSelection(folderButton, folder);
            }
        });
        
        // 为箭头添加额外的点击事件（增强点击检测）- 只有非固定文件夹才添加
        if (arrowElement && arrowElement.textContent.trim() && !isPinned) {
            arrowElement.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleFolderExpansion(folderButton);
            });
        }
        
        // 确保所有子元素都能正确处理事件
        const nameElement = folderButton.querySelector('.folder-name');
        const iconElement = folderButton.querySelector('.folder-icon');
        
        if (nameElement) {
            nameElement.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleFolderSelection(folderButton, folder);
            });
        }
        
        if (iconElement) {
            iconElement.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleFolderSelection(folderButton, folder);
            });
        }
        
        return folderButton;
    },

    /**
     * 切换文件夹展开/收起状态
     * @param {HTMLElement} folderButton - 文件夹按钮元素
     */
    toggleFolderExpansion: function(folderButton) {
        if (!folderButton) return;
        
        const children = folderButton.nextElementSibling;
        const isPinned = folderButton.getAttribute('data-pinned') === 'true';
        const arrowElement = folderButton.querySelector('.folder-arrow');
        const folderId = folderButton.getAttribute('data-folder-id');
        
        console.log('toggleFolderExpansion called:', {
            folderId: folderButton.id,
            dataFolderId: folderId,
            isPinned,
            hasChildren: !!children,
            childrenClasses: children ? children.className : 'none',
            hasArrow: !!arrowElement,
            arrowText: arrowElement ? arrowElement.textContent : 'none',
            arrowExpandable: arrowElement ? arrowElement.getAttribute('data-expandable') : 'none'
        });
        
        // 固定文件夹不允许展开
        if (isPinned) {
            console.log('Toggle blocked: folder is pinned');
            return;
        }
        
        // 修复条件：检查是否有子元素容器和可展开的箭头
        if (children && 
            children.classList.contains('folder-children') && 
            arrowElement && 
            arrowElement.getAttribute('data-expandable') === 'true') {

            const isOpen = folderButton.classList.contains('open');
            
            if (isOpen) {
                // 收起文件夹 - 使用统一的收起符号
                folderButton.classList.remove('open');
                children.classList.remove('folder-children-open');
                children.classList.add('folder-children-closed');
                arrowElement.textContent = EXPAND_SYMBOLS.COLLAPSED;
                // 确保子元素不可交互
                children.style.pointerEvents = 'none';
                
                // 从展开状态中移除
                if (folderId) {
                    expandedFolders.delete(folderId);
                    this.saveExpandedFolders();
                }
            } else {
                // 展开文件夹 - 使用统一的展开符号
                folderButton.classList.add('open');
                children.classList.remove('folder-children-closed');
                children.classList.add('folder-children-open');
                arrowElement.textContent = EXPAND_SYMBOLS.EXPANDED;
                // 确保子元素可以交互
                children.style.pointerEvents = 'auto';
                
                // 添加到展开状态
                if (folderId) {
                    expandedFolders.add(folderId);
                    this.saveExpandedFolders();
                }
                
                // 确保展开的内容在视图中可见
                setTimeout(() => {
                    this.ensureChildrenVisibility(folderButton);
                }, 350);
            }
        } else {
            console.log('Toggle blocked:', {
                reason: !children ? 'no children' : 
                       !children.classList.contains('folder-children') ? 'wrong class' : 
                       !arrowElement ? 'no arrow' : 
                       arrowElement.getAttribute('data-expandable') !== 'true' ? 'arrow not expandable' : 
                       'unknown'
            });
        }
    },

    /**
     * 切换文件夹选择状态（显示/隐藏快捷方式）
     * @param {HTMLElement} folderButton - 文件夹按钮元素
     * @param {Object} folder - 文件夹数据
     */
    toggleFolderSelection: function(folderButton, folder) {
        if (!folderButton || !folder) return;
        
        const isCurrentlySelected = folderButton.classList.contains('selected');
        
        if (isCurrentlySelected) {
            // 如果当前已选中，第二次点击则取消选中并隐藏快捷方式
            folderButton.classList.remove('selected');
            this.hideShortcuts();
            currentFolder = "";
            chrome.storage.local.remove('folder');
        } else {
            // 第一次点击或选择其他文件夹，显示快捷方式
            this.showShortcuts(folder);
            currentFolder = folder.id;
            
            // 保存当前选中的文件夹
            chrome.storage.local.set({ folder: folder.id });
            
            // 更新选中状态
            document.querySelectorAll('.folder-button.selected').forEach(btn => {
                btn.classList.remove('selected');
            });
            folderButton.classList.add('selected');
        }
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
            
            // 创建文件夹按钮元素 - 添加层级类到按钮本身
            let folderButton = Utils.createElement("div", `folder-button folder-indent-${level}`, {
                id: `folder-${folder.id}`,
                'data-folder-id': folder.id,
                'data-folder-name': folder.title || I18n.getMessage('untitledFolder')
            });
            
            // 获取所有非空子文件夹
            const nonEmptySubFolders = folder.children.filter(child => 
                child.children && !this.isFolderEmpty(child)
            );
            const hasNonEmptySubFolders = nonEmptySubFolders.length > 0;
            
            // 检查当前展开状态
            const isExpanded = expandedFolders.has(folder.id);
            
            // 创建文件夹内容 - 移除层级类，因为现在在按钮上
            const folderContent = Utils.createElement("div", "folder-content");
            
            // 创建箭头元素 - 使用统一的Unicode字符
            const arrowElement = Utils.createElement("span", "folder-arrow");
            if (hasNonEmptySubFolders) {
                // 根据展开状态设置箭头
                arrowElement.textContent = isExpanded ? EXPAND_SYMBOLS.EXPANDED : EXPAND_SYMBOLS.COLLAPSED;
                arrowElement.setAttribute('data-expandable', 'true');
            } else {
                arrowElement.setAttribute('data-expandable', 'false');
            }
            
            // 创建图标和名称的包装容器
            const iconNameWrapper = Utils.createElement("div", "folder-icon-name-wrapper");
            
            // 创建图标元素
            const iconElement = Utils.createElement("span", "folder-icon");
            iconElement.textContent = '📁';
            
            // 创建名称元素
            const nameElement = Utils.createElement("span", "folder-name");
            nameElement.textContent = folder.title || I18n.getMessage('untitledFolder');
            
            // 按顺序添加子元素
            iconNameWrapper.appendChild(iconElement);
            iconNameWrapper.appendChild(nameElement);
            
            folderContent.appendChild(arrowElement);
            folderContent.appendChild(iconNameWrapper);
            folderButton.appendChild(folderContent);
            
            // 根据展开状态设置按钮状态
            if (isExpanded) {
                folderButton.classList.add('open');
            }
            
            folderButton.folderData = folder;
            parentElement.appendChild(folderButton);
            
            // 只有存在非空子文件夹时才创建子容器
            if (hasNonEmptySubFolders) {
                let subFolderContainer = Utils.createElement("div", "folder-children", 
                                                {id: `children-${folder.id}`});
                
                // 根据展开状态设置初始状态
                if (isExpanded) {
                    subFolderContainer.classList.add('folder-children-open');
                    subFolderContainer.style.pointerEvents = 'auto';
                } else {
                    subFolderContainer.classList.add('folder-children-closed');
                    subFolderContainer.style.maxHeight = '0px';
                    subFolderContainer.style.opacity = '0';
                    subFolderContainer.style.pointerEvents = 'none';
                }
                
                parentElement.appendChild(subFolderContainer);
                
                // 排序子文件夹
                const sortedSubFolders = this.sortFoldersByStructure(nonEmptySubFolders);
                
                // 递归处理子文件夹
                for (let childFolder of sortedSubFolders) {
                    this.createFolderButtonsRecursive(childFolder, subFolderContainer, level + 1);
                }
            }
            
            // 添加事件监听
            this.addFolderEventListeners(folderButton, folder);
            
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
                
                // 查找所有匹配的文件夹按钮（包括固定和常规版本）
                const selectedButtons = document.querySelectorAll(`[data-folder-id="${folder}"]`);
                
                // 移除所有选中状态
                document.querySelectorAll('.folder-button.selected').forEach(btn => {
                    btn.classList.remove('selected');
                });
                
                // 为所有匹配的按钮添加选中状态
                selectedButtons.forEach(button => {
                    button.classList.add('selected');
                });
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
        // 检查文件夹是否已经被固定
        let isPinned = false;
        chrome.storage.local.get("pinnedFolders").then(data => {
            const pinnedFolders = data.pinnedFolders || [];
            isPinned = pinnedFolders.includes(folder.id);
            
            // 创建菜单项
            const menuItems = [
                // 添加固定/取消固定选项
                {
                    id: isPinned ? 'unpin-folder' : 'pin-folder',
                    text: isPinned ? I18n.getMessage('unpinFolder') || '取消固定文件夹' : I18n.getMessage('pinFolder') || '固定文件夹',
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
            ];
            
            Menu.ContextMenu.show(event, menuItems, {menuId: 'folder-context-menu'});
        });
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
     * 确保文件夹子元素在视图中可见 - 改进版本
     * @param {HTMLElement} folderButton - 文件夹按钮元素
     */
    ensureChildrenVisibility: function(folderButton) {
        const children = folderButton.nextElementSibling;
        if (!children || !children.classList.contains('folder-children')) return;
        
        // 检查文件夹列表容器
        const folderList = document.getElementById('folder-list');
        if (!folderList) return;
        
        // 等待子元素完全展开后再计算位置
        requestAnimationFrame(() => {
            const containerRect = folderList.getBoundingClientRect();
            const childrenRect = children.getBoundingClientRect();
            
            // 计算所有子按钮的总高度
            const childButtons = children.querySelectorAll('.folder-button');
            let totalChildHeight = 0;
            childButtons.forEach(button => {
                totalChildHeight += button.offsetHeight + 4; // 包括margin
            });
            
            // 如果子元素超出了容器的可视范围，调整滚动位置
            const bottomOverflow = childrenRect.bottom - containerRect.bottom;
            if (bottomOverflow > 0) {
                // 平滑滚动到合适位置
                folderList.scrollTo({
                    top: folderList.scrollTop + bottomOverflow + 20,
                    behavior: 'smooth'
                });
            }
            
            // 如果顶部也被遮挡，确保文件夹按钮可见
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
                    // 修复：使用正确的方法处理文件夹点击
                    const arrowElement = newButton.querySelector('.folder-arrow');
                    const clickedArrow = event.target === arrowElement || (arrowElement && arrowElement.contains(event.target));
                    
                    if (clickedArrow && arrowElement && arrowElement.textContent.trim() && arrowElement.getAttribute('data-expandable') === 'true') {
                        // 点击箭头 - 展开/收起子文件夹
                        this.toggleFolderExpansion(newButton);
                    } else {
                        // 点击其他区域 - 显示/隐藏快捷方式
                        this.toggleFolderSelection(newButton, newButton.folderData);
                    }
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

    /**
     * 固定文件夹到顶层
     * @param {Object} folder - 要固定的文件夹
     */
    pinFolder: async function(folder) {
        try {
            // 获取当前固定的文件夹
            const data = await chrome.storage.local.get("pinnedFolders");
            const pinnedFolders = data.pinnedFolders || [];
            
            // 如果文件夹不在固定列表中，添加它
            if (!pinnedFolders.includes(folder.id)) {
                pinnedFolders.push(folder.id);
                await chrome.storage.local.set({ pinnedFolders });
                
                // 更新UI，重新渲染文件夹列表
                this.renderFolders();
                
                // 显示成功通知
                Notification.notify({
                    title: I18n.getMessage('success') || '成功',
                    message: I18n.getMessage('folderPinned') || '文件夹已固定到顶层',
                    type: 'success',
                    duration: 2000
                });
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
     * 取消固定文件夹
     * @param {Object} folder - 要取消固定的文件夹
     */
    unpinFolder: async function(folder) {
        try {
            // 获取当前固定的文件夹
            const data = await chrome.storage.local.get("pinnedFolders");
            let pinnedFolders = data.pinnedFolders || [];
            
            // 从固定列表中移除文件夹
            pinnedFolders = pinnedFolders.filter(id => id !== folder.id);
            await chrome.storage.local.set({ pinnedFolders });
            
            // 更新UI，重新渲染文件夹列表
            this.renderFolders();
            
            // 显示成功通知
            Notification.notify({
                title: I18n.getMessage('success') || '成功',
                message: I18n.getMessage('folderUnpinned') || '文件夹已取消固定',
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
     * 渲染固定文件夹和普通文件夹
     */
    renderFolders: async function() {
        try {
            const container = document.getElementById("folder-list");
            if (!container) return;
            
            // 清空当前容器
            container.innerHTML = "";
            
            // 获取书签树
            const bookmarks = await chrome.bookmarks.getTree();
            const root = bookmarks[0];
            
            // 获取固定的文件夹列表
            const data = await chrome.storage.local.get("pinnedFolders");
            const pinnedFolders = data.pinnedFolders || [];
            
            // 先渲染固定文件夹
            if (pinnedFolders.length > 0) {
                const pinnedSection = Utils.createElement("div", "pinned-folders-section");
                const pinnedHeader = Utils.createElement("h3", "section-header", {}, I18n.getMessage('pinnedFolders') || '固定文件夹');
                pinnedSection.appendChild(pinnedHeader);
                
                for (const folderId of pinnedFolders) {
                    const folder = this.findFolderById(root, folderId);
                    if (folder && !this.isFolderEmpty(folder)) {
                        // 创建固定版本的文件夹按钮（不可展开）
                        this.createRootFolderButton(folder, pinnedSection, true);
                    }
                }
                
                container.appendChild(pinnedSection);
                
                // 如果有固定文件夹，添加分隔线
                container.appendChild(Utils.createElement("hr", "folder-section-divider"));
            }
            
            // 渲染常规文件夹层级 - 显示所有文件夹（包括已固定的）
            const regularSection = Utils.createElement("div", "regular-folders-section");
            
            // 添加常规文件夹标题
            if (pinnedFolders.length > 0) {
                const regularHeader = Utils.createElement("h3", "section-header", {}, I18n.getMessage('allFolders') || '所有文件夹');
                regularSection.appendChild(regularHeader);
            }
            
            // 创建根文件夹按钮 - 显示所有非空文件夹，包括已固定的
            let hasRegularFolders = false;
            for (let i = 0; i < root.children.length; i++) {
                const folder = root.children[i];
                // 只跳过空文件夹，不跳过已固定的文件夹
                if (!this.isFolderEmpty(folder)) {
                    hasRegularFolders = true;
                    // 创建常规版本的文件夹按钮（可展开）
                    this.createRootFolderButton(folder, regularSection, false);
                }
            }
            
            // 添加常规区域到容器
            if (hasRegularFolders) {
                container.appendChild(regularSection);
            }
            
            // 等待DOM渲染完成后再应用选中状态和事件
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // 应用选中的文件夹
            this.applySelectedFolder(root);
            
            console.log('Folders rendered:', {
                pinnedCount: pinnedFolders.length,
                totalFolders: root.children.length,
                regularFolders: root.children.filter(f => !this.isFolderEmpty(f)).length,
                hasRegularFolders,
                expandedFolders: Array.from(expandedFolders)
            });
            
        } catch (error) {
            Notification.notify({
                title: I18n.getMessage('errorTitle'),
                message: error.message || I18n.getMessage('genericError'),
                type: 'error',
                duration: 5000
            });
        }
    }
};
