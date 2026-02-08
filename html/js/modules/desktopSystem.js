/**
 * 桌面系统模块
 * 完全基于 Temp123 的展示小部件和快捷方式实现
 */

import { Utils, IconManager } from './core/index.js';

// 桌面项目类型
export const ItemType = {
    SHORTCUT: 'shortcut',
    WIDGET: 'widget'
};

// 小部件类型
export const WidgetType = {
    CLOCK: 'clock',
    WEATHER: 'weather',
    CALENDAR: 'calendar',
    NOTES: 'notes',
    PHOTO: 'photo'
};

// 基础项目接口
class BaseItem {
    constructor(id, type, x, y, w, h) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }
}

// 快捷方式类
export class ShortcutItem extends BaseItem {
    constructor(id, name, icon, color, url, x, y, w = 1, h = 1) {
        super(id, ItemType.SHORTCUT, x, y, w, h);
        this.name = name;
        this.icon = icon;
        this.color = color;
        this.url = url;
    }
}

// 小部件类
export class WidgetItem extends BaseItem {
    constructor(id, widgetType, title, data, x, y, w, h) {
        super(id, ItemType.WIDGET, x, y, w, h);
        this.widgetType = widgetType;
        this.title = title;
        this.data = data;
    }
}

// 网格配置类
export class GridConfig {
    constructor(cols, rows, gap, cellSize) {
        this.cols = cols;
        this.rows = rows;
        this.gap = gap;
        this.cellSize = cellSize;
    }
}



// 网格工具函数
const gridUtils = {
    // 检查两个项目是否冲突
    checkCollision(item1, item2) {
        return (
            item1.x < item2.x + item2.w &&
            item1.x + item1.w > item2.x &&
            item1.y < item2.y + item2.h &&
            item1.y + item1.h > item2.y
        );
    },

    // 检查项目是否在网格边界内
    isWithinBounds(item, gridConfig) {
        return (
            item.x >= 0 &&
            item.y >= 0 &&
            item.x + item.w <= gridConfig.cols &&
            item.y + item.h <= gridConfig.rows
        );
    }
};

/**
 * 桌面系统管理器
 */
