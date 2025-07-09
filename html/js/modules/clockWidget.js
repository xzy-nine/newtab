/**
 * 时钟组件模块
 * 提供时钟显示、设置、保存与加载等功能
 * @module ClockWidget
 */

import { Utils } from './core/index.js';


// 时钟组件配置
let clockConfig = {
    enabled: true,
    format24h: true,
    showSeconds: true
};

/**
 * 时钟模块API对象
 * @namespace
 */
export const ClockWidget = {
    /**
     * 初始化时钟组件
     * @returns {Promise<void>} 无
     */
    async init() {
        createClockElement();
        await loadClockSettings();  // 等待设置加载完成
        _updateClock(); // 初始化时更新一次时钟显示
        setInterval(_updateClock, 1000);
        
        // 添加窗口大小变化监听，以调整时钟大小
        window.addEventListener('resize', adjustClockSize);
        // 初始调整
        adjustClockSize();
        
        return Promise.resolve(); // 确保返回一个已解决的Promise
    },

    /**
     * 更新时钟显示
     */
    update() {
        _updateClock();
    },

    /**
     * 保存时钟设置
     * @param {Object} settings 要更新的设置对象
     * @returns {Promise<boolean>} 保存是否成功
     */
    async saveSettings(settings) {
        try {
            Object.assign(clockConfig, settings);
            
            await chrome.storage.local.set({
                clockEnabled: clockConfig.enabled,
                clockFormat24h: clockConfig.format24h,
                clockShowSeconds: clockConfig.showSeconds
            });
            
            updateClockVisibility();
            _updateClock();
            
            return true;
        } catch (error) {
            // 移除console.error调试代码
            return false;
        }
    },

    /**
     * 获取当前时钟设置
     * @returns {Object} 当前时钟设置的副本
     */
    getSettings() {
        return {...clockConfig};
    }
};

/**
 * 创建时钟DOM元素
 */
function createClockElement() {
    if (document.getElementById('time')) return;

    const timeDiv = Utils.createElement('div');
    timeDiv.className = 'time';
    timeDiv.id = 'time';    
    // 创建一个内部容器来强制单行布局
    const innerContainer = Utils.createElement('div');
    innerContainer.className = 'time-inner-container';
    timeDiv.appendChild(innerContainer);    // 创建小时组
    const hourGroup = Utils.createElement('div');
    hourGroup.className = 'hour-group';
    const hourTens = createDigit();
    const hourOnes = createDigit();
    hourGroup.append(hourTens, hourOnes);

    // 创建第一个冒号
    const colon1 = createColon();
    colon1.classList.add('blink');
      // 创建分钟组
    const minuteGroup = Utils.createElement('div');
    minuteGroup.className = 'minute-group';
    const minuteTens = createDigit();
    const minuteOnes = createDigit();
    minuteGroup.append(minuteTens, minuteOnes);
    
    // 创建第二个冒号
    const colon2 = createColon();
    colon2.classList.add('blink');    
    // 创建秒钟组
    const secondGroup = Utils.createElement('div');
    secondGroup.className = 'second-group';
    const secondTens = createDigit();
    const secondOnes = createDigit();
    secondGroup.append(secondTens, secondOnes);

    // 按顺序添加所有元素到内部容器
    innerContainer.append(
        hourGroup, colon1, minuteGroup, colon2, secondGroup
    );
    
    document.body.appendChild(timeDiv);
}

/**
 * 创建数字显示元素
 * @returns {HTMLElement} 数字元素
 */
function createDigit() {
    const digit = Utils.createElement('div');
    digit.className = 'digit';
    
    // 创建7段数码管加小数点，共8个部分
    const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];    segments.forEach(seg => {
        const segment = Utils.createElement('div');
        segment.className = `segment segment-${seg}`;
        // 根据段的类型应用水平或垂直样式
        if (seg === 'a' || seg === 'd' || seg === 'g') {
            segment.classList.add('segment-h');
        } else if (seg !== 'dp') {
            segment.classList.add('segment-v');
        }
        digit.appendChild(segment);
    });
    
    return digit;
}

/**
 * 创建冒号分隔符元素
 * @returns {HTMLElement} 冒号元素
 */
function createColon() {
    const colon = Utils.createElement('div');
    colon.className = 'split';
    return colon;
}

/**
 * 加载时钟设置
 */
