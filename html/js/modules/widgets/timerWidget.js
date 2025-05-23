/**
 * 计时器小部件模块
 */

export default {
    // 小部件元数据
    metadata: {
        name: '计时器',
        description: '计时器小部件，可开始、暂停、记录和停止',
        version: '1.0.0',
        author: 'System'
    },

    // 小部件尺寸配置
    config: {
        default: {
            width: 200,
            height: 150
        },
        min: {
            width: 135,
            height: 120
        },
        max: {
            width: 300,
            height: 300
        }
    },
    
    /**
     * 初始化计时器小部件
     * @param {HTMLElement} container - 小部件容器元素
     * @param {Object} data - 小部件数据
     * @returns {Promise<void>}
     */
    initialize: async function(container, data = {}) {
        // 设置默认尺寸
        if (!container.style.width || parseInt(container.style.width) < this.config.default.width) {
            container.style.width = `${this.config.default.width}px`;
        }
        if (!container.style.height || parseInt(container.style.height) < this.config.default.height) {
            container.style.height = `${this.config.default.height}px`;
        }
        
        // 创建小部件内容
        const widgetContent = document.createElement('div');
        widgetContent.className = 'timer-widget';
        
        // 初始化数据或使用保存的数据
        const startTime = data.startTime || 0;
        const pausedTime = data.pausedTime || 0;
        const totalPausedTime = data.totalPausedTime || 0;
        const isRunning = data.isRunning || false;
        const isPaused = data.isPaused || false;
        const records = data.records || [];
        const title = data.title || '计时器';
        
        // 创建小部件结构
        widgetContent.innerHTML = `
            <div class="timer-title">${title}</div>
            <div class="timer-display">00:00:00</div>
            <div class="timer-controls">
                <button class="timer-button start ${isRunning && !isPaused ? 'active' : ''}" title="开始/暂停">
                    ${isRunning && !isPaused ? '⏸️' : '▶️'}
                </button>
                <button class="timer-button record" title="记录"${!isRunning ? ' disabled' : ''}>🏁</button>
                <button class="timer-button stop destructive" title="结束">⏹️</button>
            </div>
            <div class="timer-records-container ${records.length > 0 ? 'has-records' : ''}">
                <div class="timer-records-header">记录</div>
                <div class="timer-records">
                    ${this.generateRecordsHTML(records)}
                </div>
            </div>
        `;
        
        // 添加到容器
        container.appendChild(widgetContent);
        
        // 保存初始数据
        container.widgetData = {
            ...data,
            startTime,
            pausedTime,
            totalPausedTime,
            isRunning,
            isPaused,
            records,
            title,
            lastUpdate: Date.now() // 记录最后更新时间
        };
        
        // 添加交互事件
        this.addEventListeners(container, widgetContent);
        
        // 初始化后调整大小和时间显示
        this.adjustSize(container);
        this.updateDisplay(container);
        
        // 如果计时器正在运行，启动更新
        if (isRunning && !isPaused) {
            this.startUpdateLoop(container);
        }
        
        // 添加调整大小的事件监听器
        const resizeObserver = new ResizeObserver(() => {
            this.adjustSize(container);
        });
        resizeObserver.observe(container);
    },

    /**
     * 小部件被销毁时调用
     * @param {HTMLElement} container - 小部件容器
     */
    destroy: function(container) {
        // 清除更新间隔
        if (container.updateInterval) {
            clearInterval(container.updateInterval);
            container.updateInterval = null;
        }
        
        // 清除任何可能的resize observer
        if (container._resizeObserver) {
            container._resizeObserver.disconnect();
            container._resizeObserver = null;
        }
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
     * 生成记录列表的HTML
     * @param {Array} records - 记录数据数组
     * @returns {string} 记录的HTML字符串
     */
    generateRecordsHTML: function(records) {
        if (!records || records.length === 0) return '';
        
        return records.map((record, index) => {
            return `<div class="timer-record-item">
                <span class="timer-record-num">#${index + 1}</span>
                <span class="timer-record-time">${this.formatTime(record)}</span>
            </div>`;
        }).join('');
    },
    
    /**
     * 调整小部件大小和布局
     * @param {HTMLElement} container - 小部件容器
     */
    adjustSize: function(container) {
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        const widgetContent = container.querySelector('.timer-widget');
        
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
        widgetContent.style.justifyContent = 'space-between';
        widgetContent.style.height = '100%';
        widgetContent.style.width = '100%';
        
        // 根据容器大小应用不同的布局类
        widgetContent.classList.remove('compact-layout', 'default-layout', 'large-layout');
        
        // 更新布局类判断逻辑 - 使用实际容器尺寸
        const actualWidth = container.offsetWidth;
        const actualHeight = container.offsetHeight;
        
        // 调整为合理的布局阈值
        if (actualWidth <= this.config.min.width + 20 || actualHeight <= this.config.min.height + 20) {
            widgetContent.classList.add('compact-layout');
        } else if (actualWidth >= 200 || actualHeight >= 180) {
            widgetContent.classList.add('large-layout');
        } else {
            widgetContent.classList.add('default-layout');
        }
        
        // 根据记录数量显示或隐藏记录区域
        const recordsContainer = container.querySelector('.timer-records-container');
        if (recordsContainer) {
            const records = container.widgetData?.records || [];
            if (records.length > 0) {
                recordsContainer.classList.add('has-records');
            } else {
                recordsContainer.classList.remove('has-records');
            }
        }
        
        // 强制触发布局刷新
        container.style.display = 'none';
        container.offsetHeight; // 强制回流
        container.style.display = '';
    },
    
    /**
     * 格式化时间为 HH:MM:SS 格式
     * @param {number} milliseconds - 毫秒数
     * @returns {string} 格式化的时间字符串
     */
    formatTime: function(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    },
    
    /**
     * 添加事件监听
     * @param {HTMLElement} container - 小部件容器
     * @param {HTMLElement} content - 小部件内容元素
     */
    addEventListeners: function(container, content) {
        // 获取元素引用
        const startButton = content.querySelector('.timer-button.start');
        const recordButton = content.querySelector('.timer-button.record');
        const stopButton = content.querySelector('.timer-button.stop');
        const titleElement = content.querySelector('.timer-title');
        const recordsContainer = content.querySelector('.timer-records-container');
        const recordsList = content.querySelector('.timer-records');
        
        // 开始按钮点击事件
        startButton.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const currentData = container.widgetData;
            const now = Date.now();
            
            if (!currentData.isRunning) {
                // 如果之前没有运行过或已经结束，从当前时间开始计时
                if (!currentData.startTime || currentData.endTime) {
                    currentData.startTime = now;
                    currentData.pausedTime = 0;
                    currentData.totalPausedTime = 0;
                    currentData.records = [];
                    
                    // 清空记录区域
                    recordsList.innerHTML = '';
                    recordsContainer.classList.remove('has-records');
                } else if (currentData.isPaused) {
                    // 如果是从暂停状态恢复，计算已暂停的时间
                    const pauseDuration = now - currentData.pausedTime;
                    currentData.totalPausedTime += pauseDuration;
                    currentData.pausedTime = 0;
                }
                
                currentData.isRunning = true;
                currentData.isPaused = false;
                currentData.endTime = null;
                currentData.lastUpdate = now;
                
                // 更新按钮图标
                startButton.innerHTML = '⏸️';
                startButton.classList.add('active');
                recordButton.disabled = false;
                
                // 开始更新循环
                this.startUpdateLoop(container);
            } else if (!currentData.isPaused) {
                // 如果正在运行，则暂停
                currentData.isPaused = true;
                currentData.pausedTime = now;
                
                // 更新按钮图标
                startButton.innerHTML = '▶️';
                startButton.classList.remove('active');
            } else {
                // 从暂停状态恢复
                const pauseDuration = now - currentData.pausedTime;
                currentData.totalPausedTime += pauseDuration;
                currentData.pausedTime = 0;
                currentData.isPaused = false;
                currentData.lastUpdate = now;
                
                // 更新按钮图标
                startButton.innerHTML = '⏸️';
                startButton.classList.add('active');
                
                // 恢复更新循环
                this.startUpdateLoop(container);
            }
            
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        });
        
        // 记录按钮点击事件
        recordButton.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const currentData = container.widgetData;
            const now = Date.now();
            
            if (currentData.isRunning) {
                // 计算当前经过的时间
                let elapsedTime = now - currentData.startTime - currentData.totalPausedTime;
                
                // 如果当前处于暂停状态，减去当前暂停的时间
                if (currentData.isPaused && currentData.pausedTime) {
                    elapsedTime -= (now - currentData.pausedTime);
                }
                
                // 添加记录
                currentData.records = currentData.records || [];
                currentData.records.push(elapsedTime);
                
                // 更新记录显示
                this.updateRecords(container);
                
                // 显示记录区域
                recordsContainer.classList.add('has-records');
                
                // 触发数据变更事件
                document.dispatchEvent(new CustomEvent('widget-data-changed'));
            }
        });
        
        // 结束按钮点击事件
        stopButton.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const currentData = container.widgetData;
            const now = Date.now();
            
            if (currentData.isRunning) {
                // 记录结束时间
                currentData.endTime = now;
                currentData.isRunning = false;
                currentData.isPaused = false;
                
                // 更新按钮状态
                startButton.innerHTML = '▶️';
                startButton.classList.remove('active');
                recordButton.disabled = true;
                
                // 显示最终时间
                this.updateDisplay(container);
                
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
            
            const currentTitle = container.widgetData.title || '计时器';
            
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
                let newTitle = inputElement.value.trim() || '计时器';
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
        
        // 页面可见性变化事件
        document.addEventListener('visibilitychange', () => {
            const currentData = container.widgetData;
            const now = Date.now();
            
            if (document.visibilityState === 'visible') {
                // 页面变为可见时，如果计时器正在运行且没有暂停
                if (currentData.isRunning && !currentData.isPaused) {
                    // 计算页面隐藏期间的时间
                    const hiddenTime = now - currentData.lastUpdate;
                    currentData.lastUpdate = now;
                    
                    // 更新时间显示
                    this.updateDisplay(container);
                }
            } else {
                // 页面变为隐藏时记录当前时间
                if (currentData.isRunning) {
                    currentData.lastUpdate = now;
                }
            }
        });
    },
    
    /**
     * 更新时间显示
     * @param {HTMLElement} container - 小部件容器
     */
    updateDisplay: function(container) {
        const display = container.querySelector('.timer-display');
        if (!display) return;
        
        const currentData = container.widgetData;
        const now = Date.now();
        
        // 计算已经过的时间
        let elapsedTime = 0;
        
        if (currentData.endTime) {
            // 如果已结束，使用结束时间计算
            elapsedTime = currentData.endTime - currentData.startTime - currentData.totalPausedTime;
        } else if (currentData.isRunning) {
            if (currentData.isPaused) {
                // 如果处于暂停状态
                elapsedTime = currentData.pausedTime - currentData.startTime - currentData.totalPausedTime;
            } else {
                // 正在运行
                elapsedTime = now - currentData.startTime - currentData.totalPausedTime;
            }
        }
        
        // 更新显示
        display.textContent = this.formatTime(Math.max(0, elapsedTime));
        
        // 更新数据的最后更新时间
        currentData.lastUpdate = now;
    },
    
    /**
     * 更新记录显示
     * @param {HTMLElement} container - 小部件容器
     */
    updateRecords: function(container) {
        const recordsList = container.querySelector('.timer-records');
        if (!recordsList) return;
        
        const currentData = container.widgetData;
        const records = currentData.records || [];
        
        // 更新记录列表HTML
        recordsList.innerHTML = this.generateRecordsHTML(records);
        
        // 滚动到底部
        recordsList.scrollTop = recordsList.scrollHeight;
    },
    
    /**
     * 启动更新循环
     * @param {HTMLElement} container - 小部件容器
     */
    startUpdateLoop: function(container) {
        // 先清除可能存在的更新循环
        if (container.updateInterval) {
            clearInterval(container.updateInterval);
        }
        
        // 创建新的更新循环
        container.updateInterval = setInterval(() => {
            const currentData = container.widgetData;
            
            // 如果已经不在运行或处于暂停状态，停止更新
            if (!currentData.isRunning || currentData.isPaused) {
                clearInterval(container.updateInterval);
                container.updateInterval = null;
                return;
            }
            
            // 更新显示
            this.updateDisplay(container);
        }, 1000); // 每秒更新一次
    }
};