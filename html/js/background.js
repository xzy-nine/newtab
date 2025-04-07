import { fetchData } from './modules/utils.js';

self.addEventListener('install', (event) => {
  console.log('Service Worker 安装');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker 激活');
});

// 移除了fetchBingImage函数和相关常量
// 服务工作线程仍保留其他功能