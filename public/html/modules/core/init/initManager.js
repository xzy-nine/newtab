/**
 * 初始化管理器
 * 负责按依赖关系树状初始化所有模块
 */

/**
 * 模块初始化状态
 */
const ModuleStatus = {
    PENDING: 'pending',
    INITIALIZING: 'initializing',
    INITIALIZED: 'initialized',
    ERROR: 'error'
};

/**
 * 模块定义
 */
class ModuleDefinition {
    constructor(name, initFunction, dependencies = [], timeout = 10000) {
        this.name = name;
        this.initFunction = initFunction;
        this.dependencies = dependencies;
        this.timeout = timeout;
        this.status = ModuleStatus.PENDING;
        this.error = null;
        this.initPromise = null;
    }
}

/**
 * 初始化管理器
 */
export class InitManager {
    constructor() {
        this.modules = new Map();
        this.initializationOrder = [];
        this.initialized = new Set();
        this.initializing = new Set();
        this.failed = new Set();
        this.progressCallback = null;
    }

    /**
     * 注册模块
     * @param {string} name - 模块名称
     * @param {Function} initFunction - 初始化函数
     * @param {Array<string>} dependencies - 依赖的模块名称数组
     * @param {number} timeout - 超时时间(毫秒)
     */
    registerModule(name, initFunction, dependencies = [], timeout = 10000) {
        const module = new ModuleDefinition(name, initFunction, dependencies, timeout);
        this.modules.set(name, module);
        return this;
    }

    /**
     * 批量注册模块
     * @param {Array} moduleConfigs - 模块配置数组
     */
    registerModules(moduleConfigs) {
        moduleConfigs.forEach(config => {
            this.registerModule(
                config.name,
                config.initFunction,
                config.dependencies || [],
                config.timeout || 10000
            );
        });
        return this;
    }

    /**
     * 设置进度回调
     * @param {Function} callback - 进度回调函数
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
        return this;
    }

    /**
     * 检查依赖关系是否有循环依赖
     * @param {string} moduleName - 模块名称
     * @param {Set} visited - 已访问的模块
     * @param {Set} recursionStack - 递归栈
     * @returns {boolean} 是否有循环依赖
     */
    hasCyclicDependency(moduleName, visited = new Set(), recursionStack = new Set()) {
        if (!this.modules.has(moduleName)) {
            return false;
        }

        visited.add(moduleName);
        recursionStack.add(moduleName);

        const module = this.modules.get(moduleName);
        for (const dependency of module.dependencies) {
            if (!visited.has(dependency)) {
                if (this.hasCyclicDependency(dependency, visited, recursionStack)) {
                    return true;
                }
            } else if (recursionStack.has(dependency)) {
                return true;
            }
        }

        recursionStack.delete(moduleName);
        return false;
    }

    /**
     * 拓扑排序，确定初始化顺序
     * @returns {Array<string>} 排序后的模块名称数组
     */
    topologicalSort() {
        const visited = new Set();
        const tempMark = new Set();
        const result = [];

        const visit = (moduleName) => {
            if (tempMark.has(moduleName)) {
                throw new Error(`检测到循环依赖: ${moduleName}`);
            }
            if (visited.has(moduleName)) {
                return;
            }

            tempMark.add(moduleName);
            const module = this.modules.get(moduleName);
            
            if (module) {
                for (const dependency of module.dependencies) {
                    if (this.modules.has(dependency)) {
                        visit(dependency);
                    } else {
                        console.warn(`模块 ${moduleName} 依赖的模块 ${dependency} 未注册`);
                    }
                }
            }

            tempMark.delete(moduleName);
            visited.add(moduleName);
            result.push(moduleName);
        };

        // 访问所有模块
        for (const moduleName of this.modules.keys()) {
            if (!visited.has(moduleName)) {
                visit(moduleName);
            }
        }

        return result;
    }

