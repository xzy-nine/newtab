/**
 * 书签管理模块
 */

import { getDomain } from './utils.js';
import { getI18nMessage } from './i18n.js';

// 书签数据
let bookmarks = [];

/**
 * 初始化书签功能
 * @returns {Promise<void>}
 */
export async function initBookmarks() {
    // 从存储中加载书签
    await loadBookmarks();
    
    // 渲染书签列表
    renderBookmarks();
    
    // 初始化书签相关事件
    initBookmarkEvents();
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
 * 渲染书签列表
 */
export function renderBookmarks() {
    const bookmarkContainer = document.getElementById('bookmark-container');
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
        const domain = getDomain(bookmark.url);
        iconImg.src = `${domain}/favicon.ico`;
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
 * 初始化书签相关事件
 */
function initBookmarkEvents() {
    // 添加书签相关事件
    window.addEventListener('click', (e) => {
        // 关闭上下文菜单
        const contextMenu = document.getElementById('bookmark-context-menu');
        if (contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });
}

/**
 * 显示书签编辑/添加模态框
 * @param {number} [index] - 如果是编辑书签，传入书签索引
 */
export function showBookmarkModal(index = -1) {
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
    
    const container = document.getElementById('bookmark-container');
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