export const DesktopSystem = {
    /**
     * 创建快捷方式按钮
     */
    createShortcutButton(item) {
        const shortcutButton = Utils.createElement("div", "shortcut-button", {
            'data-shortcut-id': item.id
        });

        shortcutButton.style.display = 'flex';
        shortcutButton.style.flexDirection = 'column';
        shortcutButton.style.alignItems = 'center';
        shortcutButton.style.justifyContent = 'center';
        shortcutButton.style.gap = '8px';
        shortcutButton.style.cursor = 'pointer';
        shortcutButton.style.transition = 'all 0.2s ease';
        shortcutButton.style.width = '100%';
        shortcutButton.style.height = '100%';

        // 创建图标容器
        const iconContainer = Utils.createElement("div", "shortcut-icon-container");
        iconContainer.style.width = '56px';
        iconContainer.style.height = '56px';
        iconContainer.style.borderRadius = '16px';
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';
        iconContainer.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        iconContainer.style.backgroundColor = item.color || '#3b82f6';
        iconContainer.style.transition = 'all 0.2s ease';

        // 创建图标元素（使用img标签而不是div，以便显示URL图标）
        const iconElement = Utils.createElement("img", "shortcut-icon");
        iconElement.style.width = '32px';
        iconElement.style.height = '32px';
        iconElement.style.borderRadius = '6px';
        
        // 使用IconManager为图标元素设置URL的图标
        if (item.url) {
            IconManager.setIconForElement(iconElement, item.url);
            iconElement.onerror = () => IconManager.handleIconError(iconElement, '../icons/icon128.png');
        } else {
            // 如果没有URL，使用默认图标
            iconElement.src = '../icons/icon128.png';
        }

        iconContainer.appendChild(iconElement);

        // 创建名称元素
        const nameElement = Utils.createElement("span", "shortcut-name", {}, item.name);
        nameElement.style.fontSize = '12px';
        nameElement.style.textAlign = 'center';
        nameElement.style.maxWidth = '80px';
        nameElement.style.whiteSpace = 'nowrap';
        nameElement.style.overflow = 'hidden';
        nameElement.style.textOverflow = 'ellipsis';
        nameElement.style.padding = '0 4px';

        shortcutButton.appendChild(iconContainer);
        shortcutButton.appendChild(nameElement);

        // 添加点击事件
        shortcutButton.addEventListener('click', () => {
            if (item.url) {
                chrome.tabs.create({ url: item.url });
            }
        });

        // 添加悬停效果
        shortcutButton.addEventListener('mouseenter', () => {
            shortcutButton.style.transform = 'scale(1.05)';
            iconContainer.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.15)';
        });

        shortcutButton.addEventListener('mouseleave', () => {
            shortcutButton.style.transform = 'scale(1)';
            iconContainer.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        });

        return shortcutButton;
    },

    /**
     * 创建小部件容器
     */
    createWidgetContainer(item) {
        const widgetContainer = Utils.createElement("div", "widget-container", {
            'data-widget-id': item.id,
            'data-widget-type': item.widgetType
        });

        widgetContainer.style.width = '100%';
        widgetContainer.style.height = '100%';
        widgetContainer.style.borderRadius = '12px';
        widgetContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        widgetContainer.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        widgetContainer.style.padding = '16px';
        widgetContainer.style.display = 'flex';
        widgetContainer.style.flexDirection = 'column';
        widgetContainer.style.alignItems = 'center';
        widgetContainer.style.justifyContent = 'center';

        // 创建小部件标题
        if (item.title) {
            const titleElement = Utils.createElement("h3", "widget-title", {}, item.title);
            titleElement.style.fontSize = '14px';
            titleElement.style.marginBottom = '12px';
            widgetContainer.appendChild(titleElement);
        }

        // 显示与文件夹id对应的小部件
        widgetContainer.textContent = `小部件类型: ${item.widgetType} (文件夹ID: ${item.folderId || '未绑定'})`;

        return widgetContainer;
    },

    
    /**
     * 创建桌面网格（基于 Temp123 的实现）
     */
    createDesktopGrid(container, items, gridConfig) {
        container.innerHTML = '';
        container.style.position = 'relative';
        container.style.width = `${gridConfig.cols * gridConfig.cellSize + (gridConfig.cols - 1) * gridConfig.gap}px`;
        container.style.height = `${gridConfig.rows * gridConfig.cellSize + (gridConfig.rows - 1) * gridConfig.gap}px`;
        container.style.margin = '0 auto';

        items.forEach(item => {
            const element = item.type === ItemType.SHORTCUT
                ? this.createShortcutButton(item)
                : this.createWidgetContainer(item);

            // 计算位置和大小
            const width = item.w * gridConfig.cellSize + (item.w - 1) * gridConfig.gap;
            const height = item.h * gridConfig.cellSize + (item.h - 1) * gridConfig.gap;
            const left = item.x * (gridConfig.cellSize + gridConfig.gap);
            const top = item.y * (gridConfig.cellSize + gridConfig.gap);

            element.style.position = 'absolute';
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
            element.style.width = `${width}px`;
            element.style.height = `${height}px`;
            element.style.transition = 'all 0.2s ease';
            element.style.zIndex = 1;

            // 添加拖拽功能（基于 Temp123 的拖拽概念）
            this.addDraggableFunctionality(element, item, items, gridConfig, container);

            container.appendChild(element);
        });
    },

    /**
     * 添加拖拽功能
     */
    addDraggableFunctionality(element, item, items, gridConfig, container) {
        let isDragging = false;
        let startX, startY;
        let startPosX, startPosY;

        // 创建拖拽手柄
        const dragHandle = Utils.createElement("div", "drag-handle");
        dragHandle.style.position = 'absolute';
        dragHandle.style.top = '0';
        dragHandle.style.left = '0';
        dragHandle.style.right = '0';
        dragHandle.style.height = '24px';
        dragHandle.style.cursor = 'move';
        dragHandle.style.zIndex = '10';
        dragHandle.style.opacity = '0';
        dragHandle.style.transition = 'opacity 0.2s ease';
        dragHandle.style.display = 'flex';
        dragHandle.style.alignItems = 'center';
        dragHandle.style.justifyContent = 'center';
        dragHandle.style.touchAction = 'none';

        // 添加拖拽图标
        const dragIcon = Utils.createElement("div", "drag-icon");
        dragIcon.style.fontSize = '16px';
        dragIcon.textContent = '⋮⋮';
        dragIcon.style.color = 'white';
        dragIcon.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        dragIcon.style.padding = '2px 8px';
        dragIcon.style.borderRadius = '4px';

        dragHandle.appendChild(dragIcon);
        element.appendChild(dragHandle);

        // 悬停时显示拖拽手柄
        element.addEventListener('mouseenter', () => {
            dragHandle.style.opacity = '1';
        });

        element.addEventListener('mouseleave', () => {
            if (!isDragging) {
                dragHandle.style.opacity = '0';
            }
        });

        // 鼠标按下事件
        dragHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startPosX = item.x;
            startPosY = item.y;

            element.style.zIndex = '50';
            element.style.opacity = '0.8';

            // 显示网格背景
            this.showGridBackground(container, gridConfig);
        });

        // 鼠标移动事件
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // 计算新位置
            const cellSizeWithGap = gridConfig.cellSize + gridConfig.gap;
            const newX = Math.max(0, Math.min(gridConfig.cols - item.w, Math.round((startPosX * cellSizeWithGap + deltaX) / cellSizeWithGap)));
            const newY = Math.max(0, Math.min(gridConfig.rows - item.h, Math.round((startPosY * cellSizeWithGap + deltaY) / cellSizeWithGap)));

            // 检查碰撞
            const newItem = { ...item, x: newX, y: newY };
            const otherItems = items.filter(i => i.id !== item.id);
            const hasCollision = otherItems.some(otherItem => gridUtils.checkCollision(newItem, otherItem));

            if (!hasCollision) {
                item.x = newX;
                item.y = newY;

                // 更新元素位置
                const left = newX * cellSizeWithGap;
                const top = newY * cellSizeWithGap;
                element.style.left = `${left}px`;
                element.style.top = `${top}px`;
            }
        });

        // 鼠标释放事件
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '1';
                element.style.opacity = '1';
                dragHandle.style.opacity = '0';

                // 隐藏网格背景
                this.hideGridBackground(container);
            }
        });

        // 添加调整大小功能（仅小部件）
        if (item.type === ItemType.WIDGET) {
            this.addResizableFunctionality(element, item, items, gridConfig);
        }
    },

    /**
     * 添加调整大小功能
     */
    addResizableFunctionality(element, item, items, gridConfig) {
        let isResizing = false;
        let startX, startY;
        let startWidth, startHeight;

        // 创建调整大小手柄
        const resizeHandle = Utils.createElement("div", "resize-handle");
        resizeHandle.style.position = 'absolute';
        resizeHandle.style.bottom = '0';
        resizeHandle.style.right = '0';
        resizeHandle.style.width = '16px';
        resizeHandle.style.height = '16px';
        resizeHandle.style.cursor = 'se-resize';
        resizeHandle.style.zIndex = '10';
        resizeHandle.style.display = 'flex';
        resizeHandle.style.alignItems = 'center';
        resizeHandle.style.justifyContent = 'center';

        // 添加调整大小图标
        const resizeIcon = Utils.createElement("div", "resize-icon");
        resizeIcon.style.fontSize = '12px';
        resizeIcon.textContent = '⋮';
        resizeIcon.style.color = '#666';

        resizeHandle.appendChild(resizeIcon);
        element.appendChild(resizeHandle);

        // 鼠标按下事件
        resizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = item.w;
            startHeight = item.h;

            element.style.zIndex = '50';
        });

        // 鼠标移动事件
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // 计算新大小
            const cellSizeWithGap = gridConfig.cellSize + gridConfig.gap;
            const newWidth = Math.max(1, Math.min(gridConfig.cols - item.x, Math.round((startWidth * cellSizeWithGap + deltaX) / cellSizeWithGap)));
            const newHeight = Math.max(1, Math.min(gridConfig.rows - item.y, Math.round((startHeight * cellSizeWithGap + deltaY) / cellSizeWithGap)));

            // 检查碰撞
            const newItem = { ...item, w: newWidth, h: newHeight };
            const otherItems = items.filter(i => i.id !== item.id);
            const hasCollision = otherItems.some(otherItem => gridUtils.checkCollision(newItem, otherItem));

            if (!hasCollision) {
                item.w = newWidth;
                item.h = newHeight;

                // 更新元素大小
                const width = newWidth * gridConfig.cellSize + (newWidth - 1) * gridConfig.gap;
                const height = newHeight * gridConfig.cellSize + (newHeight - 1) * gridConfig.gap;
                element.style.width = `${width}px`;
                element.style.height = `${height}px`;
            }
        });

        // 鼠标释放事件
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                element.style.zIndex = '1';
            }
        });
    },

    /**
     * 显示网格背景
     */
    showGridBackground(container, gridConfig) {
        // 移除现有的网格背景
        const existingGrid = container.querySelector('.grid-background');
        if (existingGrid) {
            existingGrid.remove();
        }

        // 创建新的网格背景
        const gridBackground = Utils.createElement("div", "grid-background");
        gridBackground.style.position = 'absolute';
        gridBackground.style.top = '0';
        gridBackground.style.left = '0';
        gridBackground.style.width = '100%';
        gridBackground.style.height = '100%';
        gridBackground.style.pointerEvents = 'none';
        gridBackground.style.zIndex = '5';

        // 创建网格单元格
        for (let row = 0; row < gridConfig.rows; row++) {
            for (let col = 0; col < gridConfig.cols; col++) {
                const cell = Utils.createElement("div", "grid-cell");
                cell.style.position = 'absolute';
                cell.style.left = `${col * (gridConfig.cellSize + gridConfig.gap)}px`;
                cell.style.top = `${row * (gridConfig.cellSize + gridConfig.gap)}px`;
                cell.style.width = `${gridConfig.cellSize}px`;
                cell.style.height = `${gridConfig.cellSize}px`;
                cell.style.border = '2px solid rgba(59, 130, 246, 0.3)';
                cell.style.borderRadius = '8px';
                cell.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';

                gridBackground.appendChild(cell);
            }
        }

        container.appendChild(gridBackground);
    },

    /**
     * 隐藏网格背景
     */
    hideGridBackground(container) {
        const gridBackground = container.querySelector('.grid-background');
        if (gridBackground) {
            gridBackground.remove();
        }
    },

    /**
     * 从书签创建快捷方式项目
     */
    createShortcutsFromBookmarks(bookmarks, folderId = '') {
        const shortcuts = [];
        const folderColor = '#ffffffff'

        bookmarks.forEach((bookmark, index) => {
            if (!bookmark.children) {
                const shortcut = new ShortcutItem(
                    bookmark.id,
                    bookmark.title || '未命名',
                    '', // 不需要图标名称，使用URL图标
                    folderColor,
                    bookmark.url,
                    index % 4, // 基于 Temp123 的网格布局
                    Math.floor(index / 4),
                    1,
                    1
                );
                shortcuts.push(shortcut);
            }
        });

        return shortcuts;
    },

    /**
     * 生成默认小部件
     * 不再生成默认小部件，而是显示与文件夹id对应的小部件
     */
    createDefaultWidgets() {
        return [];
    },

    /**
     * 计算响应式网格配置（基于 Temp123 的实现）
     */
    calculateGridConfig() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        if (width < 768) {
            // 移动设备
            return new GridConfig(
                4,
                6,
                12,
                Math.min(80, (width - 64) / 4 - 12)
            );
        } else if (width < 1024) {
            // 平板
            return new GridConfig(
                6,
                4,
                14,
                90
            );
        } else {
            // 桌面
            return new GridConfig(
                6,
                3,
                16,
                100
            );
        }
    }
};
