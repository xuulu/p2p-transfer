// =============================================================
// OPFS（源私有文件系统）流式保存
// 接收端边收边写入磁盘，大文件不占内存；完成后可随时下载/删除
// =============================================================

const INBOX_DIR = 'p2p-transfer-inbox'

export interface OpfsWriter {
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>
  finish(): Promise<void>
  abort(): Promise<void>
}

export interface OpfsFileInfo {
  name: string
  size: number
}

/** 去除文件名中的路径分隔符与控制字符（防御路径穿越） */
function sanitizeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return cleaned || 'unnamed-file'
}

/** 打开（或覆盖创建）一个 OPFS 文件的可写流，返回边收边写句柄 */
export async function openOpfsWriter(rawName: string): Promise<OpfsWriter> {
  const name = sanitizeName(rawName)
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(INBOX_DIR, { create: true })
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable() // createWritable 会截断旧内容，天然覆盖
  return {
    write: (chunk) => writable.write(chunk),
    finish: async () => {
      await writable.close()
    },
    abort: async () => {
      try {
        await writable.abort()
      } catch {
        /* 已关闭则忽略 */
      }
    },
  }
}

/** 列出 OPFS 收件箱中已完成保存的文件 */
export async function listOpfsFiles(): Promise<OpfsFileInfo[]> {
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(INBOX_DIR, { create: true })
    const out: OpfsFileInfo[] = []
    // 部分运行时的类型声明未包含 entries()，做一次兼容桥接
    const iterable = dir as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>
    }
    for await (const [name, handle] of iterable.entries()) {
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile()
        out.push({ name, size: file.size })
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  } catch {
    return []
  }
}

/** 从 OPFS 触发浏览器下载 */
export async function downloadOpfsFile(rawName: string): Promise<boolean> {
  try {
    const name = sanitizeName(rawName)
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(INBOX_DIR, { create: true })
    const handle = await dir.getFileHandle(name)
    const file = await handle.getFile()
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  } catch {
    return false
  }
}

/** 从 OPFS 删除一个文件 */
export async function removeOpfsFile(rawName: string): Promise<boolean> {
  try {
    const name = sanitizeName(rawName)
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(INBOX_DIR, { create: true })
    await dir.removeEntry(name)
    return true
  } catch {
    return false
  }
}
