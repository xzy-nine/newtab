/**
 * 计数器小部件模块
 */

export default {
    // 小部件元数据
    metadata: {
        name: '计数器',
        description: '简单的计数器小部件，可增加、减少和重置数值',
        version: '1.0.0',
        author: 'System'
    },
    
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
        
        // 设置默认尺寸（确保实际应用）
        if (!container.style.width || parseInt(container.style.width) < this.config.default.width) {
            container.style.width = `${this.config.default.width}px`;
        }
        if (!container.style.height || parseInt(container.style.height) < this.config.default.height) {
            container.style.height = `${this.config.default.height}px`;
        }
          // 创建小部件内容
        const widgetContent = document.createElement('div');
        widgetContent.className = 'counter-widget widget-base';
        
        // 初始计数值，使用保存的值或默认值0
        const count = data.count || 0;
        const title = data.title || '计数';
          // 创建小部件结构 - 使用公共样式类
        widgetContent.innerHTML = `
            <div class="counter-title widget-title">${title}</div>
            <div class="counter-controls widget-controls widget-controls-horizontal">
                <button class="counter-button decrease widget-btn widget-btn-round">-</button>
                <div class="counter-display widget-display">${count}</div>
                <button class="counter-button increase widget-btn widget-btn-round">+</button>
            </div>
            <div class="counter-reset widget-btn widget-btn-small widget-btn-normal">重置</div>
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
        
        // 立即进行一次大小调整，确保初始布局正确
        setTimeout(() => {
            this.adjustSize(container);
        }, 0);
        
        // 添加调整大小的事件监听器
        const resizeObserver = new ResizeObserver(() => {
            this.adjustSize(container);
        });
        resizeObserver.observe(container);
        
        // 保存resize observer以便在销毁时清理
        container._resizeObserver = resizeObserver;
    },
    
    /**
     * 小部件被销毁时调用
     * @param {HTMLElement} container - 小部件容器
     */
    destroy: function(container) {
        // 清除任何可能的resize observer
        if (container._resizeObserver) {
            container._resizeObserver.disconnect();
            container._resizeObserver = null;
        }
        
        // 清除可能存在的长按定时器
        if (container._pressTimer) clearTimeout(container._pressTimer);
        if (container._longPressInterval) clearInterval(container._longPressInterval);
        if (container._longPressSpeedupTimer) clearTimeout(container._longPressSpeedupTimer);
    },
    
    /**
     * 保存小部件数据
     * @param {HTMLElement} container - 小部件容器
     * @returns {Object} 要保存的数据
     */
    getData: function(container) {
        return container.widgetData || {};
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
        
        // 调整为合理的布局阈值，确保在最小尺寸下使用紧凑布局
        if (actualWidth <= this.config.min.width || actualHeight <= this.config.min.height) {
            widgetContent.classList.add('compact-layout');
            // 在紧凑模式下，减少容器内边距以节省空间
            container.style.setProperty('--widget-padding', '6px');
        } else if (actualWidth >= 200 || actualHeight >= 170) {
            widgetContent.classList.add('large-layout');
            // 恢复默认内边距
            container.style.removeProperty('--widget-padding');
        } else {
            widgetContent.classList.add('default-layout');
            // 恢复默认内边距
            container.style.removeProperty('--widget-padding');
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
            // 标题字体大小随容器大小调整，在紧凑模式下确保可读性
            let titleFontSize;
            if (widgetContent.classList.contains('compact-layout')) {
                // 紧凑模式下使用固定的较小字体
                titleFontSize = 11;
            } else {
                // 其他模式下动态调整字体大小
                titleFontSize = Math.max(12, Math.min(16, actualWidth / 14));
            }
            title.style.fontSize = `${titleFontSize}px`;
            
            // 确保标题在紧凑模式下有足够的高度
            if (widgetContent.classList.contains('compact-layout')) {
                title.style.minHeight = '13px';
                title.style.lineHeight = '1.2';
            } else {
                title.style.removeProperty('min-height');
                title.style.removeProperty('line-height');
            }
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
        // 改进字体大小计算逻辑，更加注重数字长度
        const baseSize = Math.min(width, height) / 4;
        
        // 字体大小随数位数指数级缩小
        const digitsFactor = Math.pow(0.8, Math.max(0, textLength - 2));
        let adjustedSize = baseSize * digitsFactor;
        
        // 根据容器宽度进一步调整
        adjustedSize = Math.min(adjustedSize, width / (4 + textLength * 0.8));
        
        // 根据容器高度调整
        adjustedSize = Math.min(adjustedSize, height / 3.5);
        
        // 保持合理的字体大小范围
        return Math.max(14, Math.min(adjustedSize, 64));
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
        // 重置按钮元素
        const resetButton = content.querySelector('.counter-reset');
        
        // 长按相关变量 - 保存到容器中以便清理
        container._pressTimer = null;
        container._isLongPressing = false;
        container._longPressInterval = null;
        container._longPressSpeed = 200; // 初始长按速度(ms)
        container._longPressSpeedupTimer = null;
        container._lastButtonReleaseTime = 0; // 记录上次按钮释放时间
        
        // 增加计数的函数
        const increaseCount = () => {
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
            
            // 重置按钮恢复正常状态
            resetButton.textContent = '重置';
            resetButton.classList.remove('confirm');
            
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        };
        
        // 减少计数的函数
        const decreaseCount = () => {
            const currentCount = container.widgetData.count || 0;
            const newCount = currentCount - 1; // 移除最小值限制，允许负数
            
            // 更新显示和数据
            countDisplay.textContent = newCount;
            container.widgetData.count = newCount;
            
            // 根据数字长度调整字体大小
            const width = container.offsetWidth;
            const height = container.offsetHeight;
            const fontSize = this.calculateOptimalFontSize(newCount.toString().length, width, height);
            countDisplay.style.fontSize = `${fontSize}px`;
            
            // 重置按钮恢复正常状态
            resetButton.textContent = '重置';
            resetButton.classList.remove('confirm');
            
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        };
        
        // 清除所有长按定时器
        const clearAllTimers = () => {
            if (container._pressTimer) clearTimeout(container._pressTimer);
            if (container._longPressInterval) clearInterval(container._longPressInterval);
            if (container._longPressSpeedupTimer) clearTimeout(container._longPressSpeedupTimer);
            container._pressTimer = null;
            container._longPressInterval = null;
            container._longPressSpeedupTimer = null;
            container._isLongPressing = false;
            
            // 记录按钮释放时间
            container._lastButtonReleaseTime = Date.now();
            
            // 只有当超过1秒没有按压时才重置速度
            setTimeout(() => {
                if (Date.now() - container._lastButtonReleaseTime >= 5000) {
                    container._longPressSpeed = 200; // 重置速度
                }
            }, 1000);
        };
        
        // 增加按钮
        const increaseButton = content.querySelector('.increase');
        
        // 鼠标按下/触摸开始
        increaseButton.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault(); // 防止文本选择
            
            // 先执行一次计数增加
            increaseCount();
            
            // 设置长按定时器
            container._pressTimer = setTimeout(() => {
                container._isLongPressing = true;
                // 开始连续增加
                container._longPressInterval = setInterval(increaseCount, container._longPressSpeed);
                
                // 设置加速定时器 - 每隔1秒加快速度
                container._longPressSpeedupTimer = setTimeout(function speedup() {
                    if (container._longPressSpeed > 50) {
                        container._longPressSpeed = Math.max(50, container._longPressSpeed - 30);
                        // 清除旧的间隔并创建新的
                        clearInterval(container._longPressInterval);
                        container._longPressInterval = setInterval(increaseCount, container._longPressSpeed);
                        // 继续加速
                        container._longPressSpeedupTimer = setTimeout(speedup, 1000);
                    }
                }, 1000);
                
            }, 500); // 长按阈值500ms
        });
        
        // 触摸开始 - 针对移动设备
        increaseButton.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault(); // 防止文本选择和滚动
            
            // 先执行一次计数增加
            increaseCount();
            
            // 设置长按定时器
            container._pressTimer = setTimeout(() => {
                container._isLongPressing = true;
                // 开始连续增加
                container._longPressInterval = setInterval(increaseCount, container._longPressSpeed);
                
                // 设置加速定时器
                container._longPressSpeedupTimer = setTimeout(function speedup() {
                    if (container._longPressSpeed > 50) {
                        container._longPressSpeed = Math.max(50, container._longPressSpeed - 30);
                        // 清除旧的间隔并创建新的
                        clearInterval(container._longPressInterval);
                        container._longPressInterval = setInterval(increaseCount, container._longPressSpeed);
                        // 继续加速
                        container._longPressSpeedupTimer = setTimeout(speedup, 1000);
                    }
                }, 1000);
                
            }, 500); // 长按阈值500ms
        });
        
        // 减少按钮
        const decreaseButton = content.querySelector('.decrease');
        
        // 鼠标按下/触摸开始
        decreaseButton.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault(); // 防止文本选择
            
            // 先执行一次计数减少
            decreaseCount();
            
            // 设置长按定时器
            container._pressTimer = setTimeout(() => {
                container._isLongPressing = true;
                // 开始连续减少
                container._longPressInterval = setInterval(decreaseCount, container._longPressSpeed);
                
                // 设置加速定时器
                container._longPressSpeedupTimer = setTimeout(function speedup() {
                    if (container._longPressSpeed > 50) {
                        container._longPressSpeed = Math.max(50, container._longPressSpeed - 30);
                        // 清除旧的间隔并创建新的
                        clearInterval(container._longPressInterval);
                        container._longPressInterval = setInterval(decreaseCount, container._longPressSpeed);
                        // 继续加速
                        container._longPressSpeedupTimer = setTimeout(speedup, 1000);
                    }
                }, 1000);
                
            }, 500); // 长按阈值500ms
        });
        
        // 触摸开始 - 针对移动设备
        decreaseButton.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault(); // 防止文本选择和滚动
            
            // 先执行一次计数减少
            decreaseCount();
            
            // 设置长按定时器
            container._pressTimer = setTimeout(() => {
                container._isLongPressing = true;
                // 开始连续减少
                container._longPressInterval = setInterval(decreaseCount, container._longPressSpeed);
                
                // 设置加速定时器
                container._longPressSpeedupTimer = setTimeout(function speedup() {
                    if (container._longPressSpeed > 50) {
                        container._longPressSpeed = Math.max(50, container._longPressSpeed - 30);
                        // 清除旧的间隔并创建新的
                        clearInterval(container._longPressInterval);
                        container._longPressInterval = setInterval(decreaseCount, container._longPressSpeed);
                        // 继续加速
                        container._longPressSpeedupTimer = setTimeout(speedup, 1000);
                    }
                }, 1000);
                
            }, 500); // 长按阈值500ms
        });
        
        // 鼠标抬起/触摸结束 - 全局处理
        document.addEventListener('mouseup', () => {
            clearAllTimers();
        });
        
        document.addEventListener('touchend', () => {
            clearAllTimers();
        });
        
        document.addEventListener('touchcancel', () => {
            clearAllTimers();
        });
        
        // 鼠标移出按钮也停止
        increaseButton.addEventListener('mouseleave', () => {
            if (container._isLongPressing) {
                clearAllTimers();
            }
        });
        
        decreaseButton.addEventListener('mouseleave', () => {
            if (container._isLongPressing) {
                clearAllTimers();
            }
        });
        
        // 重置按钮 - 增加二次确认
        let resetClickTime = 0;
        
        resetButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault(); // 防止文本选择
            const now = Date.now();
            
            // 第一次点击
            if (!resetButton.classList.contains('confirm') || now - resetClickTime > 3000) {
                resetButton.textContent = '确认重置?';
                resetButton.classList.add('confirm');
                resetClickTime = now;
                
                // 3秒后自动恢复，如果没有第二次点击
                setTimeout(() => {
                    if (now === resetClickTime) { // 确保没有新的点击更新了时间戳
                        resetButton.textContent = '重置';
                        resetButton.classList.remove('confirm');
                    }
                }, 3000);
                
                return;
            }
            
            // 第二次点击，检查时间间隔
            if (now - resetClickTime > 1000) { // 至少0.1秒的间隔
                // 执行重置
                countDisplay.textContent = '0';
                container.widgetData.count = 0;
                
                // 调整字体大小回到默认
                const width = container.offsetWidth;
                const height = container.offsetHeight;
                const fontSize = this.calculateOptimalFontSize(1, width, height);
                countDisplay.style.fontSize = `${fontSize}px`;
                
                // 重置按钮恢复正常状态
                resetButton.textContent = '重置';
                resetButton.classList.remove('confirm');
                resetClickTime = 0;
                
                // 触发数据变更事件
                document.dispatchEvent(new CustomEvent('widget-data-changed'));
            }
        });
        
        // 双击标题进入编辑模式
        titleElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault(); // 防止文本选择
            
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
            
            // 重置按钮恢复正常状态
            resetButton.textContent = '重置';
            resetButton.classList.remove('confirm');
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
            
            // 点击外部区域时重置按钮恢复正常状态
            if (!resetButton.contains(e.target) && resetButton.classList.contains('confirm')) {
                resetButton.textContent = '重置';
                resetButton.classList.remove('confirm');
            }
        });
    }
};