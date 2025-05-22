/**
 * 计数器小部件模块
 */

export default {
    /**
     * 初始化计数器小部件
     * @param {HTMLElement} container - 小部件容器元素
     * @param {Object} data - 小部件数据
     * @returns {Promise<void>}
     */
    initialize: async function(container, data = {}) {
        console.log('初始化计数器小部件:', data);
        
        // 创建小部件内容
        const widgetContent = document.createElement('div');
        widgetContent.className = 'counter-widget';
        
        // 初始计数值，使用保存的值或默认值0
        const count = data.count || 0;
        
        // 创建小部件结构
        widgetContent.innerHTML = `
            <div class="counter-display">${count}</div>
            <div class="counter-controls">
                <button class="counter-button decrease">-</button>
                <button class="counter-button increase">+</button>
            </div>
            <div class="counter-title">${data.title || '计数器'}</div>
            <div class="counter-reset">重置</div>
        `;
        
        // 添加到容器
        container.appendChild(widgetContent);
        
        // 保存初始数据
        container.widgetData = {
            ...data,
            count: count
        };
        
        // 添加交互事件
        this.addEventListeners(container, widgetContent);
    },
    
    /**
     * 添加事件监听
     * @param {HTMLElement} container - 小部件容器
     * @param {HTMLElement} content - 小部件内容元素
     */
    addEventListeners: function(container, content) {
        // 计数显示元素
        const countDisplay = content.querySelector('.counter-display');
        
        // 增加按钮
        content.querySelector('.increase').addEventListener('click', (e) => {
            e.stopPropagation();
            const currentCount = container.widgetData.count || 0;
            const newCount = currentCount + 1;
            
            // 更新显示和数据
            countDisplay.textContent = newCount;
            container.widgetData.count = newCount;
            
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        });
        
        // 减少按钮
        content.querySelector('.decrease').addEventListener('click', (e) => {
            e.stopPropagation();
            const currentCount = container.widgetData.count || 0;
            const newCount = Math.max(0, currentCount - 1); // 不允许负数
            
            // 更新显示和数据
            countDisplay.textContent = newCount;
            container.widgetData.count = newCount;
            
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        });
        
        // 重置按钮
        content.querySelector('.counter-reset').addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 重置为0
            countDisplay.textContent = '0';
            container.widgetData.count = 0;
            
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        });
    }
};