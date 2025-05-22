/**
 * 计数器小部件模块
 */

export default {
    // 小部件尺寸配置
    config: {
        default: {
            width: 135,
            height: 100
        },
        min: {
            width: 135,
            height: 100
        },
        max: {  // 添加最大尺寸限制
            width: 300,
            height: 300
        }
    },
    
    /**
     * 初始化计数器小部件
     * @param {HTMLElement} container - 小部件容器元素
     * @param {Object} data - 小部件数据
     * @returns {Promise<void>}
     */
    initialize: async function(container, data = {}) {
        console.log('初始化计数器小部件:', data);
        
        // 设置默认尺寸（确保实际应用）
        if (!container.style.width || parseInt(container.style.width) < this.config.default.width) {
            container.style.width = `${this.config.default.width}px`;
        }
        if (!container.style.height || parseInt(container.style.height) < this.config.default.height) {
            container.style.height = `${this.config.default.height}px`;
        }
        
        // 创建小部件内容
        const widgetContent = document.createElement('div');
        widgetContent.className = 'counter-widget';
        
        // 初始计数值，使用保存的值或默认值0
        const count = data.count || 0;
        const title = data.title || '计数';
        
        // 创建小部件结构 - 注意结构顺序很重要
        widgetContent.innerHTML = `
            <div class="counter-title">${title}</div>
            <div class="counter-controls">
                <button class="counter-button decrease">-</button>
                <div class="counter-display">${count}</div>
                <button class="counter-button increase">+</button>
            </div>
            <div class="counter-reset">重置</div>
        `;
        
        // 添加到容器
        container.appendChild(widgetContent);
        
        // 保存初始数据
        container.widgetData = {
            ...data,
            count: count,
            title: title
        };
        
        // 添加交互事件
        this.addEventListeners(container, widgetContent);
        
        // 初始化后检查并调整大小
        this.adjustSize(container);
        
        // 添加调整大小的事件监听器
        const resizeObserver = new ResizeObserver(() => {
            this.adjustSize(container);
        });
        resizeObserver.observe(container);
    },
    
    /**
     * 调整小部件大小和布局
     * @param {HTMLElement} container - 小部件容器
     */
    adjustSize: function(container) {
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        const widgetContent = container.querySelector('.counter-widget');
        
        if (!widgetContent) return;
        
        // 强制保持最小尺寸
        if (width < this.config.min.width) {
            container.style.width = `${this.config.min.width}px`;
        }
        if (height < this.config.min.height) {
            container.style.height = `${this.config.min.height}px`;
        }
        
        // 添加最大尺寸限制
        if (width > this.config.max.width) {
            container.style.width = `${this.config.max.width}px`;
        }
        if (height > this.config.max.height) {
            container.style.height = `${this.config.max.height}px`;
        }
        
        // 确保小部件内容居中显示
        widgetContent.style.display = 'flex';
        widgetContent.style.flexDirection = 'column';
        widgetContent.style.justifyContent = 'center';
        widgetContent.style.alignItems = 'center';
        widgetContent.style.height = '100%';
        widgetContent.style.width = '100%';
        
        // 根据容器大小应用不同的布局类
        widgetContent.classList.remove('compact-layout', 'default-layout', 'large-layout');
        
        // 更新布局类判断逻辑 - 使用实际容器尺寸
        const actualWidth = container.offsetWidth;
        const actualHeight = container.offsetHeight;
        
        // 调整为合理的布局阈值
        if (actualWidth <= this.config.min.width || actualHeight <= this.config.min.height) {
            widgetContent.classList.add('compact-layout');
        } else if (actualWidth >= 200 || actualHeight >= 170) {
            widgetContent.classList.add('large-layout');
        } else {
            widgetContent.classList.add('default-layout');
        }
        
        // 调整字体大小适应容器
        const display = container.querySelector('.counter-display');
        const title = container.querySelector('.counter-title');
        
        if (display) {
            const value = display.textContent || '0';
            const fontSize = this.calculateOptimalFontSize(value.length, actualWidth, actualHeight);
            display.style.fontSize = `${fontSize}px`;
        }
        
        if (title) {
            // 标题字体大小随容器大小调整
            const titleFontSize = Math.max(12, Math.min(16, actualWidth / 14));
            title.style.fontSize = `${titleFontSize}px`;
        }
        
        // 强制触发布局刷新
        container.style.display = 'none';
        container.offsetHeight; // 强制回流
        container.style.display = '';
    },
    
    /**
     * 计算最佳字体大小
     * @param {number} textLength - 文本长度
     * @param {number} width - 容器宽度
     * @param {number} height - 容器高度
     * @returns {number} 字体大小
     */
    calculateOptimalFontSize: function(textLength, width, height) {
        // 基础大小随容器尺寸动态调整
        const baseSize = Math.min(width, height) / 4;
        
        // 根据文本长度和容器大小调整
        let adjustedSize = baseSize;
        
        if (textLength > 3) {
            // 每增加一个字符减小字体
            adjustedSize -= (textLength - 3) * (baseSize / 10);
        }
        
        // 根据容器宽度调整
        adjustedSize = Math.min(adjustedSize, width / 4.5);
        
        // 根据容器高度调整
        adjustedSize = Math.min(adjustedSize, height / 3.5);
        
        // 保持合理的字体大小范围
        return Math.max(16, Math.min(adjustedSize, Math.max(64, width / 3)));
    },
    
    /**
     * 添加事件监听
     * @param {HTMLElement} container - 小部件容器
     * @param {HTMLElement} content - 小部件内容元素
     */
    addEventListeners: function(container, content) {
        // 计数显示元素
        const countDisplay = content.querySelector('.counter-display');
        // 标题元素
        const titleElement = content.querySelector('.counter-title');
        
        // 增加按钮
        content.querySelector('.increase').addEventListener('click', (e) => {
            e.stopPropagation();
            const currentCount = container.widgetData.count || 0;
            const newCount = currentCount + 1;
            
            // 更新显示和数据
            countDisplay.textContent = newCount;
            container.widgetData.count = newCount;
            
            // 根据数字长度调整字体大小
            const width = container.offsetWidth;
            const height = container.offsetHeight;
            const fontSize = this.calculateOptimalFontSize(newCount.toString().length, width, height);
            countDisplay.style.fontSize = `${fontSize}px`;
            
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
            
            // 根据数字长度调整字体大小
            const width = container.offsetWidth;
            const height = container.offsetHeight;
            const fontSize = this.calculateOptimalFontSize(newCount.toString().length, width, height);
            countDisplay.style.fontSize = `${fontSize}px`;
            
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        });
        
        // 重置按钮
        content.querySelector('.counter-reset').addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 重置为0
            countDisplay.textContent = '0';
            container.widgetData.count = 0;
            
            // 调整字体大小回到默认
            const width = container.offsetWidth;
            const height = container.offsetHeight;
            const fontSize = this.calculateOptimalFontSize(1, width, height);
            countDisplay.style.fontSize = `${fontSize}px`;
            
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        });
        
        // 双击标题进入编辑模式
        titleElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            
            // 已经在编辑状态则不处理
            if (titleElement.classList.contains('editing')) return;
            
            const currentTitle = container.widgetData.title || '计数';
            
            // 添加编辑类
            titleElement.classList.add('editing');
            
            // 创建输入框
            const inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.value = currentTitle;
            inputElement.maxLength = 20; // 长度限制
            
            // 清空标题元素原内容并添加输入框
            titleElement.textContent = '';
            titleElement.appendChild(inputElement);
            
            // 自动聚焦输入框
            inputElement.focus();
            
            // 保存标题的函数
            const saveTitle = () => {
                let newTitle = inputElement.value.trim() || '计数';
                // 根据容器大小决定标题长度
                const maxLength = container.offsetWidth < 180 ? 10 : 15;
                
                if (newTitle.length > maxLength) {
                    newTitle = newTitle.substring(0, maxLength) + '...';
                }
                
                // 更新标题和数据
                titleElement.textContent = newTitle;
                container.widgetData.title = newTitle;
                
                // 移除编辑类
                titleElement.classList.remove('editing');
                
                // 触发数据变更事件
                document.dispatchEvent(new CustomEvent('widget-data-changed'));
            };
            
            // Enter键保存
            inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitle();
                }
            });
            
            // 失焦保存
            inputElement.addEventListener('blur', saveTitle);
            
            // 阻止冒泡，避免立即触发其他点击事件
            inputElement.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
        
        // 点击其他地方关闭编辑
        document.addEventListener('click', (e) => {
            // 如果不是点击在输入框内，且标题正在编辑状态
            if (
                titleElement.classList.contains('editing') && 
                !titleElement.contains(e.target)
            ) {
                // 获取输入框并模拟blur事件
                const inputElement = titleElement.querySelector('input');
                if (inputElement) {
                    inputElement.blur();
                }
            }
        });
    }
};