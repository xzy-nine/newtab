/**
 * 计时器小部件模块
 * 提供秒表和倒计时功能，支持多种交互、国际化、响应式布局。
 * @author System
 * @version 1.2.1
 * @date 2025-07-09
 */

import { I18n, Utils } from '../../core/index.js';

/**
 * 获取国际化消息辅助函数
 * @param {string} key - 国际化消息键
 * @param {string} defaultText - 默认文本
 * @returns {string} 国际化文本
 */
function getTimerI18nMessage(key, defaultText) {
    // 使用统一的国际化方法，通过导入的I18n模块
    if (typeof I18n !== 'undefined' && I18n.getMessage) {
        return I18n.getMessage(key, defaultText);
    }
    // 后备方案：尝试通过全局访问
    try {
        if (window.I18n && window.I18n.getMessage) {
            return window.I18n.getMessage(key, defaultText);
        }
    } catch (error) {
        console.warn('Timer widget I18n access failed:', error);
    }
    return defaultText;
}

export default {
    /**
     * 小部件元数据
     * @type {Object}
     * @property {string} name - 小部件名称
     * @property {string} description - 小部件描述
     * @property {string} version - 版本号
     * @property {string} author - 作者
     */
    metadata: {
        name: I18n.getMessage('timerWidgetName', '计时器'),
        description: I18n.getMessage('timerWidgetDesc', '提供秒表功能'),
        version: '1.2.0',
        author: 'System'
    },

    /**
     * 小部件尺寸配置
     * @type {Object}
     * @property {Object} default - 默认尺寸
     * @property {Object} min - 最小尺寸
     * @property {Object} max - 最大尺寸
     */
    config: {
        default: {
            width: 200,
            height: 120
        },
        min: {
            width: 150,
            height: 100
        },
        max: {
            width: 300,
            height: 250
        }
    },
    
    /**
     * 初始化小部件
     * @param {HTMLElement} container - 小部件容器元素
     * @param {Object} data - 小部件数据
     */
    initialize: async function(container, data = {}) {
        // 存储状态数据
        container.widgetData = data || {};
          // 初始状态 - 支持正计时和倒计时模式
        this.time = data.time || 0;
        this.isRunning = data.isRunning || false;
        this.isCountdown = data.isCountdown || false; // 是否为倒计时模式
        this.initialTime = data.initialTime || 0; // 倒计时的初始时间
        this.timerInterval = null;
        this.editingPosition = null; // 当前正在编辑的位置
        
        // 渲染界面
        this.render(container);
        
        // 绑定事件
        this.bindEvents(container);
          // 如果计时器正在运行，则继续运行
        if (this.isRunning) {
            const mainBtn = container.querySelector('#mainBtn');
            mainBtn.textContent = getTimerI18nMessage('timerPause', '暂停');
            mainBtn.classList.add("timer-btn-pause");
            mainBtn.classList.remove("timer-btn-start", "widget-btn-primary");
            mainBtn.classList.add("widget-btn-danger");
            
            const self = this;
            this.timerInterval = setInterval(() => self.updateTime(container), 100);
        }
        
        return container;
    },
    
    /**
     * 渲染小部件界面
     * @param {HTMLElement} container - 小部件容器元素
     */    render: function(container) {
        // 添加基础类名，使用公共样式
        container.classList.add('timer-widget', 'widget-base');        // 创建小部件HTML - 支持倒计时和正计时模式，使用公共样式类
        const titleText = this.isCountdown ? 
            getTimerI18nMessage('timerCountdown', '倒计时') : 
            getTimerI18nMessage('timerStopwatch', '秒表');
        const html = `
            <div class="timer-header">
                <h3 class="timer-title widget-title">${titleText}</h3>
            </div>
            
            <div class="timer-display widget-display" id="timerDisplay">
                <div class="digit-group">
                    <span class="time-digit widget-digit" id="m1" data-position="m1">0</span>
                    <div class="digit-controls" id="m1-controls" style="display:none;">
                        <div class="digit-up" data-target="m1">▲</div>
                        <div class="digit-down" data-target="m1">▼</div>
                    </div>
                </div>
                <div class="digit-group">
                    <span class="time-digit widget-digit" id="m2" data-position="m2">0</span>
                    <div class="digit-controls" id="m2-controls" style="display:none;">
                        <div class="digit-up" data-target="m2">▲</div>
                        <div class="digit-down" data-target="m2">▼</div>
                    </div>
                </div>
                <span class="time-separator widget-separator">:</span>
                <div class="digit-group">
                    <span class="time-digit widget-digit" id="s1" data-position="s1">0</span>
                    <div class="digit-controls" id="s1-controls" style="display:none;">
                        <div class="digit-up" data-target="s1">▲</div>
                        <div class="digit-down" data-target="s1">▼</div>
                    </div>
                </div>
                <div class="digit-group">
                    <span class="time-digit widget-digit" id="s2" data-position="s2">0</span>
                    <div class="digit-controls" id="s2-controls" style="display:none;">
                        <div class="digit-up" data-target="s2">▲</div>
                        <div class="digit-down" data-target="s2">▼</div>
                    </div>
                </div>
                <span class="ms-part" id="ms">0</span>
            </div>
            
            <div class="timer-compact-controls widget-controls widget-controls-horizontal">
                <button class="timer-main-btn timer-btn-start widget-btn widget-btn-rect widget-btn-primary" id="mainBtn">${getTimerI18nMessage('timerStart', '开始')}</button>
                <button class="timer-reset-btn widget-btn widget-btn-small widget-btn-normal" id="resetBtn">${getTimerI18nMessage('timerReset', '重置')}</button>
            </div>
        `;
        
        container.innerHTML = html;
        
        // 更新显示的时间
        this.showTime(container);
    },
    
    /**
     * 绑定事件处理
     * @param {HTMLElement} container - 小部件容器元素
     */
    bindEvents: function(container) {        // 绑定按钮事件
        this.bindButtonEvents(container);
        
        // 允许点击数字直接编辑（只有在计时器未运行时生效）
        const digits = container.querySelectorAll('.time-digit');
        const self = this;
        
        digits.forEach(digit => {
            digit.addEventListener('click', (e) => {
                if (!self.isRunning) {
                    e.stopPropagation();
                    self.startDigitEditing(container, digit);
                    
                    // 显示当前选中数字的控制按钮
                    const digitId = digit.id;
                    const controls = container.querySelector(`#${digitId}-controls`);
                    if (controls) {
                        controls.style.display = 'flex';
                    }
                }
            });
        });
        
        // 绑定上下箭头点击事件
        const upButtons = container.querySelectorAll('.digit-up');
        const downButtons = container.querySelectorAll('.digit-down');
        
        upButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!self.isRunning) {
                    e.stopPropagation();
                    const targetId = btn.dataset.target;
                    const digit = container.querySelector(`#${targetId}`);
                    if (digit) {
                        self.incrementDigit(container, digit);
                    }
                }
            });
        });
        
        downButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!self.isRunning) {
                    e.stopPropagation();
                    const targetId = btn.dataset.target;
                    const digit = container.querySelector(`#${targetId}`);
                    if (digit) {
                        self.decrementDigit(container, digit);
                    }
                }
            });
        });
        
        // 点击其他地方隐藏控制器
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target) || 
                (!e.target.classList.contains('digit-up') && 
                 !e.target.classList.contains('digit-down') && 
                 !e.target.classList.contains('time-digit'))) {
                // 隐藏所有控制器
                const allControls = container.querySelectorAll('.digit-controls');
                allControls.forEach(control => {
                    control.style.display = 'none';
                });
                
                // 结束编辑状态
                if (self.editingPosition) {
                    const editingDigit = container.querySelector(`#${self.editingPosition}`);
                    if (editingDigit) editingDigit.classList.remove('editing');
                    self.editingPosition = null;
                }
            }
        });
    },

    /**
     * 开始编辑单个数字
     * @param {HTMLElement} container - 小部件容器
     * @param {HTMLElement} digit - 被点击的数字元素
     */
    startDigitEditing: function(container, digit) {
        // 隐藏所有控制器
        const allControls = container.querySelectorAll('.digit-controls');
        allControls.forEach(control => {
            control.style.display = 'none';
        });
        
        // 重置所有数字的编辑状态
        const allDigits = container.querySelectorAll('.time-digit');
        allDigits.forEach(d => d.classList.remove('editing'));
        
        // 设置当前数字为编辑状态
        digit.classList.add('editing');
        this.editingPosition = digit.id;
        
        // 显示当前数字的控制器
        const controls = container.querySelector(`#${digit.id}-controls`);
        if (controls) {
            controls.style.display = 'flex';
        }
        
        // 添加一次性事件监听器以捕获键盘输入
        document.addEventListener('keydown', this.handleKeyPress.bind(this, container), { once: true });
    },
    
    /**
     * 处理编辑时的键盘按键
     * @param {HTMLElement} container - 小部件容器
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeyPress: function(container, e) {
        if (!this.editingPosition) return;
        
        const digit = container.querySelector(`#${this.editingPosition}`);
        if (!digit) return;
        
        // 只接受数字输入
        if (/^[0-9]$/.test(e.key)) {
            // 更新显示的数字
            digit.textContent = e.key;
            
            // 根据ID获取分钟和秒钟的四个位置的值
            const m1 = parseInt(container.querySelector('#m1').textContent) || 0;
            const m2 = parseInt(container.querySelector('#m2').textContent) || 0;
            const s1 = parseInt(container.querySelector('#s1').textContent) || 0;
            const s2 = parseInt(container.querySelector('#s2').textContent) || 0;
            
            // 计算总时间（以0.1秒为单位）
            const minutes = m1 * 10 + m2;
            const seconds = s1 * 10 + s2;
            this.time = (minutes * 60 + seconds) * 10;
            
            // 检查是否应该切换到倒计时模式
            this.checkAndSetCountdownMode(container);
            
            // 自动移动到下一个可编辑位置
            this.moveToNextDigit(container, digit);
            e.preventDefault();
            
            // 保存状态
            this.saveState(container);
        } else if (e.key === 'Tab') {
            // Tab键移动到下一个位置
            e.preventDefault();
            this.moveToNextDigit(container, digit, e.shiftKey);
        } else if (e.key === 'Escape' || e.key === 'Enter') {
            // Esc或Enter结束编辑
            digit.classList.remove('editing');
            this.editingPosition = null;
            // 隐藏控制器
            const controls = container.querySelector(`#${digit.id}-controls`);
            if (controls) controls.style.display = 'none';
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            // 上箭头增加数字
            this.incrementDigit(container, digit);
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            // 下箭头减少数字
            this.decrementDigit(container, digit);
            e.preventDefault();
        }
        
        // 继续监听键盘输入
        if (this.editingPosition) {
            document.addEventListener('keydown', this.handleKeyPress.bind(this, container), { once: true });
        }
    },
    
    /**
     * 移动到下一个可编辑数字
     * @param {HTMLElement} container - 小部件容器
     * @param {HTMLElement} currentDigit - 当前数字元素
     * @param {boolean} reverse - 是否反向移动（用于Shift+Tab）
     */
    moveToNextDigit: function(container, currentDigit, reverse = false) {
        // 定义数字顺序
        const order = ['m1', 'm2', 's1', 's2'];
        const currentIndex = order.indexOf(currentDigit.id);
        
        // 隐藏当前控制器
        const currentControls = container.querySelector(`#${currentDigit.id}-controls`);
        if (currentControls) currentControls.style.display = 'none';
        
        // 结束当前编辑
        currentDigit.classList.remove('editing');
        
        // 计算下一个位置
        let nextIndex;
        if (reverse) {
            nextIndex = (currentIndex - 1 + order.length) % order.length;
        } else {
            nextIndex = (currentIndex + 1) % order.length;
        }
        
        // 设置下一个数字为编辑状态
        const nextId = order[nextIndex];
        const nextDigit = container.querySelector(`#${nextId}`);
        if (nextDigit) {
            nextDigit.classList.add('editing');
            this.editingPosition = nextId;
            
            // 显示下一个数字的控制器
            const nextControls = container.querySelector(`#${nextId}-controls`);
            if (nextControls) nextControls.style.display = 'flex';
        } else {
            this.editingPosition = null;
        }
    },
    
    /**
     * 开关计时器
     * @param {HTMLElement} container - 小部件容器
     * @param {HTMLElement} button - 按钮元素
     */    toggleTimer: function(container, button) {
        const self = this;
        
        if (this.isRunning) {
            clearInterval(this.timerInterval);
            this.isRunning = false;
            button.textContent = getTimerI18nMessage('timerStart', '开始');
            button.classList.add("timer-btn-start", "widget-btn-primary");
            button.classList.remove("timer-btn-pause", "widget-btn-danger");
        } else {
            // 如果是倒计时模式且时间为0，不允许开始
            if (this.isCountdown && this.time === 0) {
                return;
            }
              this.timerInterval = setInterval(() => self.updateTime(container), 100);
            this.isRunning = true;
            button.textContent = getTimerI18nMessage('timerPause', '暂停');
            button.classList.add("timer-btn-pause", "widget-btn-danger");
            button.classList.remove("timer-btn-start", "widget-btn-primary");
            
            // 隐藏所有控制器
            const allControls = container.querySelectorAll('.digit-controls');
            allControls.forEach(control => {
                control.style.display = 'none';
            });
            
            // 结束编辑状态
            if (self.editingPosition) {
                const editingDigit = container.querySelector(`#${self.editingPosition}`);
                if (editingDigit) editingDigit.classList.remove('editing');
                self.editingPosition = null;
            }
        }
        
        // 保存状态
        this.saveState(container);
    },
    
    /**
     * 检查并设置倒计时模式
     * @param {HTMLElement} container - 小部件容器
     */
    checkAndSetCountdownMode: function(container) {
        // 如果时间不为0，则切换到倒计时模式
        if (this.time > 0) {
            // 只有在时间变更后才切换模式
            if (!this.isCountdown) {
                this.isCountdown = true;
                this.initialTime = this.time;
                
                // 更新标题
                const title = container.querySelector('.timer-title');
                if (title) {
                    title.textContent = getTimerI18nMessage('timerCountdown', '倒计时');
                }
            }
        } else {            // 如果时间为0，切换回正计时模式
            if (this.isCountdown) {
                this.isCountdown = false;
                this.initialTime = 0;
                
                // 更新标题
                const title = container.querySelector('.timer-title');
                if (title) {
                    this.title = getTimerI18nMessage('timerStopwatch', '秒表');
                    title.textContent = this.title;
                }
            }
        }
    },
    
    /**
     * 增加数字值（支持进位）
     * @param {HTMLElement} container - 小部件容器
     * @param {HTMLElement} digit - 数字元素
     */
    incrementDigit: function(container, digit) {
        // 获取所有数字元素
        const m1 = container.querySelector('#m1');
        const m2 = container.querySelector('#m2');
        const s1 = container.querySelector('#s1');
        const s2 = container.querySelector('#s2');
        
        // 获取当前值
        let m1Val = parseInt(m1.textContent) || 0;
        let m2Val = parseInt(m2.textContent) || 0;
        let s1Val = parseInt(s1.textContent) || 0;
        let s2Val = parseInt(s2.textContent) || 0;
        
        // 根据被点击的数字进行增加
        const id = digit.id;
        if (id === 's2') {
            // 秒钟个位
            s2Val = (s2Val + 1) % 10;
            if (s2Val === 0) { // 需要进位
                s1Val = (s1Val + 1) % 6;
                if (s1Val === 0) { // 秒进位到分
                    m2Val = (m2Val + 1) % 10;
                    if (m2Val === 0) { // 分钟十位进位
                        m1Val = (m1Val + 1) % 10;
                    }
                }
            }
        } else if (id === 's1') {
            // 秒钟十位
            s1Val = (s1Val + 1) % 6;
            if (s1Val === 0) { // 进位到分钟
                m2Val = (m2Val + 1) % 10;
                if (m2Val === 0) {
                    m1Val = (m1Val + 1) % 10;
                }
            }
        } else if (id === 'm2') {
            // 分钟个位
            m2Val = (m2Val + 1) % 10;
            if (m2Val === 0) {
                m1Val = (m1Val + 1) % 10;
            }
        } else if (id === 'm1') {
            // 分钟十位
            m1Val = (m1Val + 1) % 10;
        }
        
        // 更新显示
        m1.textContent = m1Val;
        m2.textContent = m2Val;
        s1.textContent = s1Val;
        s2.textContent = s2Val;
        
        // 更新时间值
        this.updateTimeFromDigits(container);
    },
    
    /**
     * 减少数字值（支持借位）
     * @param {HTMLElement} container - 小部件容器
     * @param {HTMLElement} digit - 数字元素
     */
    decrementDigit: function(container, digit) {
        // 获取所有数字元素
        const m1 = container.querySelector('#m1');
        const m2 = container.querySelector('#m2');
        const s1 = container.querySelector('#s1');
        const s2 = container.querySelector('#s2');
        
        // 获取当前值
        let m1Val = parseInt(m1.textContent) || 0;
        let m2Val = parseInt(m2.textContent) || 0;
        let s1Val = parseInt(s1.textContent) || 0;
        let s2Val = parseInt(s2.textContent) || 0;
        
        // 根据被点击的数字进行减少
        const id = digit.id;
        if (id === 's2') {
            // 秒钟个位
            if (s2Val === 0) {
                s2Val = 9;
                if (s1Val === 0) {
                    s1Val = 5;
                    if (m2Val === 0) {
                        m2Val = 9;
                        if (m1Val > 0) {
                            m1Val--;
                        } else {
                            m1Val = 9; // 循环回到最大值
                        }
                    } else {
                        m2Val--;
                    }
                } else {
                    s1Val--;
                }
            } else {
                s2Val--;
            }
        } else if (id === 's1') {
            // 秒钟十位
            if (s1Val === 0) {
                s1Val = 5;
                if (m2Val === 0) {
                    m2Val = 9;
                    if (m1Val > 0) {
                        m1Val--;
                    } else {
                        m1Val = 9; // 循环回到最大值
                    }
                } else {
                    m2Val--;
                }
            } else {
                s1Val--;
            }
        } else if (id === 'm2') {
            // 分钟个位
            if (m2Val === 0) {
                m2Val = 9;
                if (m1Val > 0) {
                    m1Val--;
                } else {
                    m1Val = 9; // 循环回到最大值
                }
            } else {
                m2Val--;
            }
        } else if (id === 'm1') {
            // 分钟十位
            if (m1Val === 0) {
                m1Val = 9;
            } else {
                m1Val--;
            }
        }
        
        // 更新显示
        m1.textContent = m1Val;
        m2.textContent = m2Val;
        s1.textContent = s1Val;
        s2.textContent = s2Val;
        
        // 更新时间值
        this.updateTimeFromDigits(container);
    },
    
    /**
     * 从显示的数字更新内部时间值
     * @param {HTMLElement} container - 小部件容器
     */
    updateTimeFromDigits: function(container) {
        const m1 = parseInt(container.querySelector('#m1').textContent) || 0;
        const m2 = parseInt(container.querySelector('#m2').textContent) || 0;
        const s1 = parseInt(container.querySelector('#s1').textContent) || 0;
        const s2 = parseInt(container.querySelector('#s2').textContent) || 0;
        
        const minutes = m1 * 10 + m2;
        const seconds = s1 * 10 + s2;
        this.time = (minutes * 60 + seconds) * 10;
        
        // 检查是否应该切换到倒计时模式
        this.checkAndSetCountdownMode(container);
        
        // 保存状态
        this.saveState(container);
    },
    /**
     * 显示当前时间
     * @param {HTMLElement} container - 小部件容器
     */
    showTime: function(container) {
        const ms = this.time % 10;
        const s = Math.floor(this.time / 10) % 60;
        const m = Math.floor(this.time / 600);
        
        // 拆分分钟和秒数为个位
        const s1 = Math.floor(s / 10);
        const s2 = s % 10;
        const m1 = Math.floor(m / 10);
        const m2 = m % 10;
        
        container.querySelector('#ms').textContent = ms;
        container.querySelector('#s1').textContent = s1;
        container.querySelector('#s2').textContent = s2;
        container.querySelector('#m1').textContent = m1;
        container.querySelector('#m2').textContent = m2;
    },
    
    /**
     * 停止计时并重置
     * @param {HTMLElement} container - 小部件容器
     */
    stopTiming: function(container) {
        this.time = 0;
        this.showTime(container);
        
        // 重置为正计时模式
        if (this.isCountdown) {
            this.isCountdown = false;
            this.initialTime = 0;
            
            // 更新标题
            const title = container.querySelector('.timer-title');
            if (title) {
                title.textContent = "秒表";
            }
        }
          if (this.isRunning) {
            clearInterval(this.timerInterval);
            this.isRunning = false;
              const mainBtn = container.querySelector('#mainBtn');
            mainBtn.textContent = getTimerI18nMessage('timerStart', '开始');
            mainBtn.classList.add("timer-btn-start", "widget-btn-primary");
            mainBtn.classList.remove("timer-btn-pause", "widget-btn-danger");
        }
        
        this.saveState(container);
    },
    
    /**
     * 更新时间 - 根据模式增加或减少时间
     * @param {HTMLElement} container - 小部件容器
     */
    updateTime: function(container) {
        if (this.isCountdown) {
            // 倒计时模式
            this.time -= 1; // 每次减1（0.1秒）
            
            // 如果倒计时到达0，停止计时器并切换回正计时模式
            if (this.time <= 0) {
                this.time = 0;
                
                // 清除计时器
                clearInterval(this.timerInterval);
                this.isRunning = false;
                  // 切换回正计时模式
                this.isCountdown = false;
                this.initialTime = 0;
                  // 更新标题
                const title = container.querySelector('.timer-title');
                if (title) {
                    this.title = getTimerI18nMessage('timerStopwatch', '秒表');
                    title.textContent = this.title;
                }
                  // 更新按钮状态
                const mainBtn = container.querySelector('#mainBtn');                if (mainBtn) {
                    mainBtn.textContent = getTimerI18nMessage('timerStart', '开始');
                    mainBtn.classList.add("timer-btn-start", "widget-btn-primary");
                    mainBtn.classList.remove("timer-btn-pause", "widget-btn-danger");
                }
                
                // 可以添加声音提示或其他通知
                // TODO: 添加声音提示
            }
        } else {
            // 正计时模式
            this.time += 1; // 每次加1（0.1秒）
        }
        
        this.showTime(container);
        this.saveState(container);
    },
    
    /**
     * 保存状态
     * @param {HTMLElement} container - 小部件容器
     */
    saveState: function(container) {        // 更新小部件数据
        container.widgetData = {
            time: this.time,
            isRunning: this.isRunning,
            isCountdown: this.isCountdown,
            initialTime: this.initialTime,
            title: this.title
        };
        
        // 触发小部件数据变更事件
        document.dispatchEvent(new CustomEvent('widget-data-changed'));
    },
      /**
     * 为按钮绑定事件
     * @param {HTMLElement} container - 小部件容器
     */
    bindButtonEvents: function(container) {
        const self = this;
        
        // 开始/暂停按钮
        const mainBtn = container.querySelector('#mainBtn');
        if (mainBtn) {
            mainBtn.removeEventListener('click', this._mainBtnClickHandler);
            this._mainBtnClickHandler = function(e) {
                e.preventDefault();
                self.toggleTimer(container, this);
            };
            mainBtn.addEventListener('click', this._mainBtnClickHandler);
        }
        
        // 重置按钮 - 增加二次确认功能
        const resetBtn = container.querySelector('#resetBtn');
        if (resetBtn) {
            let resetClickTime = 0;
            
            resetBtn.removeEventListener('click', this._resetBtnClickHandler);
            this._resetBtnClickHandler = function(e) {
                e.preventDefault();
                e.stopPropagation(); // 阻止事件冒泡
                
                const now = Date.now();
                  // 第一次点击
                if (!resetBtn.classList.contains('confirm') || now - resetClickTime > 3000) {
                    resetBtn.textContent = getTimerI18nMessage('timerConfirm', '确认?');
                    resetBtn.classList.add('confirm');
                    resetClickTime = now;
                      // 3秒后自动恢复
                    setTimeout(() => {
                        if (resetBtn.classList.contains('confirm')) {
                            resetBtn.textContent = getTimerI18nMessage('timerReset', '重置');
                            resetBtn.classList.remove('confirm');
                        }
                    }, 3000);
                    return;
                }
                
                // 第二次点击，检查时间间隔
                if (now - resetClickTime > 1000) {                    // 超过1秒，重新开始确认流程
                    resetBtn.textContent = getTimerI18nMessage('timerConfirm', '确认?');
                    resetClickTime = now;                    setTimeout(() => {
                        if (resetBtn.classList.contains('confirm')) {
                            resetBtn.textContent = getTimerI18nMessage('timerReset', '重置');
                            resetBtn.classList.remove('confirm');
                        }
                    }, 3000);
                    return;
                }
                
                // 在1秒内的第二次点击，执行重置
                resetBtn.textContent = getTimerI18nMessage('timerReset', '重置');
                resetBtn.classList.remove('confirm');
                self.stopTiming(container);
            };
            resetBtn.addEventListener('click', this._resetBtnClickHandler);
        }
    },
    
    /**
     * 绑定标题双击编辑事件
     * @param {HTMLElement} container - 小部件容器
     */
    bindTitleEditEvents: function(container) {
        const titleElement = container.querySelector('.timer-title');
        if (!titleElement) return;
        
        // 双击标题进入编辑模式
        titleElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // 已经在编辑状态则不处理
            if (titleElement.classList.contains('editing')) return;
            
            const currentTitle = this.title || getTimerI18nMessage('timerStopwatch', '秒表');
            
            // 添加编辑类
            titleElement.classList.add('editing');            
            // 创建输入框
            const inputElement = Utils.createElement('input');
            inputElement.type = 'text';
            inputElement.value = currentTitle;
            inputElement.maxLength = 20;
            inputElement.style.cssText = `
                background: transparent;
                border: 1px dashed rgba(255,255,255,0.5);
                color: inherit;
                font-size: inherit;
                font-family: inherit;
                text-align: center;
                width: 100%;
                padding: 2px 4px;
                border-radius: 3px;
            `;
            
            // 清空标题元素原内容并添加输入框
            titleElement.textContent = '';
            titleElement.appendChild(inputElement);
            
            // 自动聚焦输入框
            inputElement.focus();
            inputElement.select();
              // 保存标题的函数
            const saveTitle = () => {
                const newTitle = inputElement.value.trim() || getTimerI18nMessage('timerStopwatch', '秒表');
                this.title = newTitle;
                titleElement.textContent = newTitle;
                titleElement.classList.remove('editing');
                
                // 保存状态
                this.saveState(container);
            };
            
            // Enter键保存
            inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitle();                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    titleElement.textContent = this.title || getTimerI18nMessage('timerStopwatch', '秒表');
                    titleElement.classList.remove('editing');
                }
            });
            
            // 失焦保存
            inputElement.addEventListener('blur', saveTitle);
        });
        
        // 点击其他地方关闭编辑
        document.addEventListener('click', (e) => {
            if (titleElement.classList.contains('editing') && 
                !titleElement.contains(e.target)) {
                const inputElement = titleElement.querySelector('input');                if (inputElement) {
                    const newTitle = inputElement.value.trim() || getTimerI18nMessage('timerStopwatch', '秒表');
                    this.title = newTitle;
                    titleElement.textContent = newTitle;
                    titleElement.classList.remove('editing');
                    this.saveState(container);
                }
            }
        });
    },
      /**
     * 调整大小时调用
     * @param {HTMLElement} container - 小部件容器
     */
    adjustSize: function(container) {
        // 根据容器大小调整界面
        const containerElement = container.closest('.widget-container');
        if (!containerElement) return;
        
        const width = parseInt(containerElement.style.width);
        
        // 获取重置按钮
        const resetBtn = container.querySelector('#resetBtn');
        
        // 根据宽度调整按钮 - 但不覆盖确认状态
        if (resetBtn && !resetBtn.classList.contains('confirm')) {
            if (width < 140) {
                // 超小尺寸
                resetBtn.textContent = 'R';            } else {
                // 正常尺寸
                resetBtn.textContent = getTimerI18nMessage('timerReset', '重置');
            }
        }
    },
    
    /**
     * 析构函数，清理资源
     * @param {HTMLElement} container - 小部件容器
     */
    destroy: function(container) {
        // 清除计时器
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // 清空容器
        container.innerHTML = '';
        this.isRunning = false;
    },
    
    /**
     * 获取小部件数据
     * @param {HTMLElement} container - 小部件容器
     * @returns {Object} 小部件数据
     */
    getData: function(container) {
        return container.widgetData || {};
    }
};