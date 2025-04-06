/**
 * 书签管理模块
 * 负责处理Chrome书签和自定义书签的显示和交互
 */

import { getDomain, showModal } from './utils.js';
import { getI18nMessage } from './i18n.js';
import { 
    preloadIcons, 
    getIconForShortcut, 
    setCustomIcon, 
    resetIcon
} from './iconManager.js';

// 书签数据
let bookmarks = [];
let currentFolder = "";

/**
 * 初始化书签功能
 * @returns {Promise<void>}
 */
export async function initBookmarks() {
    try {
        // 并行加载数据提高效率
        const [_, chromeBookmarks] = await Promise.all([
            loadBookmarks(),
            getChromeBookmarks()
        ]);
        
        renderBookmarks();
        initBookmarkEvents();
        console.log('Bookmarks initialized successfully');
    } catch (error) {
        console.error('Failed to initialize bookmarks:', error);
        throw error;
    }
}

/**
 * 从存储中加载书签数据
 * @returns {Promise<void>}
 */
async function loadBookmarks() {
    try {
        const result = await chrome.storage.sync.get('bookmarks');
        bookmarks = result.bookmarks || [];
    } catch (error) {
        console.error('Failed to load bookmarks:', error);
        bookmarks = [];
    }
}

/**
 * 获取Chrome浏览器书签
 * @returns {Promise<void>}
 */
async function getChromeBookmarks() {
    try {
        const tree = await chrome.bookmarks.getTree();
        const root = tree[0];
        
        // 创建文件夹按钮
        const folderList = document.getElementById('folder-list');
        if (!folderList) {
            console.error('找不到文件夹列表容器');
            return;
        }
        
        // 清空现有内容
        folderList.innerHTML = '';
        
        // 确保DOM更新
        setTimeout(() => {
            // 只处理根节点的直接子文件夹
            if (root.children) {
                for (let child of root.children) {
                    createFolderButtonsRecursive(child, folderList, 0);
                }
            }
            
            // 从存储中获取上次选中的文件夹并应用
            chrome.storage.local.get("folder").then(data => {
                let folder = data.folder || root.id;
                currentFolder = folder;
                
                // 通过ID查找选中的文件夹
                const selectedFolder = findFolderById(root, folder);
                if (selectedFolder) {
                    showShortcuts(selectedFolder);
                    
                    // 找到并突出显示选中的文件夹
                    const selectedButton = document.getElementById(`folder-${folder}`);
                    if (selectedButton) {
                        // 先移除所有选中状态
                        document.querySelectorAll('.folder-button.selected').forEach(btn => {
                            btn.classList.remove('selected');
                        });
                        // 添加选中状态
                        selectedButton.classList.add('selected');
                    }
                }
            }).catch(err => console.error('获取存储的文件夹失败:', err));
            
            // 初始化事件处理
            initBookmarkEvents();
        }, 0);
    } catch (error) {
        console.error('Failed to get Chrome bookmarks:', error);
    }
}

/**
 * 递归查找指定ID的文件夹
 * @param {Object} node - 当前节点
 * @param {string} id - 要查找的ID
 * @returns {Object|null} - 找到的文件夹或null
 */
function findFolderById(node, id) {
    if (node.id === id) return node;
    if (!node.children) return null;
    
    for (let child of node.children) {
        const found = findFolderById(child, id);
        if (found) return found;
    }
    return null;
}

/**
 * 判断文件夹是否为空（不包含书签或只包含空子文件夹）
 * @param {Object} folder - 文件夹对象
 * @returns {boolean} - 如果为空返回true
 */
function isFolderEmpty(folder) {
    if (!folder.children || folder.children.length === 0) return true;
    if (folder.children.some(item => item.url)) return false;
    return folder.children.every(child => !child.children || isFolderEmpty(child));
}

/**
 * 递归创建文件夹按钮
 * @param {Object} folder - 文件夹数据
 * @param {HTMLElement} parentElement - 父元素
 * @param {number} level - 缩进级别
 */
