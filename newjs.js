// 新标签页的网页脚本，用于实现搜索引擎切换，收藏夹快捷方式，背景切换等功能
const searchBox = document.getElementById("search-box"); // 获取搜索框容器
const engineButton = document.getElementById("engine-button"); // 获取搜索引擎切换按钮
const engineIcon = document.getElementById("engine-icon"); // 获取搜索引擎图标
const searchInput = document.getElementById("search-input"); // 获取搜索框输入框
const bookmarkBox = document.getElementById("bookmark-box"); // 获取收藏夹容器
const folderList = document.getElementById("folder-list"); // 获取文件夹列表
const shortcutList = document.getElementById("shortcut-list"); // 获取快捷方式列表
const backgroundButton = document.getElementById("background-button"); // 获取背景切换按钮
const defaultEngine = "https://www.bing.com"; // 默认搜索引擎
const defaultIcon = "favicon.ico"; // 默认图标
const defaultImage = "images/bing-daily.jpg"; // 默认背景图片
let currentEngine = defaultEngine; // 当前搜索引擎
let currentFolder = ""; // 当前文件夹
let currentBackground = 0; // 当前背景，0表示白色，1表示必应每日图片

// 从后台脚本获取搜索引擎，并设置图标和链接
function getEngine() {
  chrome.runtime.sendMessage({action: "getEngine"}, response => { // 向后台脚本发送获取搜索引擎的消息
    let engine = response.engine; // 获取后台脚本返回的搜索引擎
    currentEngine = engine; // 设置当前搜索引擎
    engineIcon.src = engine + "/favicon.ico"; // 设置搜索引擎图标
    searchBox.action = engine + "/search"; // 设置搜索框的链接
  });
}

// 从本地存储获取背景，并设置背景
function getBackground() {
  chrome.storage.local.get("background", data => { // 从本地存储中获取背景
    let background = data.background || 0; // 如果没有设置过，就使用默认背景
    currentBackground = background; // 设置当前背景
    if (background === 0) { // 如果是白色背景
      document.body.style.background = "white"; // 设置背景颜色为白色
    } else if (background === 1) { // 如果是必应每日图片背景
      chrome.storage.local.get("bingDaily", data => { // 从本地存储中获取必应每日图片
        let bingDaily = data.bingDaily || defaultImage; // 如果没有缓存过，就使用默认图片
        document.body.style.background = `url(${bingDaily}) no-repeat center center fixed`; // 设置背景图片为必应每日图片
        document.body.style.backgroundSize = "cover"; // 设置背景图片的大小为覆盖整个网页
      });
    }
  });
}

// 从浏览器获取收藏夹，并生成文件夹和快捷方式
function getBookmarks() {
  chrome.bookmarks.getTree(tree => { // 从浏览器获取收藏夹的树形结构
    let root = tree[0]; // 获取收藏夹的根节点
    let folders = getAllFolders(root); // 获取所有文件夹节点，包括次级文件夹
    for (let folder of folders) { // 遍历每个文件夹
      let folderButton = document.createElement("button"); // 创建一个文件夹按钮
      folderButton.className = "folder-button"; // 设置文件夹按钮的类名
      folderButton.innerText = folder.title; // 设置文件夹按钮的文本为文件夹的标题
      folderButton.onclick = function() { // 设置文件夹按钮的点击事件
        currentFolder = folder.id; // 设置当前文件夹为该文件夹的id
        chrome.storage.local.set({folder: currentFolder}); // 将当前文件夹保存到本地存储
        showShortcuts(folder); // 显示该文件夹的快捷方式
      };
      folderList.appendChild(folderButton); // 将文件夹按钮添加到文件夹列表中
    }
    chrome.storage.local.get("folder", data => { // 从本地存储中获取上次展示的文件夹
      let folder = data.folder || root.id; // 如果没有记录过，就使用根节点
      currentFolder = folder; // 设置当前文件夹为该文件夹
      showShortcuts(folders.find(f => f.id === folder)); // 显示该文件夹的快捷方式
    });
  });
}

// 获取一个节点下的所有文件夹节点，包括次级文件夹
function getAllFolders(node) {
  let folders = []; // 创建一个空数组，用于存储文件夹节点
  if (node.children) { // 如果该节点有子节点
    for (let child of node.children) { // 遍历每个子节点
      if (child.children) { // 如果该子节点是文件夹节点
        folders.push(child); // 将该子节点添加到文件夹数组中
        folders = folders.concat(getAllFolders(child)); // 将该子节点下的所有文件夹节点也添加到文件夹数组中
      }
    }
  }
  return folders; // 返回文件夹数组
}

// 显示指定文件夹的快捷方式
function showShortcuts(folder) {
  shortcutList.innerHTML = ""; // 清空快捷方式列表的内容
  let shortcuts = folder.children.filter(node => !node.children); // 筛选出快捷方式节点
  for (let shortcut of shortcuts) { // 遍历每个快捷方式
    let shortcutButton = document.createElement("button"); // 创建一个快捷方式按钮
    shortcutButton.className = "shortcut-button"; // 设置快捷方式按钮的类名
    shortcutButton.innerHTML = `<img src="${getDomain(shortcut.url)}/favicon.ico" alt="快捷方式图标" onerror="this.style.display='none'">${shortcut.title}`; // 设置快捷方式按钮的内容，包括图标和标题，如果图标无法加载，就隐藏图标
    shortcutButton.onclick = function() { // 设置快捷方式按钮的点击事件
      window.open(shortcut.url, "_blank"); // 在新标签页中打开快捷方式的链接
    };
    shortcutList.appendChild(shortcutButton); // 将快捷方式按钮添加到快捷方式列表中
  }
}

// 获取一个链接的域名部分
function getDomain(url) {
  let a = document.createElement("a"); // 创建一个a元素
  a.href = url; // 设置a元素的href属性为链接
  return a.origin; // 返回a元素的origin属性，即域名部分
}

// 设置搜索引擎切换按钮的点击事件
engineButton.onclick = function() {
  let engine = prompt("请输入要切换的搜索引擎的官网链接，例如：https://www.google.com"); // 弹出一个输入框，提示用户输入搜索引擎的链接
  if (engine) { // 如果用户输入了内容
    currentEngine = engine; // 设置当前搜索引擎为用户输入的内容
    chrome.runtime.sendMessage({action: "setEngine", engine: currentEngine}); // 向后台脚本发送设置搜索引擎的消息
    engineIcon.src = engine + "/favicon.ico"; // 设置搜索引擎图标
    searchBox.action = engine + "/search"; // 设置搜索框的链接
  }
};

// 设置背景切换按钮的点击事件
backgroundButton.onclick = function() {
  currentBackground = 1 - currentBackground; // 切换当前背景
  chrome.storage.local.set({background: currentBackground}); // 将当前背景保存到本地存储
  getBackground(); // 获取并设置背景
};

// 在新标签页加载时，执行以下函数
window.onload = function() {
    getEngine(); // 获取并设置搜索引擎
    getBackground(); // 获取并设置背景
    getBookmarks(); // 获取并生成收藏夹
    chrome.runtime.sendMessage({action: "getImage"}); // 向后台脚本发送获取图片的消息
  };
  
