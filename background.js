// 后台脚本，用于监听搜索引擎切换的消息，获取必应每日图片，缓存图片和搜索引擎
const defaultEngine = "https://www.bing.com"; // 默认搜索引擎
const defaultIcon = "favicon.ico"; // 默认图标
const defaultImage = "images/bing-daily.jpg"; // 默认背景图片
const dailyUrl = "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1"; // 必应每日图片的接口

// 获取必应每日图片，并缓存到本地
function getBingDaily() {
  fetch(dailyUrl)
    .then(response => response.json())
    .then(data => {
      if (data && data.images && data.images.length > 0) {
        let imageUrl = "https://cn.bing.com" + data.images[0].url; // 获取图片的完整地址
        fetch(imageUrl)
          .then(response => response.blob())
          .then(blob => {
            let reader = new FileReader();
            reader.readAsDataURL(blob); // 将图片转换为base64编码
            reader.onloadend = function() {
              let base64data = reader.result;
              chrome.storage.local.set({bingDaily: base64data}); // 将图片缓存到本地存储
            }
          })
      }
    })
}

// 监听来自新标签页的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getEngine") { // 如果是获取搜索引擎的消息
    chrome.storage.local.get("engine", data => { // 从本地存储中获取搜索引擎
      let engine = data.engine || defaultEngine; // 如果没有设置过，就使用默认搜索引擎
      sendResponse({engine: engine}); // 将搜索引擎发送给新标签页
    });
    return true; // 表示异步响应
  } else if (message.action === "setEngine") { // 如果是设置搜索引擎的消息
    let engine = message.engine; // 获取要设置的搜索引擎
    chrome.storage.local.set({engine: engine}); // 将搜索引擎保存到本地存储
  } else if (message.action === "getImage") { // 如果是获取图片的消息
    getBingDaily(); // 调用获取图片的函数
  }
});