function createFolderButtonsRecursive(folder, parentElement, level) {
    try {
        // 跳过没有children属性的项目（书签）
        if (!folder.children) return;
        
        // 检查文件夹是否为空
        const isEmpty = isFolderEmpty(folder);
        
        // 跳过空文件夹
        if (isEmpty) return;
        
        // 创建文件夹按钮
        let folderButton = document.createElement("div");
        folderButton.className = "folder-button";
        folderButton.id = `folder-${folder.id}`; // 添加唯一ID便于调试
        
        // 确保文件夹标题可见
        if (!folder.title) {
            folderButton.dataset.folderName = "(无标题文件夹)";
        }
        
        // 获取所有非空子文件夹
        const nonEmptySubFolders = folder.children.filter(child => 
            child.children && !isFolderEmpty(child)
        );
        const hasNonEmptySubFolders = nonEmptySubFolders.length > 0;
        
        // 添加层级标识和展开/折叠指示器，只有有非空子文件夹时才显示箭头
        const folderContent = document.createElement("div");
        folderContent.className = `folder-content folder-indent-${level}`;
        
        folderContent.innerHTML = `
            <span class="folder-arrow">${hasNonEmptySubFolders ? '▶' : ''}</span>
            <span class="folder-icon">📁</span>
            <span class="folder-name">${folder.title || "(无标题文件夹)"}</span>
        `;
        
        folderButton.appendChild(folderContent);
        
        // 存储文件夹数据到按钮元素
        folderButton.folderData = folder;
        
        // 添加按钮到父元素
        parentElement.appendChild(folderButton);

        // 只有存在非空子文件夹时才创建子容器
        if (hasNonEmptySubFolders) {
            // 创建子文件夹容器
            let subFolderContainer = document.createElement("div");
            subFolderContainer.className = "folder-children folder-children-initial";
            subFolderContainer.id = `children-${folder.id}`; // 添加唯一ID便于调试
            
            // 添加到DOM
            parentElement.appendChild(subFolderContainer);
            
            // 递归处理子文件夹
            for (let childFolder of folder.children) {
                if (childFolder.children) {
                    createFolderButtonsRecursive(childFolder, subFolderContainer, level + 1);
                }
            }
        }
        
        // 添加点击事件监听
        folderButton.addEventListener('click', (event) => {
            event.stopPropagation();
            handleFolderClick(folderButton, folder);
        });
    } catch (error) {
        console.error(`创建文件夹时出错:`, error);
    }
}

/**
 * 获取一个节点下的所有文件夹节点
 * @param {Object} node - 书签节点
 * @returns {Array} - 文件夹节点数组
 */
function getAllFolders(node) {
    let folders = [];
    if (node.children) {
        for (let child of node.children) {
            if (child.children && child.children.length > 0) {
                folders.push(child);
                folders = [...folders, ...getAllFolders(child)];
            }
        }
    }
    return folders;
}

/**
 * 创建文件夹按钮
 * @param {Array} folders - 文件夹数组
 * @param {HTMLElement} parentElement - 父元素
 * @param {number} level - 嵌套层级
 */
function createFolderButtons(folders, parentElement, level = 0) {
    for (let folder of folders) {
        // 跳过空文件夹
        if (isFolderEmpty(folder)) continue;
        
        if (folder.children) {
            // 检查是否有非空子文件夹
            const nonEmptySubFolders = folder.children.filter(child => 
                child.children && !isFolderEmpty(child)
            );
            const hasNonEmptySubFolders = nonEmptySubFolders.length > 0;
            
            // 创建文件夹按钮元素
            let folderButton = document.createElement("div");
            folderButton.className = "folder-button";
            
            // 添加层级标识和展开/折叠指示器，只有有非空子文件夹时才显示箭头
            const folderContent = document.createElement("div");
            folderContent.className = `folder-content folder-indent-${level}`;
            
            folderContent.innerHTML = `
                <span class="folder-arrow">${hasNonEmptySubFolders ? '▶' : ''}</span>
                <span class="folder-icon">📁</span>
                <span class="folder-name">${folder.title}</span>
            `;
            
            folderButton.appendChild(folderContent);
            
            // 存储文件夹数据到按钮元素上
            folderButton.folderData = folder;
            
            // 添加按钮到父元素
            parentElement.appendChild(folderButton);

            // 只有存在非空子文件夹时才创建子容器
            if (hasNonEmptySubFolders) {
                // 创建子文件夹容器
                let subFolderContainer = document.createElement("div");
                subFolderContainer.className = "folder-children folder-children-closed";
                parentElement.appendChild(subFolderContainer);

                // 创建该文件夹下的非空子文件夹，并将它们添加到当前文件夹的子容器中
                createFolderButtons(nonEmptySubFolders, subFolderContainer, level + 1);
            }
        }
    }
}

/**
 * 处理文件夹点击事件
 * @param {HTMLElement} folderButton - 文件夹按钮元素
 * @param {Object} folder - 文件夹数据
 */
