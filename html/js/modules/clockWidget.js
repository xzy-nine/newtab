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
    if (document.getElementById('time')) return;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.id = 'time';

    // 创建小时、分钟、秒钟的数码管
    const hourTens = createDigit();
    const hourOnes = createDigit();
    const colon1 = createColon();
    const minuteTens = createDigit();
    const minuteOnes = createDigit();
    const colon2 = createColon();
    const secondTens = createDigit();
    const secondOnes = createDigit();

    timeDiv.append(
        hourTens, hourOnes, colon1, 
        minuteTens, minuteOnes, colon2,
        secondTens, secondOnes
    );
    document.body.appendChild(timeDiv);
}

function createDigit() {
    const digit = document.createElement('div');
    digit.className = 'digit';
    
    // 创建8段数码管
    const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
    segments.forEach(seg => {
        const segment = document.createElement('div');
        segment.className = `segment segment-${seg}`;
        segment.classList.add(seg.includes('h') ? 'segment-h' : 'segment-v');
        digit.appendChild(segment);
    });
    
    return digit;
}

function createColon() {
    const colon = document.createElement('div');
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
    
    if (!clockConfig.format24h) {
        hours = hours % 12 || 12;
    }
    
    const timeElement = document.getElementById('time');
    if (!timeElement) return;
    
    // 更新小时显示
    updateDigit(timeElement.children[0], Math.floor(hours / 10));
    updateDigit(timeElement.children[1], hours % 10);
    
    // 更新分钟显示
    updateDigit(timeElement.children[3], Math.floor(minutes / 10));
    updateDigit(timeElement.children[4], minutes % 10);
    
    // 更新秒钟显示
    if (clockConfig.showSeconds) {
        updateDigit(timeElement.children[6], Math.floor(seconds / 10));
        updateDigit(timeElement.children[7], seconds % 10);
        timeElement.children[5].style.display = 'block';
        timeElement.children[6].style.display = 'block';
        timeElement.children[7].style.display = 'block';
    } else {
        timeElement.children[5].style.display = 'none';
        timeElement.children[6].style.display = 'none';
        timeElement.children[7].style.display = 'none';
    }
}

function updateDigit(digitElement, number) {
    // 移除原有的数字类
    digitElement.className = digitElement.className.replace(/\bdigit-\d\b/g, '');
    // 添加新的数字类
    digitElement.classList.add(`digit-${number}`);
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