/**
 * 小部件注册中心
 * 用于集中管理所有可用的小部件类型和它们的元数据
 */

// 存储所有已注册的小部件
const registeredWidgets = new Map();

export const WidgetRegistry = {
    /**
     * 注册一个新的小部件类型
     * @param {string} type - 小部件类型标识符
     * @param {string} path - 小部件模块路径
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
        
        // 创建导入函数
        const importFunction = async () => import(path);
        
        registeredWidgets.set(type, {
            type,
            path,
            importFunction,
            metadata: null // 初始化为空，将在首次加载时填充
        });
    },
    
    /**
     * 获取所有已注册的小部件类型
     * @param {boolean} forceLoad - 是否强制加载所有小部件元数据
     * @returns {Promise<Array>} 小部件类型数组，每个元素包含type和metadata
     */
    async getAllWidgets(forceLoad = false) {
        if (forceLoad) {
            // 如果强制加载，确保所有小部件的元数据都已加载
            const loadPromises = Array.from(registeredWidgets.values()).map(async (widget) => {
                if (!widget.metadata) {
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
                    ...widget.metadata
                };
            });
            
            return Promise.all(loadPromises);
        }
        
        // 不强制加载时，返回已有的元数据
        return Array.from(registeredWidgets.values()).map(widget => ({
            type: widget.type,
            ...(widget.metadata || {})
        }));
    },
    
    /**
     * 异步加载指定小部件类型的模块
     * @param {string} type - 小部件类型
     * @returns {Promise<Object>} 小部件模块
     * @throws {Error} 如果小部件类型未注册
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
WidgetRegistry.register('counter', './widgets/counterWidget.js');
WidgetRegistry.register('timer', './widgets/timerWidget.js');

// 在这里注册新的小部件类型
// 例如:
// WidgetRegistry.register('weather', './widgets/weatherWidget.js');