function handleFolderClick(folderButton, folder) {
    // 首先移除所有文件夹的选中状态
    document.querySelectorAll('.folder-button.selected').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // 为当前点击的文件夹添加选中状态
    folderButton.classList.add('selected');
    
    // 检查是否有子文件夹容器
    const children = folderButton.nextElementSibling;
    
    // 如果当前文件夹已经是打开状态，则只需关闭当前文件夹
    if (folderButton.classList.contains('open')) {
        // 关闭当前文件夹
        closeFolder(folderButton, children);
    } else {
        // 在同一层级关闭其他已打开的文件夹
        const parent = folderButton.parentElement;
        const siblings = parent.querySelectorAll(':scope > .folder-button.open');
        
        siblings.forEach(openButton => {
            if (openButton !== folderButton) {
                const openChildren = openButton.nextElementSibling;
                if (openChildren && openChildren.classList.contains('folder-children')) {
                    closeFolder(openButton, openChildren);
                }
            }
        });
        
        // 打开当前文件夹时，确保子文件夹可见
        if (children && children.classList.contains('folder-children')) {
            // 切换文件夹展开状态
            folderButton.classList.add('open');
            
            // 更新箭头方向
            const arrowElement = folderButton.querySelector('.folder-arrow');
            if (arrowElement) {
                arrowElement.textContent = '▼';
                
                // 使用CSS类而非内联样式控制显示状态
                children.classList.remove('folder-children-closed');
                children.classList.remove('folder-children-initial');
                children.classList.add('folder-children-open');
                
                // 确保视图滚动以显示新展开的内容
                setTimeout(() => {
                    ensureChildrenVisibility(folderButton);
                }, 300);
            }
        }
    }
    
    // 显示该文件夹的快捷方式
    if (folder) {
        showShortcuts(folder);
        currentFolder = folder.id;
        
        // 保存当前选中的文件夹
        chrome.storage.local.set({ folder: folder.id });
    }
}

/**
 * 检查元素是否在视口内
 * @param {HTMLElement} el - 要检查的元素
 * @returns {boolean} - 如果元素在视口内则返回true
 */
function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

/**
 * 关闭文件夹
 * @param {HTMLElement} button - 文件夹按钮元素
 * @param {HTMLElement} children - 子元素容器
 */
function closeFolder(button, children) {
    if (!children) return;
    
    // 更新按钮状态
    button.classList.remove('open');
    
    // 更新箭头方向
    const arrowElement = button.querySelector('.folder-arrow');
    if (arrowElement) {
        arrowElement.textContent = '▶';
    }
    
    // 应用关闭样式
    children.classList.remove('folder-children-open');
    children.classList.add('folder-children-closed');
    
    // 递归关闭所有子文件夹
    const nestedOpenFolders = children.querySelectorAll('.folder-button.open');
    nestedOpenFolders.forEach(nestedButton => {
        const nestedChildren = nestedButton.nextElementSibling;
        if (nestedChildren && nestedChildren.classList.contains('folder-children')) {
            closeFolder(nestedButton, nestedChildren);
        }
    });
}

/**
 * 显示指定文件夹的快捷方式
 * @param {Object} folder - 文件夹数据
 */
function showShortcuts(folder) {
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
    
    // 预加载所有快捷方式的URL
    const urls = shortcuts.map(shortcut => shortcut.url).filter(Boolean);
    preloadIcons(urls);

    // 创建快捷方式按钮
    for (let shortcut of shortcuts) {
        if (!shortcut.url) continue;
        
        let shortcutButton = document.createElement("button");
        shortcutButton.className = "shortcut-button";
        shortcutButton.title = shortcut.title;

        // 获取图标
        getIconForShortcut(shortcut.url, shortcutButton);

        // 添加文本标签
        let titleSpan = document.createElement("span");
        titleSpan.className = "shortcut-title";
        titleSpan.textContent = shortcut.title;
        shortcutButton.appendChild(titleSpan);

        // 点击事件 - 打开链接
        shortcutButton.addEventListener('click', function() {
            window.open(shortcut.url, "_blank");
        });

        // 右键菜单 - 自定义图标
        shortcutButton.addEventListener('contextmenu', function(event) {
            event.preventDefault();
            showShortcutContextMenu(event, shortcut);
        });

        shortcutList.appendChild(shortcutButton);
    }
}

/**
 * 显示快捷方式上下文菜单
 * @param {Event} event - 事件对象
 * @param {Object} shortcut - 快捷方式数据
 */
