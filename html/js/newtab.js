// 首先放置所有导入语句
import { loadBookmarks } from './bookmarks.js';
import { loadBingImage } from './backgroundImage.js';

// 新标签页的网页脚本，用于实现搜索引擎切换，收藏夹快捷方式，背景切换等功能

// 定义全局变量
const defaultEngine = "https://www.bing.com"; // 默认搜索引擎
const defaultIcon = "../Icon.png"; // 默认图标
let currentEngine = defaultEngine; // 当前搜索引擎
let currentFolder = ""; // 当前文件夹
let currentBackground = 0; // 当前背景，0表示必应每日图片，1表示自定义图片

// 添加全局DOM元素引用
let searchBox; 
let engineButton;
let engineIcon;
let searchInput;
let bookmarkBox;
let folderList;
let shortcutList;
let backgroundButton;

// 从后台脚本获取搜索引擎，并设置图标和链接
function getEngine() {
  chrome.runtime.sendMessage({action: "getEngine"}, response => { 
    let engineInfo = response.engine; 
    currentEngine = engineInfo; 
    
    // 从engineInfo中提取域名用于加载图标
    let iconDomain;
    try {
      const urlObj = new URL(engineInfo.baseUrl);
      iconDomain = urlObj.origin; // 获取域名部分
    } catch (e) {
      iconDomain = engineInfo.baseUrl;
    }
    
    engineIcon.src = iconDomain + "/favicon.ico"; 
    searchBox.action = engineInfo.baseUrl; 
    searchInput.name = engineInfo.searchParam;
  });
}

// 异步函数：设置背景函数，接受一个类型参数
async function setBackground(type) {
  console.log(getMessage("settingBackgroundType"), type);
  
  if (type === 0) {
    try {
      let data = await chrome.storage.local.get("bingDaily");
      if (!data.bingDaily) {
        console.log(getMessage("localStorageImageFailed"));
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "getWallpaper" }, response => {
            if (response && response.status === "success") {
              resolve();
            } else {
              console.log(getMessage("backgroundFetchFailed"));
            }
          });
        });
        data = await chrome.storage.local.get("bingDaily");
      }
      if (data.bingDaily) {
        document.body.style.background = `url(${data.bingDaily}) center center fixed`; 
      }
    } catch (error) {
      console.log(getMessage("bingDailyBackgroundFailed"), error);
    }
  }
  
  if (type === 1) {
    const data = await chrome.storage.local.get("DIYBackground");
    const imageUrl = data.DIYBackground;
    if (imageUrl) {
      console.log(getMessage("customBackgroundExists"), !!imageUrl);
      document.body.style.background = `url(${imageUrl}) center center fixed`;
    } else {
      document.body.style.background = '#808080';  // 设置灰色背景
    }
  }
}

