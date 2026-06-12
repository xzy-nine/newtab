export function Popup() {
  return (
    <div className="w-80 p-4">
      <h1 className="text-lg font-bold mb-4">新标签页扩展</h1>
      <button
        className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
        onClick={() => {
          chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html") });
          window.close();
        }}
      >
        打开新标签页
      </button>
    </div>
  );
}