function showShortcutContextMenu(event, shortcut) {
    const { currentTarget: shortcutButton, pageX, pageY } = event;
    
    // 创建上下文菜单
    let contextMenu = document.getElementById('shortcut-context-menu') || 
        createElement('div', 'context-menu', {id: 'shortcut-context-menu'});
    
    if (!document.body.contains(contextMenu)) {
        document.body.appendChild(contextMenu);
    }
    
    // 设置菜单内容和位置
    contextMenu.innerHTML = `
        <div class="context-menu-item" id="custom-icon">${getI18nMessage('customIcon') || '自定义图标'}</div>
        <div class="context-menu-item" id="reset-icon">${getI18nMessage('resetIcon') || '重置图标'}</div>
    `;
    
    // 使用CSS类控制位置，而不是内联样式
    contextMenu.style.left = `${pageX}px`;
    contextMenu.style.top = `${pageY}px`;
    contextMenu.style.display = 'block';
    
    // 事件处理...省略
}

/**
 * 渲染自定义书签列表
 */
function renderBookmarks() {
    const bookmarkContainer = document.getElementById('custom-bookmark-container');
    if (!bookmarkContainer) return;
    
    // 清空现有书签
    bookmarkContainer.innerHTML = '';
    
    // 添加书签元素
    bookmarks.forEach((bookmark, index) => {
        const bookmarkElement = createBookmarkElement(bookmark, index);
        bookmarkContainer.appendChild(bookmarkElement);
    });
}

/**
 * 初始化书签相关事件
 */
function initBookmarkEvents() {
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
                handleFolderClick(newButton, newButton.folderData);
            }
        });
    });
    
    // 其他事件处理...省略
}

/**
 * 创建单个书签元素
 * @param {Object} bookmark - 书签数据
 * @param {number} index - 书签索引
 * @returns {HTMLElement} - 书签DOM元素
 */
function createBookmarkElement(bookmark, index) {
    const bookmarkElement = createElement('div', 'bookmark', {'data-index': index});
    
    const icon = createElement('div', 'bookmark-icon');
    const iconImg = createElement('img');
    iconImg.src = bookmark.customIcon || `${getDomain(bookmark.url)}/favicon.ico`;
    iconImg.onerror = () => { iconImg.src = 'images/default_favicon.png'; };
    
    icon.appendChild(iconImg);
    bookmarkElement.appendChild(icon);
    bookmarkElement.appendChild(createElement('div', 'bookmark-title', {}, bookmark.title));
    
    // 添加事件处理
    bookmarkElement.addEventListener('click', e => {
        if (!e.target.closest('.bookmark-menu')) window.open(bookmark.url, '_blank');
    });
    
    bookmarkElement.addEventListener('contextmenu', e => {
        e.preventDefault();
        showContextMenu(e, index);
    });
    
    return bookmarkElement;
}

/**
 * 显示添加书签的模态框
 */
function showBookmarkModal() {
    // 使用utils.js中的函数显示模态框
    showModal('bookmark-modal');
}

/**
 * 显示书签上下文菜单
 * @param {Event} e - 事件对象
 * @param {number} index - 书签索引
 */
function showContextMenu(e, index) {
    const contextMenu = document.getElementById('bookmark-context-menu');
    if (!contextMenu) return;
    
    // 设置菜单位置
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.style.display = 'block';
    
    // 设置当前操作的书签索引
    contextMenu.dataset.index = index;
    
    // 阻止冒泡和默认行为
    e.preventDefault();
    e.stopPropagation();
    
    // 构建上下文菜单项
    contextMenu.innerHTML = `
        <div id="bookmark-delete" class="context-menu-item">${getI18nMessage('delete') || '删除'}</div>
        <div id="bookmark-move-up" class="context-menu-item ${index === 0 ? 'disabled' : ''}">${getI18nMessage('moveUp') || '上移'}</div>
        <div id="bookmark-move-down" class="context-menu-item ${index === bookmarks.length - 1 ? 'disabled' : ''}">${getI18nMessage('moveDown') || '下移'}</div>
    `;
    
    // 删除按钮事件
    document.getElementById('bookmark-delete').addEventListener('click', async () => {
        const confirmed = confirm(getI18nMessage('confirmDeleteBookmark') || '确定要删除此书签吗？');
        if (confirmed) {
            // 删除书签
            bookmarks.splice(index, 1);
            
            // 保存更改
            await saveBookmarks();
            
            // 重新渲染
            renderBookmarks();
        }
        contextMenu.style.display = 'none';
    });
    
    // 上移按钮事件
    document.getElementById('bookmark-move-up').addEventListener('click', async () => {
        if (index > 0) {
            // 交换位置
            [bookmarks[index - 1], bookmarks[index]] = [bookmarks[index], bookmarks[index - 1]];
            
            // 保存更改
            await saveBookmarks();
            
            // 重新渲染
            renderBookmarks();
        }
        contextMenu.style.display = 'none';
    });
    
    // 下移按钮事件
    document.getElementById('bookmark-move-down').addEventListener('click', async () => {
        if (index < bookmarks.length - 1) {
            // 交换位置
            [bookmarks[index + 1], bookmarks[index]] = [bookmarks[index + 1], bookmarks[index]];
            
            // 保存更改
            await saveBookmarks();
            
            // 重新渲染
            renderBookmarks();
        }
        contextMenu.style.display = 'none';
    });
    
    // 点击其他区域关闭菜单
    const closeMenuHandler = function(e) {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
            document.removeEventListener('click', closeMenuHandler);
        }
    };
    
    // 延迟添加事件监听，防止触发刚刚的右键点击
    setTimeout(() => {
        document.addEventListener('click', closeMenuHandler);
    }, 100);
}

