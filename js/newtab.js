// 新标签页的网页脚本，用于实现搜索引擎切换，收藏夹快捷方式，背景切换等能
const d = new Date()
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  time.style.setProperty('--ds', s)
  time.style.setProperty('--dm', m + s/60)
  time.style.setProperty('--dh', h + m/60 + s/3600)  
const searchBox = document.getElementById("search-box"); // 获取搜索框容器
const engineButton = document.getElementById("engine-button"); // 获取搜索引擎切换按钮
const engineIcon = document.getElementById("engine-icon"); // 获取搜索引擎图标
const searchInput = document.getElementById("search-input"); // 获取搜索框输入框
const bookmarkBox = document.getElementById("bookmark-box"); // 获取收藏夹容器
const folderList = document.getElementById("folder-list"); // 获取文件夹列表
const shortcutList = document.getElementById("shortcut-list"); // 获取快捷方式列表
const backgroundButton = document.getElementById("background-button"); // 获取背景切换按钮
const defaultEngine = "https://www.bing.com"; // 默认搜索引擎
const defaultIcon = "../Icon.png"; // 默认图标
let currentEngine = defaultEngine; // 当前搜索引擎
let currentFolder = ""; // 当前文件夹
let currentBackground = 0; // 当前背景，0表示灰色，1表示必应每日图片

// 从后台脚本获取搜索引擎，并设置图标和链接
function getEngine() {
  chrome.runtime.sendMessage({action: "getEngine"}, response => { // 向后台脚本发送获取搜索引擎的消息
    let engine = response.engine; // 获取后台脚本返回的搜索引擎
    currentEngine = engine; // 设置当前搜索引擎
    engineIcon.src = engine + "/favicon.ico"; // 设置搜索引擎图标
    searchBox.action = engine + "/search"; // 设置搜索框的链接
  });
}

async function setBackground(type) {
  if (type === 0) {
    document.body.style.background = "gray";
    return;
  }
  
  const data = await chrome.storage.local.get("bingDaily");
  const imageUrl = data.bingDaily || defaultImage;
  document.body.style.background = `url(${imageUrl}) no-repeat center center fixed`;
  document.body.style.backgroundSize = "cover";
}

// 修改 getBackground 函数
async function getBackground() {
  const data = await chrome.storage.local.get("background");
  const background = data.background || 0;
  currentBackground = background;
  await setBackground(background);
}

// 获取并生成收藏夹
function getBookmarks() {
  chrome.bookmarks.getTree(tree => {
    let root = tree[0];
    let folders = getAllFolders(root);
    createFolderButtons(folders, folderList);
    chrome.storage.local.get("folder", data => {
      let folder = data.folder || root.id;
      currentFolder = folder;
      showShortcuts(folders.find(f => f.id === folder));
    });
  });
}

// 获取一个节点下的所有文件夹节点，包括次级文件夹
function getAllFolders(node) {
  let folders = []; // 创建一个空数组，用于存储文件夹节点
  if (node.children) { // 如果该节点有子节点
    for (let child of node.children) { // 遍历每个子节点
      if (child.children && child.children.length > 0) { // 如果该子节点是文件夹节点且包含子节点
        folders.push(child); // 将该子节点添加到文件夹数组中
      }
    }
  }
  return folders; // 返回文件夹数组
}