async function loadClockSettings() {
    try {
        const result = await chrome.storage.local.get([
            'clockEnabled', 
            'clockFormat24h', 
            'clockShowSeconds'
        ]);
        
        clockConfig = {
            enabled: result.clockEnabled ?? true,
            format24h: result.clockFormat24h ?? true,
            showSeconds: result.clockShowSeconds ?? true
        };
        
        updateClockVisibility();
    } catch (error) {
        // 移除console.error调试代码
    }
}

/**
 * 更新时钟显示
 * @private
 */
function _updateClock() {
    if (!clockConfig.enabled) return;
    
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    if (!clockConfig.format24h) {
        hours = hours % 12 || 12;
    }
    
    const timeElement = document.getElementById('time');
    if (!timeElement) return;
    
    const innerContainer = timeElement.querySelector('.time-inner-container');
    if (!innerContainer) return;
    
    // 更新小时显示
    updateDigit(innerContainer.children[0].children[0], Math.floor(hours / 10));
    updateDigit(innerContainer.children[0].children[1], hours % 10);
    
    // 更新分钟显示
    updateDigit(innerContainer.children[2].children[0], Math.floor(minutes / 10));
    updateDigit(innerContainer.children[2].children[1], minutes % 10);
    
    // 更新秒钟显示和冒号显示
    if (clockConfig.showSeconds) {
        updateDigit(innerContainer.children[4].children[0], Math.floor(seconds / 10));
        updateDigit(innerContainer.children[4].children[1], seconds % 10);
        
        // 显示秒钟和第二个冒号
        innerContainer.children[3].style.display = 'inline-block';
        innerContainer.children[4].style.display = 'inline-block';
    } else {
        // 隐藏秒钟和第二个冒号
        innerContainer.children[3].style.display = 'none';
        innerContainer.children[4].style.display = 'none';
    }
}

function updateDigit(digitElement, number) {
    // 移除原有的数字类
    digitElement.className = digitElement.className.replace(/\bdigit-\d\b/g, '');
    // 添加新的数字类
    digitElement.classList.add(`digit-${number}`);
    
    // 直接设置段的可见性
    // 定义每个数字应显示的段
    const segmentMap = {
        0: { a: true, b: true, c: true, d: true, e: true, f: true, g: false },
        1: { a: false, b: true, c: true, d: false, e: false, f: false, g: false },
        2: { a: true, b: true, c: false, d: true, e: true, f: false, g: true },
        3: { a: true, b: true, c: true, d: true, e: false, f: false, g: true },
        4: { a: false, b: true, c: true, d: false, e: false, f: true, g: true },
        5: { a: true, b: false, c: true, d: true, e: false, f: true, g: true },
        6: { a: true, b: false, c: true, d: true, e: true, f: true, g: true },
        7: { a: true, b: true, c: true, d: false, e: false, f: false, g: false },
        8: { a: true, b: true, c: true, d: true, e: true, f: true, g: true },
        9: { a: true, b: true, c: true, d: true, e: false, f: true, g: true }
    };
    
    const segments = digitElement.querySelectorAll('.segment');
    segments.forEach(segment => {
        // 从类名中提取段名称(a-g)
        const segmentName = Array.from(segment.classList)
            .find(cls => cls.startsWith('segment-') && cls !== 'segment-h' && cls !== 'segment-v')
            ?.replace('segment-', '');
            
        if (segmentName && segmentName.length === 1 && segmentMap[number]?.[segmentName] !== undefined) {
            // 设置段的透明度
            segment.style.opacity = segmentMap[number][segmentName] ? '1' : '0.1';
        }
    });
}

/**
 * 更新时钟的可见性
 */
function updateClockVisibility() {
    const timeElement = document.getElementById('time');
    if (timeElement) {
        timeElement.style.display = clockConfig.enabled ? 'block' : 'none';
    }
}

/**
 * 调整时钟大小以适应窗口宽度
 */
function adjustClockSize() {
    const timeElement = document.getElementById('time');
    if (!timeElement) return;
    
    const windowWidth = window.innerWidth;
    // 根据窗口宽度调整时钟大小
    if (windowWidth < 768) { // 移动设备
        // 计算合适的缩放比例
        const scale = Math.min(1, (windowWidth - 40) / 450);
        timeElement.style.transform = `translateX(-50%) scale(${scale})`;
        // 确保缩放后依然水平居中
        timeElement.style.transformOrigin = 'center center';
    } else {
        // 恢复正常大小
        timeElement.style.transform = 'translateX(-50%)';
    }
}

