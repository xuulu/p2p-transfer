// =============================================================
// 信令节点可用性探测（浏览器端，真实网络环境）
// 用原生 WebSocket 发起一次握手，打开即可用；超时/失败即不可用。
// =============================================================

export type ProbeState = 'checking' | 'ok' | 'fail'

export interface ProbeItem {
  state: ProbeState
  ms?: number
}

export function probeTracker(
  url: string,
  timeoutMs = 6000,
): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    if (typeof WebSocket === 'undefined') {
      resolve({ ok: false, ms: 0 })
      return
    }
    // 带用户信息的 URL（如 wss://public:public@host）在浏览器 WebSocket 构造时会报错，
    // 探测只关心传输层可达性，先去掉凭据部分
    const probeUrl = url.replace(/^(wss?):\/\/[^@/]+@/, '$1://')
    const t0 = performance.now()
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Math.round(performance.now() - t0) })
    }
    let ws: WebSocket
    try {
      ws = new WebSocket(probeUrl)
    } catch {
      resolve({ ok: false, ms: 0 })
      return
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    ws.onopen = () => {
      clearTimeout(timer)
      finish(true)
    }
    ws.onerror = () => {
      clearTimeout(timer)
      finish(false)
    }
  })
}

/** 批量探测，返回 url → 结果 映射 */
export async function probeTrackers(urls: string[]): Promise<Record<string, ProbeItem>> {
  const entries = await Promise.all(
    urls.map(async (url) => {
      const r = await probeTracker(url)
      return [url, { state: r.ok ? ('ok' as const) : ('fail' as const), ms: r.ms }] as const
    }),
  )
  return Object.fromEntries(entries)
}