// 显示指定文件夹的快捷方式
function showShortcuts(folder) {
  shortcutList.innerHTML = ""; // 清空快捷方式列表的内容

  if (!folder || !folder.children || folder.children.length === 0) {
    shortcutList.style.display = "none"; // 隐藏快捷方式列表容器
    return;
  }

  let shortcuts = folder.children.filter(node => !node.children); // 筛选出快捷方式节点

  if (shortcuts.length === 0) {
    shortcutList.style.display = "none"; // 隐藏快捷方式列表容器
    return;
  }

  shortcutList.style.display = "flex"; // 显示快捷方式列表容器

  for (let shortcut of shortcuts) { // 遍历每个快捷方式
    let shortcutButton = document.createElement("button"); // 创建一个快捷方式按钮
    shortcutButton.className = "shortcut-button"; // 设置快捷方式按钮的类名

    getIconForShortcut(shortcut.url, shortcutButton);

    shortcutButton.innerText = shortcut.title; // 设置快捷方式按钮的文本为快捷方式的标题
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


async function getIconForShortcut(url, button) {
  // 先设置为默认图标
  button.style.backgroundImage = `url(${defaultIcon})`;

  try {
    // 尝试从本地获取
    const cached = await chrome.storage.local.get(url);
    if (cached[url]) {
      if (cached[url].startsWith('data:text/html')) {
        await chrome.storage.local.remove(url);
      } else {
        button.style.backgroundImage = `url(${cached[url]})`;
        return;
      }
    }
  } catch (cacheError) {
    console.error('Error accessing local storage:', cacheError);
  }

  // 尝试使用域名加 /favicon.ico 获取图标
  const domain = getDomain(url);
  const fallbackIconUrl = `${domain}/favicon.ico`;
  try {
    const fallbackResponse = await fetch(fallbackIconUrl, { 
      mode: 'cors', 
      headers: { 'cache-control': 'no-cache' } 
    });

    if (fallbackResponse.ok) {
      const blob = await fallbackResponse.blob();
      const base64data = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      // 检查获取到的是否为有效图标
      if (!base64data.startsWith('data:text')) {
        button.style.backgroundImage = `url(${base64data})`;
        try {
          await chrome.storage.local.set({ [url]: base64data });
        } catch (storageError) {
          console.error('Error saving to local storage:', storageError);
        }
        return;
      }
    }
  } catch (fallbackError) {
    console.error('Error fetching icon from fallback URL:', fallbackError);
  }  
  


  // 使用 FaviconKit API 获取高分辨率图标
  const iconUrl = `https://api.faviconkit.com/${new URL(url).hostname}/64`;
  try {
    const response = await fetch(iconUrl, { 
      mode: 'cors', 
      headers: { 'cache-control': 'no-cache' } 
    });
    
    if (response.ok) {
      const blob = await response.blob();
      const base64data = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      
      button.style.backgroundImage = `url(${base64data})`;
      try {
        await chrome.storage.local.set({ [url]: base64data });
      } catch (storageError) {
        console.error('Error saving to local storage:', storageError);
      }
      return;
    }
  } catch (apiError) {
    console.error('Error fetching icon from FaviconKit API:', apiError);
  }
  // 使用 Google Favicon API 获取图标
  const googleIconUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`;
  try {
    const response = await fetch(googleIconUrl, { 
      mode: 'cors', 
      headers: { 'cache-control': 'no-cache' } 
    });

    if (response.ok) {
      const blob = await response.blob();
      const base64data = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
      });

      button.style.backgroundImage = `url(${base64data})`;
      try {
      await chrome.storage.local.set({ [url]: base64data });
      } catch (storageError) {
      console.error('Error saving to local storage:', storageError);
      }
      return;
    }
  } catch (googleApiError) {
    console.error('Error fetching icon from Google Favicon API:', googleApiError);
  }

  // 使用 Yandex Favicon API 获取图标
  const yandexIconUrl = `https://favicon.yandex.net/favicon/${new URL(url).hostname}`;
  try {
    const response = await fetch(yandexIconUrl, { 
      mode: 'cors', 
      headers: { 'cache-control': 'no-cache' } 
    });
  
    if (response.ok) {
      const blob = await response.blob();
      const base64data = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
  
      button.style.backgroundImage = `url(${base64data})`;
      try {
        await chrome.storage.local.set({ [url]: base64data });
      } catch (storageError) {
        console.error('Error saving to local storage:', storageError);
      }
      return;
    }
  } catch (yandexApiError) {
    console.error('Error fetching icon from Yandex Favicon API:', yandexApiError);
  }




  // 如果所有尝试都失败，保持默认图像
  button.style.backgroundImage = `url(${defaultIcon})`;
}

// 引入 i18n.js
const script = document.createElement('script');
script.src = 'js/i18n.js';
document.head.appendChild(script);

script.onload = function() {
  // 设置搜索框的占位符文本
  const searchInput = document.getElementById("search-input");
  searchInput.placeholder = getMessage("searchPlaceholder");

  // 设置背景按钮的文本
  const backgroundButton = document.getElementById("background-button");
  backgroundButton.textContent = getMessage("backgroundButton");
};

// 设置搜索引擎切换按钮的点击事件
engineButton.onclick = function() {
  let engine = prompt(getMessage("enterEngineUrl")); // 弹出一个输入框，提示用户输入搜索引擎的链接
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

function createFolderButtons(folders, parentElement, level = 0) {
  for (let folder of folders) {
    if (folder.children) { // 确保只处理文件夹
      let folderButton = document.createElement("div");
      folderButton.className = "folder-button";
      folderButton.innerHTML = `<span class="folder-icon">📁</span><span class="folder-name">${folder.title}</span>`;
      folderButton.style.marginLeft = `${level * 20}px`; // 根据层级设置左边距
      folderButton.onclick = function() {
        handleFolderClick(folderButton, folder);
      };
      parentElement.appendChild(folderButton);

      let subFolderContainer = document.createElement("div");
      subFolderContainer.className = "folder-children";
      subFolderContainer.style.display = 'none'; // 初始隐藏子文件夹
      parentElement.appendChild(subFolderContainer);

      // 递归创建子文件夹按钮
      createFolderButtons(folder.children, subFolderContainer, level + 1);
    }
  }
}

// 添加文件夹点击处理函数
function handleFolderClick(folderButton, folder) {
  folderButton.classList.toggle('open');
  const children = folderButton.nextElementSibling;
  if (children && children.classList.contains('folder-children')) {
    children.style.display = children.style.display === 'block' ? 'none' : 'block';
  }
  if (folder) {
    showShortcuts(folder);
  }
}

// 确保所有子文件夹在初始状态下都是隐藏的
document.querySelectorAll('.folder-children').forEach(container => {
  container.style.display = 'none';
});

document.querySelectorAll('.folder-button').forEach(button => {
  button.addEventListener('click', () => {
    handleFolderClick(button);
  });
});

// 添加右键点击事件监听器
backgroundButton.addEventListener('contextmenu', function(event) {
  event.preventDefault(); // 阻止默认的右键菜单
  let confirmClear = confirm(getMessage("confirmClear")); // 弹出确认提示
  if (confirmClear) {
    chrome.storage.local.clear(() => { // 清空本地存储
      alert(getMessage("storageCleared")); // 提示用户本地存储已清除
    });
  }
});
