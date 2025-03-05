// 使用消息传递机制代替直接导入

export async function loadBingImage() {
    try {
        // 使用消息传递从后台服务工作线程获取图片
        const imageData = await getBingImageFromBackground();
        
        if (imageData) {
            // 设置背景图片
            document.body.style.backgroundImage = `url(${imageData})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundRepeat = 'no-repeat';
        } else {
            console.error('未能获取必应每日图片');
        }
    } catch (error) {
        console.error('加载必应图片失败:', error);
    }
}

// 向后台脚本请求必应图片
async function getBingImageFromBackground() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { action: "getWallpaper" },
            async () => {
                // 发送消息后，从本地存储获取图片
                const data = await chrome.storage.local.get("bingDaily");
                resolve(data.bingDaily || null);
            }
        );
    });
}