/**
 * 时钟组件模块
 */

import { getI18nMessage } from './i18n.js';

// 时钟组件配置
let clockConfig = {
    enabled: true,
    format24h: true,
    showSeconds: true
};

/**
 * 初始化时钟组件
 */
export function initClockWidget() {
    createClockElement();
    loadClockSettings();
    updateClock(); // 初始化时更新一次时钟显示
    setInterval(updateClock, 1000);
}

/**
 * 创建时钟DOM元素
 */
function createClockElement() {
    // 检查是否已经存在时钟元素
    if (document.getElementById('time')) return;

    // 创建时钟容器
    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.id = 'time';

    // 创建时钟内部元素
    const hourSpan = document.createElement('span');
    hourSpan.className = 'hour';

    const splitElement1 = document.createElement('a');
    splitElement1.className = 'split';
    splitElement1.textContent = ':';

    const minuteSpan = document.createElement('span');
    minuteSpan.className = 'minitus';

    const splitElement2 = document.createElement('a');
    splitElement2.className = 'split';
    splitElement2.textContent = ':';

    const secondsSpan = document.createElement('span');
    secondsSpan.className = 'seconds';

    // 将元素添加到时钟容器中
    timeDiv.append(hourSpan, splitElement1, minuteSpan, splitElement2, secondsSpan);

    // 将时钟添加到body
    document.body.appendChild(timeDiv);
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
        console.error('Failed to load clock settings:', error);
    }
}

/**
 * 更新时钟显示
 */
export function updateClock() {
    if (!clockConfig.enabled) return;
    
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    // 处理12小时制
    if (!clockConfig.format24h) {
        hours = hours % 12 || 12;
    }
    
    const timeElement = document.getElementById('time');
    if (!timeElement) return;
    
    // 更新CSS变量
    const props = {
        '--h': hours, 
        '--m': minutes, 
        '--s': seconds,
        '--dh': hours,
        '--dm': minutes,
        '--ds': seconds
    };
    
    Object.entries(props).forEach(([prop, value]) => {
        timeElement.style.setProperty(prop, value);
    });
    
    // 处理秒的显示/隐藏
    const secondsElement = document.querySelector('.seconds');
    const secondColon = document.querySelectorAll('.split')[1];
    
    if (secondsElement) {
        secondsElement.style.display = clockConfig.showSeconds ? 'inline' : 'none';
    }
    
    if (secondColon) {
        secondColon.style.display = clockConfig.showSeconds ? 'inline' : 'none';
    }
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
 * 保存时钟设置
 */
export async function saveClockSettings(settings) {
    try {
        // 更新本地配置
        Object.assign(clockConfig, settings);
        
        // 保存到存储
        await chrome.storage.local.set({
            clockEnabled: clockConfig.enabled,
            clockFormat24h: clockConfig.format24h,
            clockShowSeconds: clockConfig.showSeconds
        });
        
        // 更新UI
        updateClockVisibility();
        updateClock();
        
        return true;
    } catch (error) {
        console.error('Failed to save clock settings:', error);
        return false;
    }
}

/**
 * 获取当前时钟设置
 */
export function getClockSettings() {
    return {...clockConfig};
}