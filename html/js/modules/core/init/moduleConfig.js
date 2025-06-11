/**
 * 模块配置文件
 * 定义所有模块的依赖关系和初始化配置
 */

// 导入统一的核心模块
import { 
    I18n, 
    Utils, 
    GridSystem, 
    backgroundManager, 
    SearchEngineAPI, 
    BookmarkManager, 
    ClockWidget, 
    ThemeManager, 
    AI, 
    DataSync, 
    WidgetRegistry, 
    WidgetSystem 
} from '../index.js';

/**
 * 模块配置定义
 * 每个模块包含：name, initFunction, dependencies, timeout
 */
export const moduleConfigs = [
    // ==================== 第一层：基础模块（无依赖） ====================
    {
        name: 'I18n',
        initFunction: async () => {
            return I18n.init();
        },
        dependencies: [],
        timeout: 5000
    },

    // ==================== 第二层：依赖基础模块 ====================
    {
        name: 'Notification',
        initFunction: () => {
            // Notification系统通常不需要异步初始化
            return Promise.resolve();
        },
        dependencies: ['I18n'],
        timeout: 3000
    },    {
        name: 'Utils',
        initFunction: async () => {
            // Utils模块现已合并background.js功能，自动检测环境
            // Utils.UI.Events 需要在DOM准备好后初始化（仅在DOM环境中）
            if (Utils.Environment.isDOMEnvironment) {
                if (document.readyState === 'loading') {
                    return new Promise(resolve => {
                        document.addEventListener('DOMContentLoaded', () => {
                            Utils.UI.Events.initUIEvents();
                            resolve();
                        });
                    });
                } else {
                    Utils.UI.Events.initUIEvents();
                    return Promise.resolve();
                }
            } else {
                // 在非DOM环境中（如Service Worker），直接完成初始化
                return Promise.resolve();
            }
        },
        dependencies: ['I18n', 'Notification'],
        timeout: 3000
    },

    // ==================== 第三层：核心交互模块 ====================
    {
        name: 'Menu',
        initFunction: () => {
            // Menu系统通常不需要异步初始化
            return Promise.resolve();
        },
        dependencies: ['Utils', 'I18n'],
        timeout: 3000
    },

    {
        name: 'GridSystem',
        initFunction: async () => {
            return GridSystem.init();
        },
        dependencies: ['Notification', 'I18n', 'Utils'],
        timeout: 5000
    },

    // ==================== 第四层：应用功能模块 ====================
    {
        name: 'Background',
        initFunction: async () => {
            return backgroundManager.initialize();
        },
        dependencies: ['Utils', 'Notification'],
        timeout: 8000
    },

    {
        name: 'SearchEngine',
        initFunction: async () => {
            return SearchEngineAPI.initialize();
        },
        dependencies: ['I18n', 'Utils', 'Menu', 'Notification'],
        timeout: 5000
    },

    {
        name: 'Bookmarks',
        initFunction: async () => {
            return BookmarkManager.init();
        },
        dependencies: ['Utils', 'I18n', 'Notification'],
        timeout: 5000
    },

    {
        name: 'Clock',
        initFunction: async () => {
            return ClockWidget.init();
        },
        dependencies: ['I18n', 'Utils'],
        timeout: 3000
    },

    {
        name: 'ThemeManager',
        initFunction: async () => {
            try {
                if (typeof ThemeManager !== 'undefined' && typeof ThemeManager.init === 'function') {
                    return ThemeManager.init();
                }
            } catch (error) {
                console.warn('ThemeManager 模块加载失败:', error);
            }
            return Promise.resolve();
        },
        dependencies: ['Utils', 'I18n'],
        timeout: 3000
    },

    {
        name: 'AI',
        initFunction: async () => {
            return AI.initialize();
        },
        dependencies: ['I18n', 'Utils', 'Menu', 'Notification'],
        timeout: 8000
    },

    {
        name: 'DataSync',
        initFunction: async () => {
            try {
                if (typeof DataSync !== 'undefined' && typeof DataSync.init === 'function') {
                    return DataSync.init();
                }
            } catch (error) {
                console.warn('DataSync 模块加载失败:', error);
            }
            return Promise.resolve();
        },
        dependencies: ['Utils', 'I18n'],
        timeout: 5000
    },

    // ==================== 第五层：复合系统模块 ====================
    {
        name: 'Settings',
        initFunction: () => {
            // Settings 依赖几乎所有其他模块，但通常不需要异步初始化
            return Promise.resolve();
        },
        dependencies: ['Menu', 'Utils', 'GridSystem', 'I18n', 'SearchEngine', 'Notification', 'AI', 'DataSync', 'ThemeManager'],
        timeout: 3000
    },

    // ==================== 第六层：小部件系统（最后初始化） ====================
    {
        name: 'WidgetRegistry',
        initFunction: async () => {            // WidgetRegistry是静态的，只需要确保注册完成
            // 小部件注册已在widgetRegistry.js中完成，这里只确保全局可访问
            
            // 确保全局可访问
            window.WidgetRegistry = WidgetRegistry;
            
            return Promise.resolve();
        },
        dependencies: ['I18n'],
        timeout: 3000
    },
    
    {
        name: 'WidgetSystem',
        initFunction: async () => {
            return WidgetSystem.init();
        },
        dependencies: ['I18n', 'Utils', 'Menu', 'Notification', 'GridSystem', 'WidgetRegistry'],
        timeout: 10000
    }
];

/**
 * 获取模块依赖图的可视化表示
 * @returns {string} 依赖图的文本表示
 */
export function getDependencyGraph() {
    let graph = "模块依赖关系图:\n";
    graph += "==================\n";
    
    moduleConfigs.forEach(config => {
        graph += `${config.name}:\n`;
        if (config.dependencies.length > 0) {
            graph += `  依赖: ${config.dependencies.join(', ')}\n`;
        } else {
            graph += `  依赖: 无\n`;
        }
        graph += `  超时: ${config.timeout}ms\n`;
        graph += "---\n";
    });
    
    return graph;
}

/**
 * 验证模块配置的完整性
 * @returns {Object} 验证结果
 */
export function validateModuleConfigs() {
    const result = {
        valid: true,
        errors: [],
        warnings: []
    };

    const moduleNames = new Set(moduleConfigs.map(config => config.name));
    
    moduleConfigs.forEach(config => {
        // 检查必需的属性
        if (!config.name) {
            result.errors.push('模块缺少name属性');
            result.valid = false;
        }
        
        if (!config.initFunction || typeof config.initFunction !== 'function') {
            result.errors.push(`模块 ${config.name} 缺少有效的initFunction`);
            result.valid = false;
        }
        
        // 检查依赖是否存在
        if (config.dependencies) {
            config.dependencies.forEach(dep => {
                if (!moduleNames.has(dep)) {
                    result.warnings.push(`模块 ${config.name} 依赖的模块 ${dep} 未在配置中找到`);
                }
            });
        }
        
        // 检查超时时间
        if (config.timeout && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
            result.warnings.push(`模块 ${config.name} 的超时时间设置无效`);
        }
    });
    
    return result;
}
