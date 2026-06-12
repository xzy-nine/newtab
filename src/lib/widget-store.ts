import { create } from "zustand";

export interface WidgetItemData {
  type: string;
  id: string;
  title?: string;
  data?: Record<string, unknown>;
}

export interface WidgetContainerData {
  id: string;
  folderId?: string;
  fixed: boolean;
  activeIndex: number;
  items: WidgetItemData[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WidgetStore {
  containers: WidgetContainerData[];
  hydrate: (folderId?: string) => Promise<void>;
  addContainer: (container: WidgetContainerData) => void;
  updateContainer: (id: string, partial: Partial<WidgetContainerData>) => void;
  removeContainer: (id: string) => void;
  addItem: (containerId: string, item: WidgetItemData) => void;
  removeItem: (containerId: string, itemId: string) => void;
  updateItemData: (containerId: string, itemId: string, data: Record<string, unknown>) => void;
  setActiveIndex: (containerId: string, index: number) => void;
  persist: () => Promise<void>;
}

const WIDGETS_KEY = "widgetsData";

export const useWidgetStore = create<WidgetStore>((set, get) => ({
  containers: [],

  hydrate: async (folderId?: string) => {
    try {
      const result = (await chrome.storage.local.get(WIDGETS_KEY)) as Record<string, unknown>;
      const raw = result[WIDGETS_KEY];
      const allContainers: WidgetContainerData[] = Array.isArray(raw)
        ? (raw as WidgetContainerData[])
        : [];
      if (folderId) {
        set({ containers: allContainers.filter((c) => c.folderId === folderId) });
      } else {
        set({ containers: allContainers });
      }
    } catch (e) {
      console.error("加载小部件数据失败:", e);
    }
  },

  addContainer: (container) => {
    set((state) => ({ containers: [...state.containers, container] }));
    get().persist();
  },

  updateContainer: (id, partial) => {
    set((state) => ({
      containers: state.containers.map((c) => (c.id === id ? { ...c, ...partial } : c)),
    }));
    get().persist();
  },

  removeContainer: (id) => {
    set((state) => ({
      containers: state.containers.filter((c) => c.id !== id),
    }));
    get().persist();
  },

  addItem: (containerId, item) => {
    set((state) => ({
      containers: state.containers.map((c) =>
        c.id === containerId ? { ...c, items: [...c.items, item], activeIndex: c.items.length } : c,
      ),
    }));
    get().persist();
  },

  removeItem: (containerId, itemId) => {
    set((state) => ({
      containers: state.containers.map((c) => {
        if (c.id !== containerId) return c;
        const newItems = c.items.filter((it) => it.id !== itemId);
        const newIndex = Math.min(c.activeIndex, Math.max(0, newItems.length - 1));
        return { ...c, items: newItems, activeIndex: newIndex };
      }),
    }));
    get().persist();
  },

  updateItemData: (containerId, itemId, data) => {
    set((state) => ({
      containers: state.containers.map((c) =>
        c.id === containerId
          ? {
              ...c,
              items: c.items.map((it) =>
                it.id === itemId ? { ...it, data: { ...it.data, ...data } } : it,
              ),
            }
          : c,
      ),
    }));
    get().persist();
  },

  setActiveIndex: (containerId, index) => {
    set((state) => ({
      containers: state.containers.map((c) =>
        c.id === containerId ? { ...c, activeIndex: index } : c,
      ),
    }));
  },

  persist: async () => {
    try {
      const { containers } = get();
      const result = (await chrome.storage.local.get(WIDGETS_KEY)) as Record<string, unknown>;
      const raw = result[WIDGETS_KEY];
      const allContainers: WidgetContainerData[] = Array.isArray(raw)
        ? (raw as WidgetContainerData[])
        : [];
      const map = new Map(allContainers.map((c) => [c.id, c]));
      containers.forEach((c) => map.set(c.id, c));
      await chrome.storage.local.set({ [WIDGETS_KEY]: Array.from(map.values()) });
    } catch (e) {
      console.error("保存小部件数据失败:", e);
    }
  },
}));
