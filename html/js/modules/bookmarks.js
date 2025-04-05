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
        const folders = getAllFolders(root);
        
        // 创建文件夹按钮
        const folderList = document.getElementById('folder-list');
        if (folderList) {
            createFolderButtons(folders, folderList);
        }
        
        // 从存储中获取上次选中的文件夹
        const data = await chrome.storage.local.get("folder");
        let folder = data.folder || root.id;
        currentFolder = folder;
        
        // 显示默认文件夹的快捷方式
        const selectedFolder = folders.find(f => f.id === folder);
        if (selectedFolder) {
            showShortcuts(selectedFolder);
        }
    } catch (error) {
        console.error('Failed to get Chrome bookmarks:', error);
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
        if (folder.children) {
            let folderButton = document.createElement("div");
            folderButton.className = "folder-button";
            folderButton.innerHTML = `<span class="folder-icon">📁</span><span class="folder-name">${folder.title}</span>`;
            folderButton.style.marginLeft = `${level * 20}px`;
            // 存储文件夹数据到按钮元素上
            folderButton.folderData = folder;
            folderButton.onclick = function() {
                handleFolderClick(folderButton, folder);
            };
            parentElement.appendChild(folderButton);

            let subFolderContainer = document.createElement("div");
            subFolderContainer.className = "folder-children";
            subFolderContainer.style.display = 'none';
            parentElement.appendChild(subFolderContainer);

            // 创建子文件夹
            createFolderButtons(folder.children.filter(child => child.children), subFolderContainer, level + 1);
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
                let reader = new FileReader();
                reader.onload = async function(e) {
                    let base64Image = e.target.result;
                    // 使用 iconManager 模块进行设置
                    await setCustomIcon(shortcut.url, base64Image);
                    // 修复这里，确保正确传递按钮元素
                    getIconForShortcut(shortcut.url, event.currentTarget);
                    contextMenu.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        };
        fileInput.click();
    });
    
    document.getElementById('reset-icon').addEventListener('click', async () => {
        // 使用 iconManager 模块进行重置
        await resetIcon(shortcut.url);
        // 修复这里，确保正确传递按钮元素
        getIconForShortcut(shortcut.url, event.currentTarget);
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
    
    // 添加"添加书签"按钮
    const addBookmark = document.createElement('div');
    addBookmark.classList.add('bookmark', 'add-bookmark');
    
    const addIcon = document.createElement('div');
    addIcon.classList.add('add-icon');
    addIcon.innerHTML = '<i class="fas fa-plus"></i>';
    
    const addText = document.createElement('div');
    addText.classList.add('bookmark-title');
    addText.textContent = getI18nMessage('addBookmark');
    
    addBookmark.appendChild(addIcon);
    addBookmark.appendChild(addText);
    
    addBookmark.addEventListener('click', () => showBookmarkModal());
    
    bookmarkContainer.appendChild(addBookmark);
}

/**
 * 初始化书签相关事件
 */
function initBookmarkEvents() {
    // 确保所有子文件夹在初始状态下都是隐藏的
    document.querySelectorAll('.folder-children').forEach(container => {
        container.style.display = 'none';
    });

    // 添加文件夹按钮点击事件
    document.querySelectorAll('.folder-button').forEach(button => {
        if (!button.hasEventListener) {
            button.hasEventListener = true;
            button.addEventListener('click', () => {
                const folderData = button.folderData;
                if (folderData) {
                    handleFolderClick(button, folderData);
                }
            });
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
    
    // 使书签可拖动
    bookmarkElement.setAttribute('draggable', 'true');
    bookmarkElement.addEventListener('dragstart', handleDragStart);
    bookmarkElement.addEventListener('dragover', handleDragOver);
    bookmarkElement.addEventListener('drop', handleDrop);
    
    return bookmarkElement;
}

/**
 * 显示书签编辑/添加模态框
 * @param {number} [index] - 如果是编辑书签，传入书签索引
 */
function showBookmarkModal(index = -1) {
    const modal = document.getElementById('bookmark-modal');
    const titleField = document.getElementById('bookmark-title');
    const urlField = document.getElementById('bookmark-url');
    const iconField = document.getElementById('bookmark-icon');
    const modalTitle = document.getElementById('bookmark-modal-title');
    
    if (!modal || !titleField || !urlField) return;
    
    // 设置模态框标题
    if (modalTitle) {
        modalTitle.textContent = index >= 0 ? 
            getI18nMessage('editBookmark') : 
            getI18nMessage('addBookmark');
    }
    
    // 如果是编辑，填入已有数据
    if (index >= 0 && index < bookmarks.length) {
        const bookmark = bookmarks[index];
        titleField.value = bookmark.title || '';
        urlField.value = bookmark.url || '';
        iconField.value = bookmark.customIcon || '';
    } else {
        // 新增书签，清空字段
        titleField.value = '';
        urlField.value = '';
        iconField.value = '';
    }
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 设置确认按钮的点击事件
    const confirmBtn = document.getElementById('bookmark-confirm');
    if (confirmBtn) {
        // 移除旧的事件监听器
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', async () => {
            // 获取输入的数据
            const title = titleField.value.trim();
            const url = urlField.value.trim();
            const customIcon = iconField.value.trim();
            
            if (!title || !url) {
                alert(getI18nMessage('pleaseCompleteAllFields'));
                return;
            }
            
            // 确保URL格式正确
            let formattedUrl = url;
            if (!/^https?:\/\//i.test(url)) {
                formattedUrl = 'http://' + url;
            }
            
            // 创建或更新书签
            const bookmark = {
                title,
                url: formattedUrl,
                customIcon: customIcon || null
            };
            
            if (index >= 0) {
                // 更新现有书签
                bookmarks[index] = bookmark;
            } else {
                // 添加新书签
                bookmarks.push(bookmark);
            }
            
            // 保存书签数据
            await saveBookmarks();
            
            // 重新渲染书签
            renderBookmarks();
            
            // 关闭模态框
            modal.style.display = 'none';
        });
    }
    
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

// 将 showBookmarkModal 导出，这是缺少的部分
export { showBookmarkModal };

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
    
    // 移除旧的事件监听器
    const editBtn = document.getElementById('bookmark-edit');
    const deleteBtn = document.getElementById('bookmark-delete');
    
    if (editBtn) {
        const newEditBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newEditBtn, editBtn);
        
        newEditBtn.addEventListener('click', () => {
            contextMenu.style.display = 'none';
            showBookmarkModal(index);
        });
    }
    
    if (deleteBtn) {
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        
        newDeleteBtn.addEventListener('click', async () => {
            const confirmed = confirm(getI18nMessage('confirmDeleteBookmark'));
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
    }
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
 * 处理拖动开始事件
 * @param {DragEvent} e - 拖动事件
 */
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.index);
    e.target.classList.add('dragging');
}

/**
 * 处理拖动经过事件
 * @param {DragEvent} e - 拖动事件
 */
function handleDragOver(e) {
    e.preventDefault();
    const draggable = document.querySelector('.dragging');
    if (!draggable) return;
    
    const container = document.getElementById('custom-bookmark-container');
    if (!container) return;
    
    const afterElement = getDragAfterElement(container, e.clientX);
    
    if (afterElement == null) {
        container.appendChild(draggable);
    } else {
        container.insertBefore(draggable, afterElement);
    }
}

/**
 * 处理放置事件
 * @param {DragEvent} e - 拖动事件
 */
async function handleDrop(e) {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const targetIndex = parseInt(e.target.closest('.bookmark').dataset.index);
    
    if (isNaN(draggedIndex) || isNaN(targetIndex) || draggedIndex === targetIndex) {
        document.querySelector('.dragging')?.classList.remove('dragging');
        return;
    }
    
    // 更新书签顺序
    const draggedBookmark = bookmarks[draggedIndex];
    bookmarks.splice(draggedIndex, 1);
    bookmarks.splice(targetIndex, 0, draggedBookmark);
    
    // 保存更改
    await saveBookmarks();
    
    // 重新渲染书签
    renderBookmarks();
}

/**
 * 获取拖动后的元素
 * @param {HTMLElement} container - 容器元素
 * @param {number} x - 鼠标X坐标
 * @returns {HTMLElement|null} - 目标元素
 */
function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.bookmark:not(.dragging):not(.add-bookmark)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
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