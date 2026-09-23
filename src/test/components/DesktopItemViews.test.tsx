import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { folderItemId, type FolderItem } from "@/lib/desktop-items";

/**
 * 文件夹面板的渲染回归测试。
 *
 * 重点覆盖"只显示 +N、没有图标"这类问题：测量未完成（jsdom 无布局，
 * clientWidth 为 0）时也必须渲染出书签，而不是退化成只有一个 +N。
 */

const useFolderBookmarks = vi.fn();

vi.mock("@/hooks/useFolderBookmarks", () => ({
  useFolderBookmarks: () => useFolderBookmarks(),
}));

vi.mock("@/lib/icon-manager", () => ({
  fetchIconFromSources: async () => null,
  getDomain: (url: string) => url,
  generateInitialBasedIcon: () => "",
}));

const { FolderPanelTile, FolderTile } = await import("@/components/DesktopItemViews");

const item: FolderItem = {
  id: folderItemId("f1"),
  type: "folder",
  folderId: "f1",
  name: "工作",
  w: 1,
  h: 1,
};

const makeBookmarks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `bm-${i}`,
    title: `书签${i}`,
    url: `https://site${i}.com`,
  }));

describe("FolderPanelTile", () => {
  beforeEach(() => {
    useFolderBookmarks.mockReset();
  });

  it("renders bookmark icons even before the grid size is measured", () => {
    // jsdom 没有布局，clientWidth/Height 恒为 0 → 走兜底格数
    useFolderBookmarks.mockReturnValue({ bookmarks: makeBookmarks(6), loading: false });
    render(<FolderPanelTile item={item} />);

    // 必须真的有图标，而不是只剩一个 +N
    expect(screen.queryByTitle("书签0")).not.toBeNull();
    expect(screen.queryByText("+6")).toBeNull();
  });

  it("shows icons and puts +N at the end when there is overflow", () => {
    useFolderBookmarks.mockReturnValue({ bookmarks: makeBookmarks(10), loading: false });
    render(<FolderPanelTile item={item} />);

    // 兜底 4 格：3 个图标 + "+7"
    expect(screen.queryByTitle("书签0")).not.toBeNull();
    expect(screen.queryByTitle("书签2")).not.toBeNull();
    expect(screen.queryByText("+7")).not.toBeNull();
  });

  it("renders every bookmark and no +N when they all fit", () => {
    useFolderBookmarks.mockReturnValue({ bookmarks: makeBookmarks(2), loading: false });
    render(<FolderPanelTile item={item} />);

    expect(screen.queryByTitle("书签0")).not.toBeNull();
    expect(screen.queryByTitle("书签1")).not.toBeNull();
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it("shows the folder title and an empty hint when the folder has no bookmarks", () => {
    useFolderBookmarks.mockReturnValue({ bookmarks: [], loading: false });
    render(<FolderPanelTile item={item} />);

    expect(screen.queryByText("工作")).not.toBeNull();
    expect(screen.queryByText("该文件夹内没有书签")).not.toBeNull();
  });
});

describe("FolderTile", () => {
  it("renders the plain folder icon without reading bookmarks", () => {
    useFolderBookmarks.mockClear();
    render(<FolderTile item={item} />);
    expect(screen.queryByText("工作")).not.toBeNull();
    // 普通图标态不依赖书签数据
    expect(useFolderBookmarks).not.toHaveBeenCalled();
  });
});
