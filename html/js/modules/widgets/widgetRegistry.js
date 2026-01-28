/**
 * 小部件注册中心模块
 * 负责管理所有可用小部件类型及其元数据，支持动态加载和元数据缓存。
 * @author System
 * @version 1.0.1
 * @date 2025-07-09
 */

// 存储所有已注册的小部件
const registeredWidgets = new Map();

/**
 * 小部件注册中心API
 * @namespace WidgetRegistry
 */
export const WidgetRegistry = {
    /**
     * 注册一个新的小部件类型
     * @param {string} type - 小部件类型标识符
     * @param {string} path - 小部件模块路径
     * @throws {Error} 参数无效或类型已注册
     */
    register(type, path) {
        if (!type || typeof type !== 'string') {
            throw new Error('小部件类型必须是有效的字符串');
        }
        
        if (!path || typeof path !== 'string') {
            throw new Error('小部件路径必须是有效的字符串');
        }
          if (registeredWidgets.has(type)) {
            console.warn(`小部件类型 "${type}" 已注册，将被覆盖`);
        }
        
        // 创建标准化的导入函数
        const importFunction = async () => {
            // 使用统一的Chrome扩展URL方式
            const fullPath = chrome.runtime ? chrome.runtime.getURL(path) : path;
            try {
                const module = await import(fullPath);
                return module;
            } catch (error) {
                console.error(`导入小部件模块失败: ${path}`, error);
                throw error;
            }
        };
        
        registeredWidgets.set(type, {
            type,
            path,
            importFunction,
            metadata: null, // 初始化为空，将在首次加载时填充
            isCustom: false // 标记是否为自定义小部件
        });
    },
    
    /**
     * 动态注册自定义小部件（仅在开发者模式下可用）
     * @param {string} type - 小部件类型标识符
     * @param {string} name - 小部件名称
     * @param {string} css - CSS内容
     * @param {string} js - JS内容
     * @returns {boolean} 是否注册成功
     */
    registerCustomWidget(type, name, css, js) {
        // 检查是否在开发者模式下
        const isDeveloperMode = localStorage.getItem('developerUnlocked') === 'true';
        if (!isDeveloperMode) {
            console.error('自定义小部件功能仅在开发者模式下可用');
            return false;
        }
        
        if (!type || typeof type !== 'string') {
            console.error('小部件类型必须是有效的字符串');
            return false;
        }
        
        if (!name || typeof name !== 'string') {
            console.error('小部件名称必须是有效的字符串');
            return false;
        }
        
        if (!js || typeof js !== 'string') {
            console.error('小部件JS内容必须是有效的字符串');
            return false;
        }
        
        // 生成唯一的小部件ID
        const widgetId = `custom-${type}-${Date.now()}`;
        
        // 创建Blob URL存储CSS和JS内容
        let cssUrl = '';
        if (css) {
            const cssBlob = new Blob([css], { type: 'text/css' });
            cssUrl = URL.createObjectURL(cssBlob);
        }
        
        const jsBlob = new Blob([js], { type: 'text/javascript' });
        const jsUrl = URL.createObjectURL(jsBlob);
        
        // 创建动态导入函数
        const importFunction = async () => {
            try {
                // 加载CSS（如果有）
                if (cssUrl) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = cssUrl;
                    document.head.appendChild(link);
                }
                
                // 加载JS模块
                const module = await import(jsUrl);
                return module;
            } catch (error) {
                console.error(`导入自定义小部件模块失败: ${type}`, error);
                throw error;
            }
        };
        
        // 检查是否已存在同名小部件
        if (registeredWidgets.has(type)) {
            console.warn(`小部件类型 "${type}" 已存在，自定义小部件将替代它`);
        }
        
        // 注册自定义小部件
        registeredWidgets.set(type, {
            type,
            path: jsUrl,
            importFunction,
            metadata: {
                name: name,
                description: '自定义小部件',
                icon: '\uE734'
            },
            isCustom: true,
            cssUrl: cssUrl,
            jsUrl: jsUrl
        });
        
        console.log(`自定义小部件 "${type}" 已成功注册`);
        return true;
    },
    
    /**
     * 获取所有已注册的小部件类型及其元数据
     * @param {boolean} forceLoad - 是否强制加载所有小部件元数据
     * @returns {Promise<Array>} 小部件类型数组，每个元素包含type和metadata
     */
    async getAllWidgets(forceLoad = false) {
        if (forceLoad) {
            // 如果强制加载，确保所有小部件的元数据都已加载
            const loadPromises = Array.from(registeredWidgets.values()).map(async (widget) => {
                if (!widget.metadata && !widget.isCustom) {
                    try {
                        const module = await widget.importFunction();
                        const widgetModule = module.default || module;
                        widget.metadata = widgetModule.metadata || {};
                    } catch (error) {
                        console.error(`加载小部件 "${widget.type}" 元数据失败:`, error);
                        widget.metadata = {};
                    }
                }
                return {
                    type: widget.type,
                    ...widget.metadata,
                    isCustom: widget.isCustom
                };
            });
            
            return Promise.all(loadPromises);
        }
        
        // 不强制加载时，返回已有的元数据
        return Array.from(registeredWidgets.values()).map(widget => ({
            type: widget.type,
            ...(widget.metadata || {}),
            isCustom: widget.isCustom
        }));
    },
    
    /**
     * 异步加载指定小部件类型的模块
     * @param {string} type - 小部件类型
     * @returns {Promise<Object>} 小部件模块
     * @throws {Error} 如果小部件类型未注册或模块无效
     */
    async loadWidget(type) {
        const widget = registeredWidgets.get(type);
        if (!widget) {
            throw new Error(`未注册的小部件类型: ${type}`);
        }
        
        try {
            const module = await widget.importFunction();
            // 确保返回的是正确的模块对象（处理ESM的default导出）
            const widgetModule = module.default || module;
            
            // 验证小部件模块是否有效
            if (!widgetModule) {
                throw new Error(`小部件模块 "${type}" 导出为空`);
            }
            
            // 验证必要的方法是否存在
            if (typeof widgetModule.initialize !== 'function') {
                throw new Error(`小部件模块 "${type}" 缺少必要的 initialize 方法`);
            }
            
            // 保存元数据以便下次使用
            if (widgetModule.metadata && !widget.metadata) {
                widget.metadata = widgetModule.metadata;
            }
            
            return widgetModule;
        } catch (error) {
            console.error(`加载小部件模块 "${type}" 失败:`, error);
            throw error;
        }
    },
    
    /**
     * 销毁小部件实例
     * @param {string} type - 小部件类型
     * @param {HTMLElement} container - 小部件容器
     */
    async destroyWidget(type, container) {
        try {
            const widget = await this.loadWidget(type);
            if (typeof widget.destroy === 'function') {
                widget.destroy(container);
            }
        } catch (error) {
            console.error(`销毁小部件 "${type}" 失败:`, error);
        }
    },
    
    /**
     * 获取小部件的保存数据
     * @param {string} type - 小部件类型
     * @param {HTMLElement} container - 小部件容器
     * @returns {Promise<Object>} 小部件数据
     */
    async getWidgetData(type, container) {
        try {
            const widget = await this.loadWidget(type);
            if (typeof widget.getData === 'function') {
                return widget.getData(container);
            }
            return container.widgetData || {};
        } catch (error) {
            console.error(`获取小部件 "${type}" 数据失败:`, error);
            return {};
        }
    }
};

// 注册所有可用的小部件类型，只提供路径
WidgetRegistry.register('counter', '/html/js/modules/widgets/types/counterWidget.js');
WidgetRegistry.register('timer', '/html/js/modules/widgets/types/timerWidget.js');
WidgetRegistry.register('note', '/html/js/modules/widgets/types/noteWidget.js');

// 注册新的小部件类型示例:
// WidgetRegistry.register('weather', '/html/js/modules/widgets/types/weatherWidget.js');