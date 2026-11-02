export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function today() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function dateTimeLocal(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  headers.set('X-Client-Date', today())
  let response: Response
  try {
    response = await fetch(path, { ...init, headers, credentials: 'include' })
  } catch {
    throw new ApiError(0, '当前离线，暂时连不上个人服务')
  }
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new ApiError(response.status, data.message || '请求失败')
  return data as T
}

export function uploadReport(body: unknown, onProgress: (value: number) => void, signal?: AbortSignal) {
  return new Promise<{ user: import('./types').UserData; report: import('./types').Report }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/reports')
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('X-Client-Date', today())
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      const data = xhr.responseText ? JSON.parse(xhr.responseText) : {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new ApiError(xhr.status, data.message || '上传失败'))
    }
    xhr.onerror = () => reject(new ApiError(0, '上传失败'))
    xhr.onabort = () => reject(new ApiError(0, '已取消上传'))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(JSON.stringify(body))
  })
}

export async function downloadFile(path: string, filename: string) {
  const response = await fetch(path, { credentials: 'include', headers: { 'X-Client-Date': today() } })
  if (!response.ok) throw new ApiError(response.status, '导出失败')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