    /**
     * 带超时的模块初始化
     * @param {ModuleDefinition} module - 模块定义
     * @returns {Promise} 初始化Promise
     */
    async initializeModuleWithTimeout(module) {
        return Promise.race([
            module.initFunction(),
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`模块 ${module.name} 初始化超时 (${module.timeout}ms)`));
                }, module.timeout);
            })
        ]);
    }

    /**
     * 初始化单个模块
     * @param {string} moduleName - 模块名称
     * @returns {Promise} 初始化Promise
     */
    async initializeModule(moduleName) {
        const module = this.modules.get(moduleName);
        if (!module) {
            throw new Error(`模块 ${moduleName} 未注册`);
        }

        // 如果已经初始化过，直接返回
        if (module.status === ModuleStatus.INITIALIZED) {
            return Promise.resolve();
        }

        // 如果正在初始化，等待初始化完成
        if (module.status === ModuleStatus.INITIALIZING && module.initPromise) {
            return module.initPromise;
        }

        // 如果之前初始化失败，重新抛出错误
        if (module.status === ModuleStatus.ERROR) {
            throw module.error;
        }

        // 检查依赖是否都已初始化
        for (const dependency of module.dependencies) {
            if (!this.initialized.has(dependency)) {
                await this.initializeModule(dependency);
            }
        }

        // 开始初始化
        module.status = ModuleStatus.INITIALIZING;
        this.initializing.add(moduleName);

        try {
            console.log(`开始初始化模块: ${moduleName}`);
            
            module.initPromise = this.initializeModuleWithTimeout(module);
            await module.initPromise;
            
            module.status = ModuleStatus.INITIALIZED;
            this.initialized.add(moduleName);
            this.initializing.delete(moduleName);
            
            console.log(`模块初始化成功: ${moduleName}`);
            
            // 调用进度回调
            if (this.progressCallback) {
                const progress = (this.initialized.size / this.modules.size) * 100;
                this.progressCallback(progress, moduleName, 'success');
            }
            
        } catch (error) {
            module.status = ModuleStatus.ERROR;
            module.error = error;
            this.failed.add(moduleName);
            this.initializing.delete(moduleName);
            
            console.error(`模块初始化失败: ${moduleName}`, error);
            
            // 调用进度回调
            if (this.progressCallback) {
                const progress = (this.initialized.size / this.modules.size) * 100;
                this.progressCallback(progress, moduleName, 'error', error);
            }
            
            throw error;
        }
    }

    /**
     * 初始化所有模块
     * @param {Object} options - 初始化选项
     * @returns {Promise} 初始化Promise
     */
    async initializeAll(options = {}) {
        const { 
            continueOnError = false,
            maxRetries = 0
        } = options;

        try {
            // 检查循环依赖
            for (const moduleName of this.modules.keys()) {
                if (this.hasCyclicDependency(moduleName)) {
                    throw new Error(`检测到循环依赖，涉及模块: ${moduleName}`);
                }
            }

            // 计算初始化顺序
            this.initializationOrder = this.topologicalSort();
            console.log('模块初始化顺序:', this.initializationOrder);

            // 按顺序初始化模块
            for (const moduleName of this.initializationOrder) {
                try {
                    await this.initializeModule(moduleName);
                } catch (error) {
                    if (continueOnError) {
                        console.warn(`模块 ${moduleName} 初始化失败，但继续初始化其他模块:`, error);
                        continue;
                    } else {
                        throw error;
                    }
                }
            }

            // 重试失败的模块
            if (maxRetries > 0 && this.failed.size > 0) {
                await this.retryFailedModules(maxRetries);
            }

            console.log(`初始化完成，成功: ${this.initialized.size}, 失败: ${this.failed.size}`);
            
        } catch (error) {
            console.error('模块初始化过程中发生错误:', error);
            throw error;
        }
    }

    /**
     * 重试失败的模块
     * @param {number} maxRetries - 最大重试次数
     */
    async retryFailedModules(maxRetries) {
        const failedModules = Array.from(this.failed);
        
        for (let retry = 0; retry < maxRetries; retry++) {
            if (this.failed.size === 0) break;
            
            console.log(`第 ${retry + 1} 次重试失败的模块...`);
            
            for (const moduleName of failedModules) {
                if (this.failed.has(moduleName)) {
                    try {
                        // 重置模块状态
                        const module = this.modules.get(moduleName);
                        if (module) {
                            module.status = ModuleStatus.PENDING;
                            module.error = null;
                            module.initPromise = null;
                        }
                        
                        await this.initializeModule(moduleName);
                        console.log(`重试成功: ${moduleName}`);
                    } catch (error) {
                        console.warn(`重试失败: ${moduleName}`, error);
                    }
                }
            }
        }
    }

    /**
     * 获取初始化状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            total: this.modules.size,
            initialized: this.initialized.size,
            initializing: this.initializing.size,
            failed: this.failed.size,
            pending: this.modules.size - this.initialized.size - this.initializing.size - this.failed.size,
            modules: {
                initialized: Array.from(this.initialized),
                initializing: Array.from(this.initializing),
                failed: Array.from(this.failed)
            }
        };
    }

    /**
     * 重置初始化状态
     */
    reset() {
        this.initialized.clear();
        this.initializing.clear();
        this.failed.clear();
        
        // 重置所有模块状态
        for (const module of this.modules.values()) {
            module.status = ModuleStatus.PENDING;
            module.error = null;
            module.initPromise = null;
        }
    }

    /**
     * 检查模块是否已初始化
     * @param {string} moduleName - 模块名称
     * @returns {boolean} 是否已初始化
     */
    isInitialized(moduleName) {
        return this.initialized.has(moduleName);
    }

    /**
     * 等待特定模块初始化完成
     * @param {string} moduleName - 模块名称
     * @returns {Promise} 初始化Promise
     */
    async waitForModule(moduleName) {
        if (this.isInitialized(moduleName)) {
            return Promise.resolve();
        }
        
        return this.initializeModule(moduleName);
    }

    /**
     * 等待多个模块初始化完成
     * @param {Array<string>} moduleNames - 模块名称数组
     * @returns {Promise} 初始化Promise
     */
    async waitForModules(moduleNames) {
        const promises = moduleNames.map(name => this.waitForModule(name));
        return Promise.all(promises);
    }
}

// 创建全局初始化管理器实例
export const initManager = new InitManager();