async function getBackground() {
  const data = await chrome.storage.local.get("background");
  const background = data.background || 0;
  console.log(getMessage("currentBackgroundType"), background);
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

    // 添加右键点击事件监听器到快捷方式按钮
    shortcutButton.addEventListener('contextmenu', function(event) {
      event.preventDefault(); // 阻止默认的右键菜单

      let confirmAction = confirm(getMessage("confirmSetNewIcon")); // 使用 i18n 获取自定义文本
      if (confirmAction) {
        let fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = function(event) {
          let file = event.target.files[0];
          if (file) {
            let reader = new FileReader();
            reader.onload = function(e) {
              let base64Image = e.target.result;
              chrome.storage.local.set({ [shortcut.url]: base64Image }, () => {
                if (chrome.runtime.lastError) {
                  alert(getMessage("setIconFailed")); // 使用 i18n 获取错误提示文本
                } else {
                  shortcutButton.style.backgroundImage = `url(${base64Image})`; // 设置新的图标
                }
              });
            };
            reader.readAsDataURL(file);
          }
        };
        fileInput.click();
      } else {
        chrome.storage.local.remove(shortcut.url, () => {
          if (chrome.runtime.lastError) {
            alert(getMessage("deleteIconFailed")); // 使用 i18n 获取错误提示文本
          } else {
            getIconForShortcut(shortcut.url, shortcutButton); // 重新获取图标
          }
        });
      }
    });

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
  // 先设置默认图标作为背景
  button.style.backgroundImage = `url(${defaultIcon})`;

  try {
    // 尝试从浏览器本地存储获取缓存的图标
    const cached = await chrome.storage.local.get(url);
    if (cached[url] && !cached[url].startsWith('data:text/html')) {
      button.style.backgroundImage = `url(${cached[url]})`;
      return;
    }

    // 定义多个可能的图标URL来源:favicon.ico、Google API、faviconkit API和Yandex API
    const iconUrls = [
      `${getDomain(url)}/favicon.ico`,
      `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`,
      `https://api.faviconkit.com/${new URL(url).hostname}/64`,
      `https://favicon.yandex.net/favicon/${new URL(url).hostname}`
    ];

    // 尝试从网页HTML中获取图标链接
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const iconLink = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
        if (iconLink) {
          // 如果在HTML中找到图标链接，将其添加到图标URL列表的开头
          iconUrls.unshift(new URL(iconLink.getAttribute('href'), url).href);
        }
      }
    } catch (error) {
      console.log('获取HTML页面失败:', error);
    }

    // 依次尝试获取每个图标URL的内容
    for (const iconUrl of iconUrls) {
      try {
      const response = await fetch(iconUrl, {
        mode: 'cors',
        headers: { 'cache-control': 'no-cache' }
      });

      if (response.ok) {
        // 将图标转换为blob对象，再转为base64格式
        const blob = await response.blob();
        const base64data = await convertBlobToBase64(blob);
        
        // 确保不是文本数据且图片尺寸不小于5x5
        if (!base64data.startsWith('data:text')) {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = base64data;
        });
        
        if (img.width >= 5 && img.height >= 5) {
          // 将成功获取的图标保存到本地存储
          await chrome.storage.local.set({ [url]: base64data });
          button.style.backgroundImage = `url(${base64data})`;
          return;
        }
        }
      }
      } catch (error) {
      console.log(`从 ${iconUrl} 获取图标失败:`, error);
      }
    }

    // 如果所有获取图标的尝试都失败，使用默认图标
    button.style.backgroundImage = `url(${defaultIcon})`;

  } catch (error) {
    console.log('获取快捷方式图标时出错:', error);
    button.style.backgroundImage = `url(${defaultIcon})`;
  }
}

// 异步函数：将Blob对象转换为Base64字符串
async function convertBlobToBase64(blob) {
  // 返回一个Promise对象，用于异步处理转换过程
  return new Promise(resolve => {
    // 创建一个FileReader实例用于读取文件
    const reader = new FileReader();
    // 设置读取完成后的回调函数，返回转换结果
    reader.onloadend = () => resolve(reader.result);
    // 开始读取Blob对象并转换为DataURL格式
    reader.readAsDataURL(blob);
  });
}

// 统一使用DOMContentLoaded事件来初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 初始化时钟
  const d = new Date()
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const time = document.getElementById("time");
  time.style.setProperty('--ds', s)
  time.style.setProperty('--dm', m + s/60)
  time.style.setProperty('--dh', h + m/60 + s/3600)
  
  // 获取DOM元素并赋值给全局变量
  searchBox = document.getElementById("search-box"); 
  engineButton = document.getElementById("engine-button"); 
  engineIcon = document.getElementById("engine-icon"); 
  searchInput = document.getElementById("search-input"); 
  bookmarkBox = document.getElementById("bookmark-box"); 
  folderList = document.getElementById("folder-list"); 
  shortcutList = document.getElementById("shortcut-list"); 
  backgroundButton = document.getElementById("background-button"); 
  
  // 直接设置i18n内容，不依赖于动态加载的脚本
  searchInput.placeholder = getMessage("searchPlaceholder");
  backgroundButton.textContent = getMessage("backgroundButton");
  
  // 传递参数给函数
  setupEventHandlers(engineButton, searchBox, engineIcon, searchInput, backgroundButton);
  
  // 初始化应用
  await loadBookmarks();
  await loadBingImage();
  getEngine(); 
  getBackground(); 
  getBookmarks(); 
  chrome.runtime.sendMessage({action: "getWallpaper"});
  
  // 确保所有子文件夹在初始状态下都是隐藏的
  document.querySelectorAll('.folder-children').forEach(container => {
    container.style.display = 'none';
  });

  document.querySelectorAll('.folder-button').forEach(button => {
    button.addEventListener('click', () => {
      handleFolderClick(button);
    });
  });
});

