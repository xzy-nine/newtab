/**
 * 时钟组件模块
 * 负责处理页面上的时钟显示
 */

/**
 * 初始化时钟
 */
export function initClock() {
    // 获取当前时间
    const now = new Date();
    
    // 设置时钟CSS变量
    const root = document.documentElement;
    
    // 设置初始时间
    root.style.setProperty('--h', now.getHours());
    root.style.setProperty('--m', now.getMinutes());
    root.style.setProperty('--s', now.getSeconds());
    
    // 设置delay变量，让动画从当前时间开始
    root.style.setProperty('--dh', now.getHours());
    root.style.setProperty('--dm', now.getMinutes());
    root.style.setProperty('--ds', now.getSeconds());
    
    // 使用JavaScript更新时间
    updateClockDisplay();
    
    // 定期更新时间
    setInterval(updateClockDisplay, 1000);
}

/**
 * 更新时钟显示
 */
export function updateClockDisplay() {
    // 保持现有代码不变
    // ...
}

/**
 * 更新时钟
 * 用于在需要时更新时钟
 */
export function updateClock() {
    // 调用内部实现
    updateClockDisplayInternal();
}

/**
 * 更新时钟显示
 */
function updateClockDisplayInternal() {
    const timeElement = document.getElementById('time');
    if (!timeElement) return;
    
    // 确保时钟元素结构完整
    if (!timeElement.querySelector('.hour') || !timeElement.querySelector('.minitus') || !timeElement.querySelector('.seconds')) {
        // 重建时钟结构
        timeElement.innerHTML = `
            <span class="hour"></span>
            <a class="split">:</a>
            <span class="minitus"></span>
            <a class="split">:</a>
            <span class="seconds"></span>
        `;
        
        // 应用样式确保分隔符不闪烁
        const splitElements = timeElement.querySelectorAll('.split');
        splitElements.forEach(el => {
            el.style.animation = 'none';
        });
    }

    // 调整时钟的位置和样式，确保它在搜索框上方
    timeElement.style.position = 'absolute';
    timeElement.style.top = '5%';
    timeElement.style.left = '50%';
    timeElement.style.transform = 'translateX(-50%)';
    timeElement.style.color = 'rgb(0, 0, 0)';
    timeElement.style.webkitTextStroke = '2px rgba(255, 255, 255, 0.541)';
    timeElement.style.zIndex = '1'; // 确保时钟在背景之上
    timeElement.style.fontSize = '700%';
}

/**
 * 更新时钟显示
 * 用于在标签页重新激活时更新时间
 */
export function refreshClock() {
    // 更新时钟显示
    updateClockDisplayInternal();
}