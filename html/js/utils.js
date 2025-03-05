/**
 * 通用工具函数模块
 */

/**
 * 从URL获取数据并解析为JSON
 * @param {string} url - 请求的URL
 * @returns {Promise<Object>} - 解析后的JSON对象
 */
export async function fetchData(url) {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch data from', url, error);
        throw error;
    }
}

/**
 * 将Blob对象转换为base64字符串
 * @param {Blob} blob - 需要转换的Blob对象
 * @returns {Promise<string>} - 转换后的base64字符串
 */
export function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}