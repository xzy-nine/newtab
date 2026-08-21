/**
 * 侧边栏浏览器的轻量导航通道。
 *
 * 让侧边栏内各处（主页搜索、书签、桌面图标）以及后台"重定向回侧边栏"的
 * 消息，都能通知 SidePanel 切到浏览模式并加载对应 URL。用模块级订阅集实现，
 * 不依赖 DOM，便于组件间解耦与单元测试。
 */

type Listener = (url: string) => void;

const listeners = new Set<Listener>();

/** 通知侧边栏在浏览器 iframe 中打开 url（若在浏览模式则直接导航）。 */
export function emitSidebarNavigate(url: string): void {
  for (const listener of listeners) listener(url);
}

/** 订阅侧边栏导航事件，返回取消订阅函数（HMR 安全）。 */
export function onSidebarNavigate(callback: Listener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
