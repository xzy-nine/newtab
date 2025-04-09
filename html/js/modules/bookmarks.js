/**
 * 书签管理模块
 * 负责处理Chrome书签和自定义书签的显示和交互
 */

import { Utils } from './utils.js';
import { I18n } from './i18n.js';
import { IconManager } from './iconManager.js';

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
            // 并行加载数据提高效率
            const [_, chromeBookmarks] = await Promise.all([
                this.loadBookmarks(),
                this.getChromeBookmarks()
            ]);
            
            this.renderBookmarks();
            this.initEvents();
        } catch (error) {
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
            Utils.UI.showErrorModal('获取Chrome书签失败', error, false);
        }
    },

    /**
     * 创建根文件夹按钮
     * @param {Object} folder - 文件夹数据
     * @param {HTMLElement} container - 容器元素
     */
    createRootFolderButton: function(folder, container) {
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
            <span class="folder-name">${folder.title || "(无标题文件夹)"}</span>
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
                'data-folder-name': folder.title || "(无标题文件夹)"
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
                <span class="folder-name">${folder.title || "(无标题文件夹)"}</span>
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
            Utils.UI.showErrorModal('创建文件夹时出错:', error, false);
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
            Utils.UI.showErrorModal('获取选中文件夹失败', err, false);
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
        
        // 应用关闭样式
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
        
        children.classList.remove('folder-children-closed');
        children.classList.add('folder-children-open');
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
            
            let shortcutButton = Utils.createElement("button", "shortcut-button", {title: shortcut.title});
            
            // 检查是否有自定义图标
            this.getCustomIconForShortcut(shortcut, shortcutButton);
            
            // 添加标题
            shortcutButton.appendChild(
                Utils.createElement("span", "shortcut-title", {}, shortcut.title)
            );
            
            // 添加事件
            shortcutButton.addEventListener('click', () => window.open(shortcut.url, "_blank"));
            shortcutButton.addEventListener('contextmenu', event => {
                event.preventDefault();
                this.showShortcutContextMenu(event, shortcut);
            });
            
            shortcutList.appendChild(shortcutButton);
        });
    },

    /**
     * 显示快捷方式上下文菜单
     * @param {Event} event - 事件对象
     * @param {Object} shortcut - 快捷方式数据
     */
    showShortcutContextMenu: function(event, shortcut) {
        const { pageX, pageY } = event;
        
        // 创建上下文菜单
        let contextMenu = document.getElementById('shortcut-context-menu') || 
            Utils.createElement('div', 'context-menu', {id: 'shortcut-context-menu'});
        
        if (!document.body.contains(contextMenu)) {
            document.body.appendChild(contextMenu);
        }
        
        // 设置菜单内容和位置
        contextMenu.innerHTML = `
            <div class="context-menu-item" id="custom-icon">${I18n.getMessage('customIcon') || '自定义图标'}</div>
            <div class="context-menu-item" id="reset-icon">${I18n.getMessage('resetIcon') || '重置图标'}</div>
        `;
        
        contextMenu.style.left = `${pageX}px`;
        contextMenu.style.top = `${pageY}px`;
        contextMenu.style.display = 'block';
        
        // 菜单项点击事件 - 实现自定义图标功能
        document.getElementById('custom-icon').addEventListener('click', () => {
            this.showIconSelectorModal(shortcut);
            contextMenu.style.display = 'none';
        });
        
        document.getElementById('reset-icon').addEventListener('click', async () => {
            await this.resetShortcutIcon(shortcut);
            contextMenu.style.display = 'none';
        });
        
        // 点击其他区域关闭菜单
        const closeMenuHandler = e => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.style.display = 'none';
                document.removeEventListener('click', closeMenuHandler);
            }
        };
        
        setTimeout(() => document.addEventListener('click', closeMenuHandler), 100);
    },

    /**
     * 显示图标选择模态框
     * @param {Object} shortcut - 书签对象
     */
    showIconSelectorModal: function(shortcut) {
        // 创建模态框结构（如果不存在）
        let modal = document.getElementById('icon-selector-modal');
        if (!modal) {
            modal = Utils.createElement('div', 'modal', {id: 'icon-selector-modal'});
            const modalContent = Utils.createElement('div', 'modal-content');
            
            modalContent.innerHTML = `
                <span class="modal-close">&times;</span>
                <h2>${I18n.getMessage('customIcon') || '自定义图标'}</h2>
                <div class="modal-form">
                    <div class="form-group">
                        <label for="icon-url">${I18n.getMessage('iconUrl') || '图标URL'}</label>
                        <input type="url" id="icon-url" placeholder="https://example.com/icon.png">
                    </div>
                    <div class="form-group">
                        <label for="icon-upload">${I18n.getMessage('uploadIcon') || '上传图标'}</label>
                        <input type="file" id="icon-upload" accept="image/*">
                        <div class="image-preview" id="icon-preview"></div>
                    </div>
                    <div class="form-actions">
                        <button id="icon-cancel" class="btn">${I18n.getMessage('cancel') || '取消'}</button>
                        <button id="icon-confirm" class="btn btn-primary">${I18n.getMessage('confirm') || '确定'}</button>
                    </div>
                </div>
            `;
            
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            
            // 预览上传图片
            document.getElementById('icon-upload').addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        const preview = document.getElementById('icon-preview');
                        preview.innerHTML = `<img src="${event.target.result}" alt="Icon Preview" style="max-width: 64px; max-height: 64px; object-fit: contain;">`;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        // 显示模态框
        Utils.Modal.show('icon-selector-modal');
        
        // 清空旧数据
        const iconUrl = document.getElementById('icon-url');
        if (iconUrl) iconUrl.value = '';
        
        const iconPreview = document.getElementById('icon-preview');
        if (iconPreview) iconPreview.innerHTML = '';
        
        const iconUpload = document.getElementById('icon-upload');
        if (iconUpload) iconUpload.value = '';
        
        // 绑定确定按钮事件
        const confirmBtn = document.getElementById('icon-confirm');
        if (confirmBtn) {
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            newConfirmBtn.addEventListener('click', async () => {
                await this.saveCustomIconForShortcut(shortcut);
                modal.style.display = 'none';
            });
        }
        
        // 绑定取消按钮事件
        const cancelBtn = document.getElementById('icon-cancel');
        if (cancelBtn) {
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            newCancelBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
    },

    /**
     * 保存自定义图标
     * @param {Object} shortcut - 书签对象
     * @returns {Promise<void>}
     */
    saveCustomIconForShortcut: async function(shortcut) {
        try {
            // 检查是否有URL输入
            const iconUrlInput = document.getElementById('icon-url');
            const iconUrl = iconUrlInput && iconUrlInput.value.trim();
            
            // 检查是否上传了图片
            const iconUpload = document.getElementById('icon-upload');
            const iconFile = iconUpload && iconUpload.files[0];
            
            // 图标数据
            let iconData = null;
            
            // 优先使用上传的图片
            if (iconFile) {
                iconData = await this.readFileAsDataURL(iconFile);
            } 
            // 其次使用URL
            else if (iconUrl) {
                iconData = iconUrl;
            }
            
            if (!iconData) return;
            
            // 存储自定义图标
            const customIcons = await this.getCustomIcons();
            customIcons[shortcut.id] = iconData;
            await chrome.storage.local.set({ customIcons });
            
            // 刷新显示
            await this.reloadCurrentFolder();
            
        } catch (error) {
            Utils.UI.showErrorModal('保存自定义图标失败:', error);
        }
    },

    /**
     * 读取文件为Data URL
     * @param {File} file - 文件对象
     * @returns {Promise<string>} - data URL字符串
     */
    readFileAsDataURL: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
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
            
            Utils.UI.showNotification('图标已重置', '正在重新获取网站默认图标...', 1000);
            
        } catch (error) {
            Utils.UI.showErrorModal('重置图标失败:', error);
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
            Utils.UI.showErrorModal('获取自定义图标失败', error, false);
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
            Utils.UI.showErrorModal('重新加载文件夹内容失败:', error);
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
            // 出错时使用默认图标
            IconManager.getIconUrl(shortcut.url, element);
            Utils.UI.showErrorModal('获取自定义图标失败', error, false);
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
        
        const addBookmarkBtn = document.getElementById('add-bookmark-btn');
        if (addBookmarkBtn) {
            addBookmarkBtn.addEventListener('click', this.showBookmarkModal.bind(this));
        }
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
        iconImg.src = bookmark.customIcon || `${Utils.getDomain(bookmark.url)}/favicon.ico`;
        iconImg.onerror = () => { iconImg.src = 'images/default_favicon.png'; };
        
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
     * 显示书签上下文菜单
     * @param {Event} e - 事件对象
     * @param {number} index - 书签索引
     */
    showContextMenu: function(e, index) {
        const contextMenu = document.getElementById('bookmark-context-menu');
        if (!contextMenu) return;
        
        // 设置菜单位置
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.style.display = 'block';
        contextMenu.dataset.index = index;
        
        e.preventDefault();
        e.stopPropagation();
        
        // 构建菜单
        contextMenu.innerHTML = `
            <div id="bookmark-delete" class="context-menu-item">${I18n.getMessage('delete') || '删除'}</div>
            <div id="bookmark-move-up" class="context-menu-item ${index === 0 ? 'disabled' : ''}">${I18n.getMessage('moveUp') || '上移'}</div>
            <div id="bookmark-move-down" class="context-menu-item ${index === bookmarks.length - 1 ? 'disabled' : ''}">${I18n.getMessage('moveDown') || '下移'}</div>
        `;
        
        // 删除按钮事件
        document.getElementById('bookmark-delete').addEventListener('click', async () => {
            if(confirm(I18n.getMessage('confirmDeleteBookmark') || '确定要删除此书签吗？')) {
                bookmarks.splice(index, 1);
                await this.saveBookmarks();
                this.renderBookmarks();
            }
            contextMenu.style.display = 'none';
        });
        
        // 上移按钮事件
        document.getElementById('bookmark-move-up').addEventListener('click', async () => {
            if (index > 0) {
                [bookmarks[index - 1], bookmarks[index]] = [bookmarks[index], bookmarks[index - 1]];
                await this.saveBookmarks();
                this.renderBookmarks();
            }
            contextMenu.style.display = 'none';
        });
        
        // 下移按钮事件
        document.getElementById('bookmark-move-down').addEventListener('click', async () => {
            if (index < bookmarks.length - 1) {
                [bookmarks[index + 1], bookmarks[index]] = [bookmarks[index], bookmarks[index + 1]];
                await this.saveBookmarks();
                this.renderBookmarks();
            }
            contextMenu.style.display = 'none';
        });
        
        // 点击其他区域关闭菜单
        const closeMenuHandler = e => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.style.display = 'none';
                document.removeEventListener('click', closeMenuHandler);
            }
        };
        
        setTimeout(() => document.addEventListener('click', closeMenuHandler), 100);
    },

    /**
     * 显示书签模态框
     */
    showBookmarkModal: function() {
        // 检查是否已存在模态框
        let modal = document.getElementById('bookmark-modal');
        if (!modal) {
            // 创建模态框结构
            modal = Utils.createElement('div', 'modal', { id: 'bookmark-modal' });
            const modalContent = Utils.createElement('div', 'modal-content');
            
            modalContent.innerHTML = `
                <span class="modal-close">&times;</span>
                <h2>${I18n.getMessage('addBookmark')}</h2>
                <div class="modal-form">
                    <div class="form-group">
                        <label for="bookmark-title">${I18n.getMessage('title')}</label>
                        <input type="text" id="bookmark-title" required>
                    </div>
                    <div class="form-group">
                        <label for="bookmark-url">${I18n.getMessage('url')}</label>
                        <input type="url" id="bookmark-url" required>
                    </div>
                    <div class="form-actions">
                        <button id="bookmark-cancel" class="btn">${I18n.getMessage('cancel')}</button>
                        <button id="bookmark-confirm" class="btn btn-primary">${I18n.getMessage('confirm')}</button>
                    </div>
                </div>
            `;
            
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
        }
        
        // 使用 utils.js 中的 showModal 函数显示模态框
        Utils.Modal.show('bookmark-modal');
        
        // 绑定确认按钮事件
        const confirmBtn = document.getElementById('bookmark-confirm');
        if (confirmBtn) {
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            newConfirmBtn.addEventListener('click', this.addNewBookmark.bind(this));
        }
        
        // 绑定取消按钮事件
        const cancelBtn = document.getElementById('bookmark-cancel');
        if (cancelBtn) {
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            newCancelBtn.addEventListener('click', () => {
                Utils.Modal.hide('bookmark-modal');
            });
        }
    },

    /**
     * 添加新书签
     */
    addNewBookmark: async function() {
        const titleInput = document.getElementById('bookmark-title');
        const urlInput = document.getElementById('bookmark-url');
        
        if (!titleInput || !urlInput) return;
        
        const title = titleInput.value.trim();
        let url = urlInput.value.trim();
        
        // 验证输入
        if (!title || !url) {
            Utils.UI.showErrorMessage('标题和URL不能为空');
            return;
        }
        
        // 确保URL格式正确
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        
        try {
            // 验证URL是否有效
            new URL(url);
            
            // 添加到书签列表
            bookmarks.push({
                title,
                url,
                addedTime: new Date().getTime()
            });
            
            // 保存并更新显示
            await this.saveBookmarks();
            this.renderBookmarks();
            
            // 关闭模态框并清空输入
            Utils.Modal.hide('bookmark-modal');
            titleInput.value = '';
            urlInput.value = '';
            
            Utils.UI.showNotification('成功', '书签已添加', 2000);
            
        } catch (error) {
            Utils.UI.showErrorMessage('URL格式无效');
        }
    },

    /**
     * 保存书签数据到存储
     * @returns {Promise<void>}
     */
    saveBookmarks: async function() {
        try {
            await chrome.storage.sync.set({ bookmarks });
        } catch (error) {
            Utils.UI.showErrorModal('保存书签失败:', error);
        }
    },

    /**
     * 处理右键菜单事件
     * @param {Event} event - 事件对象
     */
    handleContextMenu: function(event) {
        if (!event.target.matches('input, textarea, [contenteditable="true"]')) {
            // 自定义右键菜单处理
            if (event.target.closest('.shortcut-button') || event.target.closest('.bookmark')) {
                // 已有处理逻辑
            } else {
                // 可根据需要阻止默认菜单
            }
        }

        // 创建或显示上下文菜单
        let contextMenu = document.getElementById('shortcut-context-menu');
        if (!contextMenu) {
            // 创建菜单
            // ... 原有代码 ...
        }
        
        // 设置菜单位置使用CSS类
        contextMenu.classList.add('context-menu-positioned');
        contextMenu.style.left = `${event.pageX}px`;
        contextMenu.style.top = `${event.pageY}px`;
        contextMenu.classList.add('visible');
        
        // ... 原有代码 ...
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
        if (!Array.isArray(importedBookmarks)) return;
        
        importedBookmarks.forEach(bookmark => {
            if (!bookmarks.some(b => b.url === bookmark.url)) {
                bookmarks.push(bookmark);
            }
        });
        
        await this.saveBookmarks();
        this.renderBookmarks();
    },

    /**
     * 导出书签
     * @returns {Object} - 包含书签数组的对象
     */
    exportBookmarks: function() {
        return { bookmarks };
    }
};