/**
 * 保存书签数据到存储
 * @returns {Promise<void>}
 */
async function saveBookmarks() {
    try {
        await chrome.storage.sync.set({ bookmarks });
    } catch (error) {
        console.error('Failed to save bookmarks:', error);
    }
}

/**
 * 获取所有书签
 * @returns {Array} - 书签数组
 */
export function getAllBookmarks() {
    return [...bookmarks];
}

/**
 * 导入书签
 * @param {Array} importedBookmarks - 要导入的书签数据
 * @returns {Promise<void>}
 */
export async function importBookmarks(importedBookmarks) {
    if (!Array.isArray(importedBookmarks)) return;
    
    // 合并书签，避免重复
    importedBookmarks.forEach(bookmark => {
        if (!bookmarks.some(b => b.url === bookmark.url)) {
            bookmarks.push(bookmark);
        }
    });
    
    // 保存并重新渲染
    await saveBookmarks();
    renderBookmarks();
}

/**
 * 导出书签
 * @returns {Object} - 包含书签数据的对象
 */
export function exportBookmarks() {
    return { bookmarks };
}

/**
 * 设置书签相关事件
 */
export function setupBookmarkEvents() {
    // 初始化书签相关事件
    initBookmarkEvents();
    
    // 添加右键菜单处理
    document.addEventListener('contextmenu', handleContextMenu);
    
    // 添加书签按钮
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    if (addBookmarkBtn) {
        addBookmarkBtn.addEventListener('click', () => {
            showBookmarkModal();
        });
    }
}

/**
 * 处理右键菜单事件
 * @param {Event} e - 事件对象
 */
function handleContextMenu(e) {
    // 如果不是在特定的可编辑元素上，阻止默认行为
    if (!e.target.matches('input, textarea, [contenteditable="true"]')) {
        // 在此可以实现自定义右键菜单
        
        // 如果是在书签元素上，显示特定的右键菜单
        if (e.target.closest('.shortcut-button')) {
            // 处理短径菜单，此功能已在showShortcutContextMenu中实现
        } else if (e.target.closest('.bookmark')) {
            // 处理书签菜单，此功能已在showContextMenu中实现
        } else {
            // 暂时只阻止默认行为，避免显示浏览器默认菜单
            // e.preventDefault();
        }
    }
}

/**
 * 计算一个元素包括所有子元素的总高度
 * @param {HTMLElement} element - 要计算高度的元素
 * @returns {number} - 总高度
 */
function calculateTotalHeight(element) {
    // 直接使用scrollHeight，不再创建克隆
    return element.scrollHeight * 1.1; // 添加一些额外空间
}

/**
 * 确保文件夹子元素在视图中可见
 * @param {HTMLElement} folderButton - 文件夹按钮元素
 */
function ensureChildrenVisibility(folderButton) {
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
        const scrollAmount = childrenRect.bottom - containerRect.bottom + 20; // 添加一些边距
        folderList.scrollTop += scrollAmount;
    }
}

// 创建一个通用的DOM元素创建函数
function createElement(tag, className, attributes = {}, content = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    
    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });
    
    if (content) element.innerHTML = content;
    return element;
}

function openFolder(button, children) {
    button.classList.add('open');
    const arrow = button.querySelector('.folder-arrow');
    if (arrow) arrow.textContent = '▼';
    
    children.classList.remove('folder-children-closed');
    children.classList.add('folder-children-open');
}