/**
 * 模型列表的状态封装。
 *
 * 把原先在组件里重复两遍（初次加载 + 手动刷新）的 `fetch('/v1/models')`
 * 逻辑收敛到这里，并统一走 `listModels`（含 zod 校验与地址推导）。
 */

import { useCallback, useMemo, useState } from "react";
import { useAsyncEffect } from "@reactuses/core";
import type { AIProvider } from "@/lib/app-settings";
import { isProviderReady, listModels, type ProviderCredentials } from "@/lib/ai";

export interface ModelCatalog {
  models: string[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * 拉取并缓存某个提供商的可用模型列表。
 *
 * @param provider 当前提供商；地址或密钥变化时会自动重新拉取。
 */
export function useModelCatalog(provider: AIProvider | undefined): ModelCatalog {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const apiUrl = provider?.apiUrl ?? "";
  const apiKey = provider?.apiKey ?? "";

  // 只依赖地址与密钥：避免父组件每次渲染传入新对象导致重复请求。
  const credentials = useMemo<ProviderCredentials>(() => ({ apiUrl, apiKey }), [apiUrl, apiKey]);

  const load = useCallback(async (creds: ProviderCredentials) => {
    if (!isProviderReady(creds)) {
      setModels([]);
      return;
    }
    setLoading(true);
    try {
      setModels(await listModels(creds));
    } finally {
      setLoading(false);
    }
  }, []);

  useAsyncEffect(
    async () => {
      await load(credentials);
    },
    () => {},
    [credentials, load],
  );

  const refresh = useCallback(async () => {
    await load(credentials);
  }, [credentials, load]);

  return { models, loading, refresh };
}
