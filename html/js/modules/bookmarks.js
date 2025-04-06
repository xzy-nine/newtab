/**
 * 书签管理模块
 * 负责处理Chrome书签和自定义书签的显示和交互
 */

import { getDomain } from './utils.js';
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
        // 从存储中加载自定义书签
        await loadBookmarks();
        
        // 获取Chrome浏览器书签
        await getChromeBookmarks();
        
        // 渲染书签列表
        renderBookmarks();
        
        // 初始化书签相关事件
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
        if (folderList) {
            // 清空现有内容
            folderList.innerHTML = '';
            // 只处理根节点的直接子文件夹
            if (root.children) {
                for (let child of root.children) {
                    createFolderButtonsRecursive(child, folderList, 0);
                }
            }
        }
        
        // 从存储中获取上次选中的文件夹
        const data = await chrome.storage.local.get("folder");
        let folder = data.folder || root.id;
        currentFolder = folder;
        
        // 通过ID查找选中的文件夹
        const selectedFolder = findFolderById(root, folder);
        if (selectedFolder) {
            showShortcuts(selectedFolder);
        }
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
    if (node.id === id) {
        return node;
    }
    
    if (node.children) {
        for (let child of node.children) {
            const found = findFolderById(child, id);
            if (found) {
                return found;
            }
        }
    }
    
    return null;
}

/**
 * 递归创建文件夹按钮
 * @param {Object} folder - 文件夹数据
 * @param {HTMLElement} parentElement - 父元素
 * @param {number} level - 缩进级别
 */
