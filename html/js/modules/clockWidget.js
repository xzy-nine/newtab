//时钟组件模块


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
    
    // 添加窗口大小变化监听，以调整时钟大小
    window.addEventListener('resize', adjustClockSize);
    // 初始调整
    adjustClockSize();
}

/**
 * 创建时钟DOM元素
 */
function createClockElement() {
    if (document.getElementById('time')) return;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.id = 'time';
    
    // 创建一个内部容器来强制单行布局
    const innerContainer = document.createElement('div');
    innerContainer.className = 'time-inner-container';
    timeDiv.appendChild(innerContainer);

    // 创建小时组
    const hourGroup = document.createElement('div');
    hourGroup.className = 'hour-group';
    const hourTens = createDigit();
    const hourOnes = createDigit();
    hourGroup.append(hourTens, hourOnes);

    // 创建第一个冒号
    const colon1 = createColon();
    colon1.classList.add('blink');
    
    // 创建分钟组
    const minuteGroup = document.createElement('div');
    minuteGroup.className = 'minute-group';
    const minuteTens = createDigit();
    const minuteOnes = createDigit();
    minuteGroup.append(minuteTens, minuteOnes);
    
    // 创建第二个冒号
    const colon2 = createColon();
    colon2.classList.add('blink');
    
    // 创建秒钟组
    const secondGroup = document.createElement('div');
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

function createDigit() {
    const digit = document.createElement('div');
    digit.className = 'digit';
    
    // 创建7段数码管加小数点，共8个部分
    const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
    segments.forEach(seg => {
        const segment = document.createElement('div');
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
        // 移除console.error调试代码
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
 * 保存时钟设置
 */
export async function saveClockSettings(settings) {
    try {
        Object.assign(clockConfig, settings);
        
        await chrome.storage.local.set({
            clockEnabled: clockConfig.enabled,
            clockFormat24h: clockConfig.format24h,
            clockShowSeconds: clockConfig.showSeconds
        });
        
        updateClockVisibility();
        updateClock();
        
        return true;
    } catch (error) {
        // 移除console.error调试代码
        return false;
    }
}

/**
 * 获取当前时钟设置
 */
export function getClockSettings() {
    return {...clockConfig};
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