// 设置事件处理程序
function setupEventHandlers(engineButton, searchBox, engineIcon, searchInput, backgroundButton) {
  // 设置搜索引擎切换按钮的点击事件
  engineButton.onclick = function() {
    let engineUrl = prompt(getMessage("enterEngineUrl")); 
    if (engineUrl) { 
      try {
        // 检查URL是否包含'='字符，表示这可能是一个搜索URL
        if (engineUrl.includes('=')) {
          // 尝试从输入的URL中解析出搜索引擎信息
          const urlObj = new URL(engineUrl);
          // 获取查询参数
          const params = new URLSearchParams(urlObj.search);
          
          // 查找可能的搜索参数名
          let searchParamName = '';
          for (const [name, value] of params.entries()) {
            // 找出最可能是搜索关键词的参数
            if (['q', 'query', 'word', 'text', 'w', 's', 'search', 'wd', 'kw', 'keyword'].includes(name)) {
              searchParamName = name;
              break;
            }
          }
          
          // 如果没有找到明确的搜索参数，使用第一个参数
          if (!searchParamName && params.keys().next().value) {
            searchParamName = params.keys().next().value;
          } else if (!searchParamName) {
            // 如果完全没有参数，默认使用'q'
            searchParamName = 'q';
          }
          
          // 提取搜索引擎的基础URL（去除查询参数部分）
          const baseUrl = urlObj.origin + urlObj.pathname;
          
          // 保存搜索引擎信息
          const engineInfo = {
            baseUrl: baseUrl,
            searchParam: searchParamName
          };
          
          // 更新当前搜索引擎
          currentEngine = engineInfo;
          
          // 设置图标和表单提交
          engineIcon.src = urlObj.origin + "/favicon.ico";
          searchBox.action = baseUrl;
          searchInput.name = searchParamName;
          
          // 保存到本地存储
          chrome.runtime.sendMessage({
            action: "setEngine", 
            engine: engineInfo
          });
        } else {
          // 如果URL不包含'='，按原来的方式处理
          if (!engineUrl.startsWith('http')) {
            engineUrl = 'https://' + engineUrl;
          }
          
          engineIcon.src = engineUrl + "/favicon.ico";
          searchBox.action = engineUrl + "/search";
          searchInput.name = "q";
          
          // 保存到本地存储
          chrome.runtime.sendMessage({
            action: "setEngine", 
            engine: { baseUrl: engineUrl + "/search", searchParam: "q" }
          });
        }
      } catch (e) {
        console.error("解析搜索引擎URL失败:", e);
        // 如果URL解析失败，尝试作为纯域名处理
        if (!engineUrl.startsWith('http')) {
          engineUrl = 'https://' + engineUrl;
        }
        
        engineIcon.src = engineUrl + "/favicon.ico";
        searchBox.action = engineUrl + "/search";
        searchInput.name = "q";
        
        // 保存到本地存储
        chrome.runtime.sendMessage({
          action: "setEngine", 
          engine: { baseUrl: engineUrl + "/search", searchParam: "q" }
        });
      }
    }
  };

  // 添加右键点击事件监听器到搜索引擎按钮
  engineButton.addEventListener('contextmenu', function(event) {
    event.preventDefault();
    let confirmClear = confirm(getMessage("confirmClear"));
    if (confirmClear) {
      chrome.storage.local.clear(() => {
        alert(getMessage("storageCleared"));
      });
    }
  });

  // 设置背景切换按钮的点击事件
  backgroundButton.onclick = function() {
    currentBackground = (currentBackground + 1) % 2;
    chrome.storage.local.set({background: currentBackground});
    getBackground();
  };

  // 添加右键点击事件监听器到背景按钮
  backgroundButton.addEventListener('contextmenu', function(event) {
    event.preventDefault();

    let fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = function(event) {
      let file = event.target.files[0];
      if (file) {
        let reader = new FileReader();
        reader.onload = function(e) {
          let base64Image = e.target.result;
          chrome.storage.local.set({DIYBackground: base64Image, background: 1}, () => {
            if (chrome.runtime.lastError) {
              alert(getMessage("backgroundSetFailed"));
            } else {
              getBackground();
            }
          });
        };
        reader.readAsDataURL(file);
      }
    };
    fileInput.click();
  });
}

// 获取并生成收藏夹文件夹按钮
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

// 导出工具函数
export async function fetchData(url) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch data from', url, error);
    throw error;
  }
}
