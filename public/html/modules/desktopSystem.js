/**
 * 桌面系统模块
 * 完全基于 Temp123 的展示小部件和快捷方式实现
 */

import { Utils, IconManager } from "./core/index.js";

const layoutStorageKey = "desktopLayouts";
const layoutSaveTimers = new Map();

// 桌面项目类型
export const ItemType = {
  SHORTCUT: "shortcut",
  WIDGET: "widget",
};

// 小部件类型
export const WidgetType = {
  COUNTER: "counter",
  TIMER: "timer",
  NOTE: "note",
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
  },
};

/**
 * 桌面系统管理器
 */
export const DesktopSystem = {
  /**
   * 检查当前布局是否需要重新排布
   * @param {Array} items - 桌面项目
   * @param {GridConfig} gridConfig - 网格配置
   * @returns {boolean} 是否需要重排
   */
  needsReflow(items, gridConfig) {
    const pageBuckets = new Map();

    for (const item of items) {
      const page = Number.isFinite(item.page) ? item.page : 0;
      if (!pageBuckets.has(page)) {
        pageBuckets.set(page, []);
      }
      pageBuckets.get(page).push(item);
    }

    for (const bucket of pageBuckets.values()) {
      for (const item of bucket) {
        if (!gridUtils.isWithinBounds(item, gridConfig)) {
          return true;
        }
      }

      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) {
          if (gridUtils.checkCollision(bucket[i], bucket[j])) {
            return true;
          }
        }
      }
    }

    return false;
  },

  /**
   * 重新按顺序铺排并分页
   * @param {Array} items - 桌面项目
   * @param {GridConfig} gridConfig - 网格配置
   * @returns {Array} 重排后的项目
   */
  reflowItems(items, gridConfig) {
    // 简化处理，仅保留基本属性
    return items.map((item, index) => {
      const next = { ...item };
      // 为快捷方式设置默认尺寸
      if (next.type === ItemType.SHORTCUT) {
        next.w = 1;
        next.h = 1;
      }
      // 为小部件设置默认尺寸
      if (next.type === ItemType.WIDGET) {
        next.w = next.w || 2;
        next.h = next.h || 2;
      }
      // 简化分页，每页放置所有项目
      next.page = 0;
      // 设置默认位置
      next.x = next.x || 0;
      next.y = next.y || 0;
      return next;
    });
  },
  /**
   * 查找最近的可用空位
   * @param {Object} item - 待放置的项目
   * @param {Array} items - 当前项目列表
   * @param {GridConfig} gridConfig - 网格配置
   * @returns {{x:number,y:number}|null} 最近的可用位置
   */
  findNearestFreePosition(item, items, gridConfig) {
    let best = null;
    let bestDistance = Infinity;

    for (let y = 0; y <= gridConfig.rows - item.h; y += 1) {
      for (let x = 0; x <= gridConfig.cols - item.w; x += 1) {
        const candidate = { ...item, x, y };
        const otherItems = items.filter((i) => i.id !== item.id);
        const hasCollision = otherItems.some((otherItem) =>
          gridUtils.checkCollision(candidate, otherItem),
        );
        if (hasCollision) continue;

        const distance = Math.abs(item.x - x) + Math.abs(item.y - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }

    return best;
  },
  /**
   * 加载指定文件夹的布局数据
   * @param {string} folderId - 文件夹ID
   * @returns {Promise<Object|null>} 布局数据
   */
  async loadLayout(folderId) {
    if (!folderId) return null;
    try {
      const result = await chrome.storage.local.get(layoutStorageKey);
      const layouts = result[layoutStorageKey] || {};
      return layouts[folderId] || null;
    } catch (error) {
      console.error("加载布局数据失败:", error);
      return null;
    }
  },

  /**
   * 保存指定文件夹的布局数据
   * @param {string} folderId - 文件夹ID
   * @param {Array} items - 桌面项目
   * @param {GridConfig} gridConfig - 网格配置
   * @returns {Promise<void>} 无
   */
  async saveLayout(folderId, items, gridConfig) {
    if (!folderId) return;
    try {
      const result = await chrome.storage.local.get(layoutStorageKey);
      const layouts = result[layoutStorageKey] || {};
      const existingLayout = layouts[folderId] || { items: [] };
      const itemMap = new Map((existingLayout.items || []).map((item) => [item.id, item]));

      items.forEach((item) => {
        itemMap.set(item.id, {
          id: item.id,
          type: item.type,
          x: item.x,
          y: item.y,
          w: item.type === ItemType.SHORTCUT ? 1 : item.w,
          h: item.type === ItemType.SHORTCUT ? 1 : item.h,
          page: Number.isFinite(item.page) ? item.page : 0,
        });
      });

      layouts[folderId] = {
        grid: {
          cols: gridConfig.cols,
          rows: gridConfig.rows,
        },
        items: Array.from(itemMap.values()),
      };

      await chrome.storage.local.set({ [layoutStorageKey]: layouts });
    } catch (error) {
      console.error("保存布局数据失败:", error);
    }
  },

  /**
   * 调度布局保存，避免频繁写入
   * @param {string} folderId - 文件夹ID
   * @param {Array} items - 桌面项目
   * @param {GridConfig} gridConfig - 网格配置
   */
  scheduleLayoutSave(folderId, items, gridConfig) {
    if (!folderId) return;
    if (layoutSaveTimers.has(folderId)) {
      clearTimeout(layoutSaveTimers.get(folderId));
    }
    const timerId = setTimeout(() => {
      this.saveLayout(folderId, items, gridConfig);
      layoutSaveTimers.delete(folderId);
    }, 250);
    layoutSaveTimers.set(folderId, timerId);
  },

  /**
   * 应用布局并根据网格变化进行缩放
   * @param {Array} items - 桌面项目
   * @param {Object|null} layout - 布局数据
   * @param {GridConfig} gridConfig - 当前网格配置
   * @returns {Array} 应用布局后的项目
   */
  applyLayout(items, layout, gridConfig) {
    if (!layout || !layout.items || layout.items.length === 0) {
      return items;
    }

    const savedCols = layout.grid && layout.grid.cols ? layout.grid.cols : gridConfig.cols;
    const savedRows = layout.grid && layout.grid.rows ? layout.grid.rows : gridConfig.rows;
    const scaleX = gridConfig.cols / savedCols;
    const scaleY = gridConfig.rows / savedRows;

    const layoutMap = new Map(layout.items.map((saved) => [saved.id, saved]));

    return items.map((item) => {
      const saved = layoutMap.get(item.id);
      if (!saved) return item;

      const next = { ...item };
      const savedW = Number.isFinite(saved.w) ? saved.w : next.w;
      const savedH = Number.isFinite(saved.h) ? saved.h : next.h;

      if (next.type === ItemType.SHORTCUT) {
        next.w = 1;
        next.h = 1;
      } else {
        next.w = Math.max(1, Math.min(gridConfig.cols, Math.round(savedW * scaleX)));
        next.h = Math.max(1, Math.min(gridConfig.rows, Math.round(savedH * scaleY)));
      }
      next.x = Math.max(0, Math.min(gridConfig.cols - next.w, Math.round(saved.x * scaleX)));
      next.y = Math.max(0, Math.min(gridConfig.rows - next.h, Math.round(saved.y * scaleY)));
      next.page = Number.isFinite(saved.page)
        ? saved.page
        : Number.isFinite(item.page)
          ? item.page
          : 0;

      if (!gridUtils.isWithinBounds(next, gridConfig)) {
        next.x = Math.max(0, Math.min(gridConfig.cols - next.w, next.x));
        next.y = Math.max(0, Math.min(gridConfig.rows - next.h, next.y));
      }

      return next;
    });
  },
  /**
   * 创建快捷方式按钮
   */
  createShortcutButton(item) {
    const shortcutButton = Utils.createElement("div", "shortcut-button", {
      "data-shortcut-id": item.id,
    });
    if (item.url) {
      shortcutButton.dataset.shortcutUrl = item.url;
    }

    shortcutButton.style.display = "flex";
    shortcutButton.style.flexDirection = "column";
    shortcutButton.style.alignItems = "center";
    shortcutButton.style.justifyContent = "center";
    shortcutButton.style.gap = "8px";
    shortcutButton.style.cursor = "pointer";
    shortcutButton.style.transition = "all 0.2s ease";
    shortcutButton.style.width = "100%";
    shortcutButton.style.height = "100%";

    // 创建图标容器
    const iconContainer = Utils.createElement("div", "shortcut-icon-container");
    iconContainer.style.width = "48px";
    iconContainer.style.height = "48px";
    iconContainer.style.borderRadius = "12px";
    iconContainer.style.display = "flex";
    iconContainer.style.alignItems = "center";
    iconContainer.style.justifyContent = "center";
    iconContainer.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
    iconContainer.style.backgroundColor = item.color || "#3b82f6";
    iconContainer.style.transition = "all 0.2s ease";

    // 创建图标元素（使用img标签而不是div，以便显示URL图标）
    const iconElement = Utils.createElement("img", "shortcut-icon");
    iconElement.style.width = "24px";
    iconElement.style.height = "24px";
    iconElement.style.borderRadius = "4px";

    // 使用IconManager为图标元素设置URL的图标
    if (item.url) {
      IconManager.setIconForElement(iconElement, item.url);
      iconElement.onerror = () => IconManager.handleIconError(iconElement, "../icons/icon128.png");
    } else {
      // 如果没有URL，使用默认图标
      iconElement.src = "../icons/icon128.png";
    }

    iconContainer.appendChild(iconElement);

    // 创建名称元素
    const nameElement = Utils.createElement("span", "shortcut-title", {}, item.name);

    shortcutButton.appendChild(iconContainer);
    shortcutButton.appendChild(nameElement);

    // 添加点击事件
    shortcutButton.addEventListener("click", () => {
      if (shortcutButton.dataset.dragged === "true") {
        shortcutButton.dataset.dragged = "false";
        return;
      }
      if (item.url) {
        chrome.tabs.create({ url: item.url });
      }
    });

    // 添加悬停效果
    shortcutButton.addEventListener("mouseenter", () => {
      shortcutButton.style.transform = "scale(1.05)";
      iconContainer.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.15)";
    });

    shortcutButton.addEventListener("mouseleave", () => {
      shortcutButton.style.transform = "scale(1)";
      iconContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
    });

    return shortcutButton;
  },

  /**
   * 创建小部件容器
   */
  async createWidgetContainer(item) {
    const widgetSystem = window.WidgetSystem;
    if (widgetSystem && typeof widgetSystem.buildContainerElement === "function" && item.data) {
      try {
        if (!Array.isArray(item.data.items)) {
          item.data.items = [];
        }
        return await widgetSystem.buildContainerElement(item.data);
      } catch (error) {
        console.error("使用WidgetSystem渲染小部件容器失败:", error);
      }
    }

    const widgetContainer = Utils.createElement("div", "widget-container", {
      "data-widget-id": item.id,
      "data-widget-type": item.widgetType,
      "data-folder-id": item.folderId,
    });

    widgetContainer.style.borderRadius = "12px";
    widgetContainer.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
    widgetContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
    widgetContainer.style.padding = "16px";
    widgetContainer.style.display = "flex";
    widgetContainer.style.flexDirection = "column";
    widgetContainer.style.alignItems = "center";
    widgetContainer.style.justifyContent = "center";

    // 创建小部件标题
    if (item.title) {
      const titleElement = Utils.createElement("h3", "widget-title", {}, item.title);
      titleElement.style.fontSize = "14px";
      titleElement.style.marginBottom = "12px";
      widgetContainer.appendChild(titleElement);
    }

    // 尝试加载和初始化小部件（基于WidgetRegistry）
    try {
      // 检查WidgetRegistry是否可用
      if (typeof WidgetRegistry !== "undefined") {
        // 加载小部件模块
        const widgetModule = await WidgetRegistry.loadWidget(item.widgetType);
        if (widgetModule && typeof widgetModule.initialize === "function") {
          // 初始化小部件
          await widgetModule.initialize(widgetContainer, item);
        } else {
          // 显示小部件类型信息
          const infoElement = Utils.createElement("div");
          infoElement.style.textAlign = "center";
          infoElement.style.color = "rgba(0, 0, 0, 0.6)";
          infoElement.innerHTML = `<div>小部件类型: ${item.widgetType}</div><div>初始化失败: 模块不可用</div>`;
          widgetContainer.appendChild(infoElement);
        }
      } else {
        // WidgetRegistry不可用，显示简单的占位内容
        console.log("WidgetRegistry不可用，显示占位小部件:", item.widgetType);
        const placeholderElement = Utils.createElement("div");
        placeholderElement.style.textAlign = "center";
        placeholderElement.style.color = "rgba(0, 0, 0, 0.6)";
        placeholderElement.innerHTML = `
                    <div style="font-size: 24px; margin-bottom: 8px;">📦</div>
                    <div style="font-size: 14px; font-weight: 500;">${item.widgetType}</div>
                    <div style="font-size: 12px; opacity: 0.7;">小部件</div>
                `;
        widgetContainer.appendChild(placeholderElement);
      }
    } catch (error) {
      console.error(`小部件 ${item.widgetType} 初始化失败:`, error);
      // 显示错误信息
      const errorElement = Utils.createElement("div");
      errorElement.style.textAlign = "center";
      errorElement.style.color = "rgba(239, 68, 68, 0.8)";
      errorElement.innerHTML = `<div>小部件类型: ${item.widgetType}</div><div>初始化失败: ${error.message}</div>`;
      widgetContainer.appendChild(errorElement);
    }

    return widgetContainer;
  },

  /**
   * 检测当前是否处于响应式模式（竖屏/小屏幕）
   */
  isResponsiveMode() {
    return window.matchMedia("(max-aspect-ratio: 1/1), (max-width: 768px), (orientation: portrait)")
      .matches;
  },

  /**
   * 创建桌面网格（基于 Temp123 的实现）
   */
  async createDesktopGrid(container, items, gridConfig) {
    container.innerHTML = "";

    // 检测当前是否处于响应式模式
    const isResponsive = this.isResponsiveMode();

    // 设置容器样式
    if (isResponsive) {
      // 响应式模式：移除绝对定位相关样式，让CSS flex布局处理
      container.style.position = "relative";
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.boxSizing = "border-box";
      // 清除内联的flex相关样式，让CSS媒体查询处理
      container.style.display = "";
      container.style.flexDirection = "";
      container.style.flexWrap = "";
      container.style.justifyContent = "";
    } else {
      // 桌面模式：设置相对定位，用于绝对定位的子元素
      container.style.position = "relative";
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.padding = "20px";
      container.style.boxSizing = "border-box";
    }

    // 计算单元格大小和间距
    const cellSize = gridConfig.cellSize;
    const gap = gridConfig.gap;

    // 异步处理每个项目
    for (const item of items) {
      let element;

      if (item.type === ItemType.SHORTCUT) {
        // 快捷方式是同步创建的
        element = this.createShortcutButton(item);
      } else {
        // 小部件是异步创建的
        element = await this.createWidgetContainer(item);
      }

      if (isResponsive) {
        // 响应式模式：不设置绝对定位，让CSS处理布局
        // 清除可能存在的内联样式
        element.style.position = "";
        element.style.left = "";
        element.style.top = "";
        element.style.width = "";
        element.style.height = "";
        element.style.transition = "all 0.2s ease";
        element.style.zIndex = 1;
        element.style.pointerEvents = "auto";
      } else {
        // 桌面模式：设置元素样式为绝对定位
        element.style.position = "absolute";
        element.style.transition = "all 0.2s ease";
        element.style.zIndex = 1;
        // 确保小部件和快捷方式在同一层级
        element.style.pointerEvents = "auto";

        // 计算元素大小和位置
        const width = item.w * cellSize + (item.w - 1) * gap;
        const height = item.h * cellSize + (item.h - 1) * gap;
        const left = item.x * (cellSize + gap);
        const top = item.y * (cellSize + gap);

        // 设置元素大小和位置
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
      }

      container.appendChild(element);

      // 只有在桌面模式下才添加拖拽和调整大小功能
      if (!isResponsive) {
        this.addDraggableFunctionality(element, item, items, gridConfig, container);
      }
    }

    // 确保所有元素在同一层级，不受DOM顺序影响
    container.style.zIndex = 0;
  },

  /**
   * 添加拖拽功能
   */
  addDraggableFunctionality(element, item, items, gridConfig, container) {
    let isDragging = false;
    let startX, startY;
    let startPosX, startPosY;
    let lastValidPosition = { x: item.x, y: item.y };

    // 创建拖拽手柄（现代化设计，基于Temp123）
    const dragHandle = Utils.createElement("div", "drag-handle");
    dragHandle.style.position = "absolute";
    dragHandle.style.top = "0";
    dragHandle.style.left = "0";
    dragHandle.style.right = "0";
    dragHandle.style.height = "32px";
    dragHandle.style.cursor = "move";
    dragHandle.style.zIndex = "10";
    dragHandle.style.opacity = "0";
    dragHandle.style.transition = "opacity 0.2s ease";
    dragHandle.style.display = "flex";
    dragHandle.style.alignItems = "center";
    dragHandle.style.justifyContent = "center";
    dragHandle.style.touchAction = "none";

    // 添加拖拽图标（基于Temp123的设计）
    const dragIcon = Utils.createElement("div", "drag-icon");
    dragIcon.style.fontSize = "14px";
    dragIcon.textContent = "⋮⋮";
    dragIcon.style.color = "white";
    dragIcon.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    dragIcon.style.backdropFilter = "blur(8px)";
    dragIcon.style.padding = "4px 12px";
    dragIcon.style.borderRadius = "16px";
    dragIcon.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.2)";

    dragHandle.appendChild(dragIcon);
    element.appendChild(dragHandle);

    // 悬停时显示拖拽手柄
    element.addEventListener("mouseenter", () => {
      dragHandle.style.opacity = "1";
    });

    element.addEventListener("mouseleave", () => {
      if (!isDragging) {
        dragHandle.style.opacity = "0";
      }
    });

    // 鼠标按下事件
    dragHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPosX = item.x;
      startPosY = item.y;
      lastValidPosition = { x: item.x, y: item.y };
      if (item.type === ItemType.SHORTCUT) {
        element.dataset.dragged = "false";
      }

      element.style.zIndex = "50";
      element.style.opacity = "0.8";

      // 显示网格背景
      this.showGridBackground(container, gridConfig);
    });

    // 鼠标移动事件
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      if (item.type === ItemType.SHORTCUT && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
        element.dataset.dragged = "true";
      }

      // 计算新位置
      const cellSizeWithGap = gridConfig.cellSize + gridConfig.gap;
      const newX = Math.max(
        0,
        Math.min(
          gridConfig.cols - item.w,
          Math.round((startPosX * cellSizeWithGap + deltaX) / cellSizeWithGap),
        ),
      );
      const newY = Math.max(
        0,
        Math.min(
          gridConfig.rows - item.h,
          Math.round((startPosY * cellSizeWithGap + deltaY) / cellSizeWithGap),
        ),
      );

      // 检查碰撞，记录最后可用位置
      const newItem = { ...item, x: newX, y: newY };
      const otherItems = items.filter((i) => i.id !== item.id);
      const hasCollision = otherItems.some((otherItem) =>
        gridUtils.checkCollision(newItem, otherItem),
      );

      item.x = newX;
      item.y = newY;

      if (!hasCollision) {
        lastValidPosition = { x: newX, y: newY };
      }

      // 更新元素位置
      const left = newX * cellSizeWithGap;
      const top = newY * cellSizeWithGap;
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    });

    // 鼠标释放事件
    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        element.style.zIndex = "1";
        element.style.opacity = "1";
        dragHandle.style.opacity = "0";

        // 隐藏网格背景
        this.hideGridBackground(container);

        const otherItems = items.filter((i) => i.id !== item.id);
        const hasCollision = otherItems.some((otherItem) =>
          gridUtils.checkCollision(item, otherItem),
        );
        if (hasCollision) {
          const resolved = this.findNearestFreePosition(item, items, gridConfig);
          if (resolved) {
            item.x = resolved.x;
            item.y = resolved.y;
          } else {
            item.x = lastValidPosition.x;
            item.y = lastValidPosition.y;
          }
          const cellSizeWithGap = gridConfig.cellSize + gridConfig.gap;
          element.style.left = `${item.x * cellSizeWithGap}px`;
          element.style.top = `${item.y * cellSizeWithGap}px`;
        }

        const folderId = container && container.dataset ? container.dataset.folderId : null;
        this.scheduleLayoutSave(folderId, items, gridConfig);
      }
    });

    // 添加调整大小功能（仅小部件）
    if (item.type === ItemType.WIDGET) {
      this.addResizableFunctionality(element, item, items, gridConfig, container);
    }
  },

  /**
   * 添加调整大小功能
   */
  addResizableFunctionality(element, item, items, gridConfig, container) {
    let isResizing = false;
    let startX, startY;
    let startWidth, startHeight;
    let lastValidSize = { w: item.w, h: item.h };

    // 创建调整大小手柄（基于Temp123的设计）
    const resizeHandle = Utils.createElement("div", "resize-handle");
    resizeHandle.style.position = "absolute";
    resizeHandle.style.bottom = "0";
    resizeHandle.style.right = "0";
    resizeHandle.style.width = "24px";
    resizeHandle.style.height = "24px";
    resizeHandle.style.cursor = "se-resize";
    resizeHandle.style.zIndex = "10";
    resizeHandle.style.display = "flex";
    resizeHandle.style.alignItems = "center";
    resizeHandle.style.justifyContent = "center";
    resizeHandle.style.opacity = "0";
    resizeHandle.style.transition = "opacity 0.2s ease";

    // 添加调整大小图标（基于Temp123的设计）
    const resizeIcon = Utils.createElement("div", "resize-icon");
    resizeIcon.style.fontSize = "14px";
    resizeIcon.textContent = "⋮⋮";
    resizeIcon.style.color = "rgba(0, 0, 0, 0.6)";
    resizeIcon.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
    resizeIcon.style.backdropFilter = "blur(4px)";
    resizeIcon.style.padding = "2px 6px";
    resizeIcon.style.borderRadius = "8px";
    resizeIcon.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.1)";

    resizeHandle.appendChild(resizeIcon);
    element.appendChild(resizeHandle);

    // 悬停时显示调整大小手柄
    element.addEventListener("mouseenter", () => {
      resizeHandle.style.opacity = "1";
    });

    element.addEventListener("mouseleave", () => {
      if (!isResizing) {
        resizeHandle.style.opacity = "0";
      }
    });

    // 鼠标按下事件
    resizeHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = item.w;
      startHeight = item.h;
      lastValidSize = { w: item.w, h: item.h };

      element.style.zIndex = "50";
    });

    // 鼠标移动事件
    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // 计算新大小
      const cellSizeWithGap = gridConfig.cellSize + gridConfig.gap;
      const newWidth = Math.max(
        1,
        Math.min(
          gridConfig.cols - item.x,
          Math.round((startWidth * cellSizeWithGap + deltaX) / cellSizeWithGap),
        ),
      );
      const newHeight = Math.max(
        1,
        Math.min(
          gridConfig.rows - item.y,
          Math.round((startHeight * cellSizeWithGap + deltaY) / cellSizeWithGap),
        ),
      );

      // 检查碰撞，记录最后可用尺寸
      const newItem = { ...item, w: newWidth, h: newHeight };
      const otherItems = items.filter((i) => i.id !== item.id);
      const hasCollision = otherItems.some((otherItem) =>
        gridUtils.checkCollision(newItem, otherItem),
      );

      item.w = newWidth;
      item.h = newHeight;

      if (!hasCollision) {
        lastValidSize = { w: newWidth, h: newHeight };
      }

      // 更新元素大小
      const width = newWidth * gridConfig.cellSize + (newWidth - 1) * gridConfig.gap;
      const height = newHeight * gridConfig.cellSize + (newHeight - 1) * gridConfig.gap;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    });

    // 鼠标释放事件
    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        element.style.zIndex = "1";
        resizeHandle.style.opacity = "0";

        const otherItems = items.filter((i) => i.id !== item.id);
        const hasCollision = otherItems.some((otherItem) =>
          gridUtils.checkCollision(item, otherItem),
        );
        if (hasCollision) {
          const resolved = this.findNearestFreePosition(item, items, gridConfig);
          if (resolved) {
            item.x = resolved.x;
            item.y = resolved.y;
          } else {
            item.w = lastValidSize.w;
            item.h = lastValidSize.h;
          }

          const cellSizeWithGap = gridConfig.cellSize + gridConfig.gap;
          const width = item.w * gridConfig.cellSize + (item.w - 1) * gridConfig.gap;
          const height = item.h * gridConfig.cellSize + (item.h - 1) * gridConfig.gap;
          element.style.width = `${width}px`;
          element.style.height = `${height}px`;
          element.style.left = `${item.x * cellSizeWithGap}px`;
          element.style.top = `${item.y * cellSizeWithGap}px`;
        }

        const folderId = container && container.dataset ? container.dataset.folderId : null;
        this.scheduleLayoutSave(folderId, items, gridConfig);
      }
    });
  },

  /**
   * 显示网格背景
   */
  showGridBackground(container, gridConfig) {
    // 移除现有的网格背景
    const existingGrid = container.querySelector(".grid-background");
    if (existingGrid) {
      existingGrid.remove();
    }

    // 创建新的网格背景
    const gridBackground = Utils.createElement("div", "grid-background");
    gridBackground.style.position = "absolute";
    gridBackground.style.top = "0";
    gridBackground.style.left = "0";
    gridBackground.style.width = "100%";
    gridBackground.style.height = "100%";
    gridBackground.style.pointerEvents = "none";
    gridBackground.style.zIndex = "5";

    // 创建网格单元格
    for (let row = 0; row < gridConfig.rows; row++) {
      for (let col = 0; col < gridConfig.cols; col++) {
        const cell = Utils.createElement("div", "grid-cell");
        cell.style.position = "absolute";
        cell.style.left = `${col * (gridConfig.cellSize + gridConfig.gap)}px`;
        cell.style.top = `${row * (gridConfig.cellSize + gridConfig.gap)}px`;
        cell.style.width = `${gridConfig.cellSize}px`;
        cell.style.height = `${gridConfig.cellSize}px`;
        cell.style.border = "2px solid rgba(59, 130, 246, 0.3)";
        cell.style.borderRadius = "8px";
        cell.style.backgroundColor = "rgba(59, 130, 246, 0.1)";

        gridBackground.appendChild(cell);
      }
    }

    container.appendChild(gridBackground);
  },

  /**
   * 隐藏网格背景
   */
  hideGridBackground(container) {
    const gridBackground = container.querySelector(".grid-background");
    if (gridBackground) {
      gridBackground.remove();
    }
  },

  /**
   * 从书签创建快捷方式项目
   */
  createShortcutsFromBookmarks(bookmarks, folderId = "", columns = 4) {
    const shortcuts = [];
    // 使用统一的蓝色主色调，20%透明度
    const folderColor = "rgba(59, 130, 246, 0.2)";

    const cols = Math.max(1, columns || 4);

    bookmarks.forEach((bookmark, index) => {
      if (!bookmark.children) {
        const shortcut = new ShortcutItem(
          bookmark.id,
          bookmark.title || "未命名",
          "", // 不需要图标名称，使用URL图标
          folderColor,
          bookmark.url,
          index % cols,
          Math.floor(index / cols),
          1,
          1,
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
   * 计算响应式网格配置
   */
  calculateGridConfig(container = null) {
    const target = container || document.getElementById("shortcut-list");
    if (!target) {
      return new GridConfig(12, 4, 14, 88);
    }

    const rect = target.getBoundingClientRect();
    let width = rect.width || target.clientWidth || 0;
    let height = rect.height || target.clientHeight || 0;

    const styles = window.getComputedStyle(target);
    const paddingX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const paddingY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    width = Math.max(0, width - paddingX);
    height = Math.max(0, height - paddingY);

    if (!width || !height) {
      return new GridConfig(12, 4, 14, 88);
    }

    const isSmall = width < 768;
    const gap = isSmall ? 12 : 14;
    const minCellSize = isSmall ? 48 : 64;
    const maxCellSize = isSmall ? 80 : 100;

    // 计算宽高比，决定行列数
    const aspectRatio = width / height;
    let cols, rows;

    if (aspectRatio > 1.5) {
      // 宽屏：12列4行
      cols = 12;
      rows = 4;
    } else if (aspectRatio < 0.75) {
      // 竖屏：4列12行
      cols = 4;
      rows = 12;
    } else {
      // 正方形：8列8行（64格）
      cols = 8;
      rows = 8;
    }

    // 计算单元格大小
    let cellSize = Math.min(
      maxCellSize,
      Math.floor((width - (cols - 1) * gap) / cols),
      Math.floor((height - (rows - 1) * gap) / rows),
    );

    // 确保单元格大小不小于最小值
    cellSize = Math.max(minCellSize, cellSize);

    // 重新计算行列数，确保64格
    if (cols * rows !== 64) {
      // 调整为最接近64格的配置
      if (aspectRatio > 1.5) {
        cols = 12;
        rows = 4;
      } else if (aspectRatio < 0.75) {
        cols = 4;
        rows = 12;
      } else {
        // 中等比例：8列4行
        cols = 8;
        rows = 8;
      }
    }

    return new GridConfig(cols, rows, gap, cellSize);
  },
};
