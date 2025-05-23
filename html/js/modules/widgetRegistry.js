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
     * @param {Object} metadata - 小部件元数据
     * @param {string} metadata.name - 小部件显示名称
     * @param {string} metadata.description - 小部件描述
     * @param {Function} importFunction - 异步导入函数，返回小部件模块
     */
    register(type, metadata, importFunction) {
        if (registeredWidgets.has(type)) {
            console.warn(`小部件类型 "${type}" 已注册，将被覆盖`);
        }
        
        registeredWidgets.set(type, {
            type,
            metadata,
            importFunction
        });
    },
    
    /**
     * 获取所有已注册的小部件类型
     * @returns {Array} 小部件类型数组，每个元素包含type和metadata
     */
    getAllWidgets() {
        return Array.from(registeredWidgets.values()).map(widget => ({
            type: widget.type,
            ...widget.metadata
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
            return await widget.importFunction();
        } catch (error) {
            console.error(`加载小部件模块 "${type}" 失败:`, error);
            throw error;
        }
    }
};

// 注册所有可用的小部件类型
// 这是唯一需要修改的地方，当添加新的小部件时

// 计数器小部件
WidgetRegistry.register('counter', {
    name: '计数器',
    description: '简单的计数器小部件，可增加、减少和重置数值'
}, () => import('./widgets/counterWidget.js'));

// 计时器小部件
WidgetRegistry.register('timer', {
    name: '计时器',
    description: '计时器小部件，可开始、暂停、记录和停止'
}, () => import('./widgets/timerWidget.js'));

// 在这里注册新的小部件类型
// 例如:
// WidgetRegistry.register('weather', {
//     name: '天气',
//     description: '显示当前天气状况和预报'
// }, () => import('./widgets/weatherWidget.js'));