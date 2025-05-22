/**
 * 计数器小部件模块
 */

import { Utils } from '../utils.js';

// 默认计数器数据
const DEFAULT_DATA = {
    count: 0,
    name: '计数器'
};

/**
 * 计数器小部件API
 */
export default {
    /**
     * 初始化计数器小部件
     * @param {HTMLElement} container - 小部件容器元素
     * @param {Object} savedData - 保存的小部件数据
     * @returns {Promise<void>}
     */
    async initialize(container, savedData = {}) {
        // 合并默认数据和保存的数据
        const data = { ...DEFAULT_DATA, ...savedData };
        
        // 保存数据到容器
        container.widgetData = data;
        
        // 创建计数器UI
        this.createCounterUI(container);
        
        return Promise.resolve();
    },
    
    /**
     * 创建计数器UI
     * @param {HTMLElement} container - 小部件容器元素
     */
    createCounterUI(container) {
        const data = container.widgetData;
        
        // 清空容器
        container.innerHTML = '';
        
        // 创建计数器标题
        const titleDiv = Utils.createElement('div', 'counter-title');
        const title = Utils.createElement('span', '', {}, data.name || '计数器');
        titleDiv.appendChild(title);
        
        // 创建可编辑的标题
        title.addEventListener('dblclick', () => {
            const input = Utils.createElement('input', '', {
                type: 'text',
                value: data.name
            });
            
            input.addEventListener('blur', () => {
                data.name = input.value || '计数器';
                this.updateCounter(container);
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                }
            });
            
            titleDiv.innerHTML = '';
            titleDiv.appendChild(input);
            input.focus();
            input.select();
        });
        
        // 创建计数值显示区域
        const countDiv = Utils.createElement('div', 'counter-value', {}, data.count.toString());
        
        // 创建按钮区域
        const buttonsDiv = Utils.createElement('div', 'counter-buttons widget-functional-area');
        
        // 减少按钮
        const decrementBtn = Utils.createElement('button', 'counter-btn counter-decrement', {}, '-');
        decrementBtn.addEventListener('click', () => {
            data.count--;
            this.updateCounter(container);
        });
        
        // 重置按钮
        const resetBtn = Utils.createElement('button', 'counter-btn counter-reset', {}, '0');
        resetBtn.addEventListener('click', () => {
            data.count = 0;
            this.updateCounter(container);
        });
        
        // 增加按钮
        const incrementBtn = Utils.createElement('button', 'counter-btn counter-increment', {}, '+');
        incrementBtn.addEventListener('click', () => {
            data.count++;
            this.updateCounter(container);
        });
        
        // 添加按钮到按钮区域
        buttonsDiv.appendChild(decrementBtn);
        buttonsDiv.appendChild(resetBtn);
        buttonsDiv.appendChild(incrementBtn);
        
        // 添加所有元素到容器
        container.appendChild(titleDiv);
        container.appendChild(countDiv);
        container.appendChild(buttonsDiv);
    },
    
    /**
     * 更新计数器显示
     * @param {HTMLElement} container - 小部件容器元素
     */
    updateCounter(container) {
        const data = container.widgetData;
        
        // 更新标题
        const titleElement = container.querySelector('.counter-title');
        if (titleElement && !titleElement.querySelector('input')) {
            titleElement.innerHTML = '';
            titleElement.appendChild(Utils.createElement('span', '', {}, data.name));
        }
        
        // 更新计数值
        const countElement = container.querySelector('.counter-value');
        if (countElement) {
            countElement.textContent = data.count.toString();
        }
        
        // 触发数据保存
        this.triggerSave(container);
    },
    
    /**
     * 触发保存操作
     * @param {HTMLElement} container - 小部件容器元素
     */
    triggerSave(container) {
        // 创建自定义事件通知小部件系统保存数据
        const event = new CustomEvent('widget-data-changed', {
            detail: {
                widget: container,
                data: container.widgetData
            }
        });
        document.dispatchEvent(event);
    }
};