function createFolderButtonsRecursive(folder, parentElement, level) {
    // 跳过没有children属性的项目或空文件夹
    if (!folder.children) return;
    
    // 创建文件夹按钮
    let folderButton = document.createElement("div");
    folderButton.className = "folder-button";
    
    // 添加层级标识和展开/折叠指示器
    folderButton.innerHTML = `
        <div class="folder-content" style="margin-left: ${level * 20}px">
            <span class="folder-arrow">▶</span>
            <span class="folder-icon">📁</span>
            <span class="folder-name">${folder.title}</span>
        </div>
    `;
    
    // 存储文件夹数据到按钮元素
    folderButton.folderData = folder;
    
    // 添加按钮到父元素
    parentElement.appendChild(folderButton);

    // 创建子文件夹容器
    let subFolderContainer = document.createElement("div");
    subFolderContainer.className = "folder-children";
    subFolderContainer.style.display = 'none';
    parentElement.appendChild(subFolderContainer);
    
    // 检查是否有子文件夹
    const subFolders = folder.children.filter(child => child.children);
    
    // 如果有子文件夹，递归创建
    if (subFolders.length > 0) {
        // 递归为每个子文件夹创建按钮
        for (let subFolder of subFolders) {
            createFolderButtonsRecursive(subFolder, subFolderContainer, level + 1);
        }
    }
    
    // 添加点击事件监听
    folderButton.addEventListener('click', (event) => {
        event.stopPropagation();
        handleFolderClick(folderButton, folder);
    });
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
        if (folder.children) {
            // 创建文件夹按钮元素
            let folderButton = document.createElement("div");
            folderButton.className = "folder-button";
            
            // 添加层级标识和展开/折叠指示器
            folderButton.innerHTML = `
                <div class="folder-content" style="margin-left: ${level * 20}px">
                    <span class="folder-arrow">▶</span>
                    <span class="folder-icon">📁</span>
                    <span class="folder-name">${folder.title}</span>
                </div>
            `;
            
            // 存储文件夹数据到按钮元素上
            folderButton.folderData = folder;
            
            // 添加按钮到父元素
            parentElement.appendChild(folderButton);

            // 创建子文件夹容器
            let subFolderContainer = document.createElement("div");
            subFolderContainer.className = "folder-children";
            subFolderContainer.style.display = 'none';
            parentElement.appendChild(subFolderContainer);

            // 创建该文件夹下的子文件夹，并将它们添加到当前文件夹的子容器中
            const subFolders = folder.children.filter(child => child.children && child.children.length > 0);
            if (subFolders.length > 0) {
                createFolderButtons(subFolders, subFolderContainer, level + 1);
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
    // 切换文件夹展开/收起状态
    folderButton.classList.toggle('open');
    
    // 更新箭头方向
    const arrowElement = folderButton.querySelector('.folder-arrow');
    if (arrowElement) {
        if (folderButton.classList.contains('open')) {
            arrowElement.textContent = '▼';
        } else {
            arrowElement.textContent = '▶';
        }
    }
    
    // 获取对应的子文件夹容器并切换其显示状态
    const children = folderButton.nextElementSibling;
    if (children && children.classList.contains('folder-children')) {
        children.style.display = children.style.display === 'block' ? 'none' : 'block';
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
 * 显示指定文件夹的快捷方式
 * @param {Object} folder - 文件夹数据
 */
function showShortcuts(folder) {
    const shortcutList = document.getElementById("shortcut-list");
    if (!shortcutList) return;
    
    shortcutList.innerHTML = "";

    if (!folder || !folder.children || folder.children.length === 0) {
        shortcutList.style.display = "none";
        return;
    }

    let shortcuts = folder.children.filter(node => !node.children);

    if (shortcuts.length === 0) {
        shortcutList.style.display = "none";
        return;
    }

    shortcutList.style.display = "flex";
    
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
    // 保存被右键点击的按钮元素引用
    const shortcutButton = event.currentTarget;
    
    // 创建上下文菜单
    let contextMenu = document.getElementById('shortcut-context-menu');
    if (!contextMenu) {
        contextMenu = document.createElement('div');
        contextMenu.id = 'shortcut-context-menu';
        contextMenu.className = 'context-menu';
        document.body.appendChild(contextMenu);
    }
    
    // 设置菜单内容
    contextMenu.innerHTML = `
        <div class="context-menu-item" id="custom-icon">${getI18nMessage('customIcon') || '自定义图标'}</div>
        <div class="context-menu-item" id="reset-icon">${getI18nMessage('resetIcon') || '重置图标'}</div>
    `;
    
    // 设置菜单位置
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.style.display = 'block';
    
    // 阻止事件冒泡
    event.stopPropagation();
    
    // 添加点击事件
    document.getElementById('custom-icon').addEventListener('click', () => {
        let fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async function(e) {
            let file = e.target.files[0];
            if (file) {
                try {
                    let reader = new FileReader();
                    reader.onload = async function(e) {
                        let base64Image = e.target.result;
                        // 使用 iconManager 模块进行设置
                        await setCustomIcon(shortcut.url, base64Image);
                        // 修复：传递正确保存的按钮元素
                        getIconForShortcut(shortcut.url, shortcutButton);
                        contextMenu.style.display = 'none';
                    };
                    reader.readAsDataURL(file);
                } catch (error) {
                    console.error('设置图标失败:', error);
                    alert(getI18nMessage('setIconFailed') || '设置图标失败');
                }
            }
        };
        fileInput.click();
    });
    
    document.getElementById('reset-icon').addEventListener('click', async () => {
        try {
            // 使用 iconManager 模块进行重置
            await resetIcon(shortcut.url);
            // 修复：传递正确保存的按钮元素
            getIconForShortcut(shortcut.url, shortcutButton);
            contextMenu.style.display = 'none';
        } catch (error) {
            console.error('重置图标失败:', error);
            alert(getI18nMessage('deleteIconFailed') || '删除图标失败');
        }
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
    // 确保所有子文件夹在初始状态下都是隐藏的
    document.querySelectorAll('.folder-children').forEach(container => {
        container.style.display = 'none';
    });

    // 移除原来的事件监听器后再添加新的
    document.querySelectorAll('.folder-button').forEach(button => {
        // 克隆按钮以移除所有事件监听器
        const newButton = button.cloneNode(true);
        newButton.folderData = button.folderData; // 保留文件夹数据
        button.parentNode.replaceChild(newButton, button);
        
        // 为新按钮添加点击事件
        newButton.addEventListener('click', (event) => {
            event.stopPropagation(); // 防止事件冒泡
            if (newButton.folderData) {
                handleFolderClick(newButton, newButton.folderData);
            }
        });
    });
    
    // 同步按钮状态和箭头方向
    document.querySelectorAll('.folder-button').forEach(button => {
        const arrowElement = button.querySelector('.folder-arrow');
        const children = button.nextElementSibling;
        
        if (arrowElement && children && children.classList.contains('folder-children')) {
            if (button.classList.contains('open')) {
                arrowElement.textContent = '▼';
                children.style.display = 'block';
            } else {
                arrowElement.textContent = '▶';
                children.style.display = 'none';
            }
        }
    });
    
    // 添加其他书签相关事件
    window.addEventListener('click', (e) => {
        // 关闭上下文菜单
        const contextMenu = document.getElementById('bookmark-context-menu');
        if (contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
        
        const shortcutContextMenu = document.getElementById('shortcut-context-menu');
        if (shortcutContextMenu && !shortcutContextMenu.contains(e.target)) {
            shortcutContextMenu.style.display = 'none';
        }
    });
}

/**
 * 创建单个书签元素
 * @param {Object} bookmark - 书签数据
 * @param {number} index - 书签索引
 * @returns {HTMLElement} - 书签DOM元素
 */
function createBookmarkElement(bookmark, index) {
    const bookmarkElement = document.createElement('div');
    bookmarkElement.classList.add('bookmark');
    bookmarkElement.dataset.index = index;
    
    // 书签图标
    const icon = document.createElement('div');
    icon.classList.add('bookmark-icon');
    
    const iconImg = document.createElement('img');
    iconImg.onerror = function() {
        // 如果图标加载失败，使用默认图标
        this.src = 'images/default_favicon.png';
    };
    
    // 设置图标来源
    if (bookmark.customIcon) {
        iconImg.src = bookmark.customIcon;
    } else {
        iconImg.src = `${getDomain(bookmark.url)}/favicon.ico`;
    }
    
    icon.appendChild(iconImg);
    
    // 书签标题
    const title = document.createElement('div');
    title.classList.add('bookmark-title');
    title.textContent = bookmark.title;
    
    // 添加各元素
    bookmarkElement.appendChild(icon);
    bookmarkElement.appendChild(title);
    
    // 添加点击事件
    bookmarkElement.addEventListener('click', (e) => {
        if (!e.target.closest('.bookmark-menu')) {
            window.open(bookmark.url, '_blank');
        }
    });
    
    // 添加右键菜单
    bookmarkElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, index);
    });
    
    return bookmarkElement;
}

/**
 * 显示添加书签的模态框
 */
function showBookmarkModal() {
    // 获取模态框元素
    const modal = document.getElementById('bookmark-modal');
    if (!modal) return;
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 设置取消按钮的点击事件
    const cancelBtn = document.getElementById('bookmark-cancel');
    if (cancelBtn) {
        // 移除旧的事件监听器
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        newCancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    // 点击模态框外关闭
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
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
            [bookmarks[index], bookmarks[index + 1]] = [bookmarks[index + 1], bookmarks[index]];
            
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