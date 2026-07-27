import type { Animal } from '../types'

export interface ExportImage {
  dataUrl: string
  bytes: Uint8Array
  width: number
  height: number
}

interface LoadOptions {
  maxSide?: number
  square?: boolean
}

const cache = new Map<string, Promise<ExportImage | null>>()

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  ])
}

async function decodeBlob(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob)
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'))
      image.src = objectUrl
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
}

async function render(url: string, options: LoadOptions): Promise<ExportImage | null> {
  const maxSide = options.maxSide ?? 900
  const response = await fetch(url, { mode: 'cors' })
  if (!response.ok) return null
  const source = await decodeBlob(await response.blob())

  const sourceWidth = source.width
  const sourceHeight = source.height
  if (!sourceWidth || !sourceHeight) return null

  let sx = 0
  let sy = 0
  let sWidth = sourceWidth
  let sHeight = sourceHeight

  // Recorte central quando o destino é um quadradinho, para não distorcer o animal.
  if (options.square) {
    const side = Math.min(sourceWidth, sourceHeight)
    sx = (sourceWidth - side) / 2
    sy = (sourceHeight - side) / 2
    sWidth = side
    sHeight = side
  }

  const scale = Math.min(1, maxSide / Math.max(sWidth, sHeight))
  const width = Math.max(1, Math.round(sWidth * scale))
  const height = Math.max(1, Math.round(sHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, width, height)
  if ('close' in source && typeof source.close === 'function') source.close()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return { dataUrl, bytes: base64ToBytes(base64), width, height }
}

/**
 * Baixa a foto, normaliza para JPEG e devolve os bytes prontos para PDF e Word.
 * Devolve null quando a foto não existe ou não pôde ser lida, para que o
 * documento continue sendo gerado mesmo sem imagem.
 */
export function loadExportImage(url?: string | null, options: LoadOptions = {}): Promise<ExportImage | null> {
  if (!url) return Promise.resolve(null)
  const key = `${options.square ? 'sq' : 'fit'}:${options.maxSide ?? 900}:${url}`
  const cached = cache.get(key)
  if (cached) return cached

  const task = withTimeout(render(url, options), 15000).catch(() => null)
  cache.set(key, task)
  return task
}

/** Carrega as miniaturas de uma lista de animais, indexadas pelo id do animal. */
export async function loadAnimalImages(animals: Animal[], options: LoadOptions = {}) {
  const entries = await Promise.all(
    animals.map(async (animal) => [animal.id, await loadExportImage(animal.photo_url, options)] as const)
  )
  const map = new Map<string, ExportImage>()
  for (const [id, image] of entries) if (image) map.set(id, image)
  return map
}

/** Calcula largura e altura que cabem numa caixa, mantendo a proporção da foto. */
export function fitInside(image: { width: number; height: number }, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
  return { width: image.width * scale, height: image.height * scale }
}
