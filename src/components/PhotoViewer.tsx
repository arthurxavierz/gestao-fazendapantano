import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  src: string
  alt: string
  caption?: string
  onClose: () => void
}

/**
 * Foto em tela cheia, para conferir de perto o número do brinco e comparar com
 * o que a IA interpretou. Fecha com Esc, com o botão ou clicando no fundo.
 */
export function PhotoViewer({ src, alt, caption, onClose }: Props) {
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    // Impede a página de rolar por trás enquanto a foto está aberta.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={alt} onMouseDown={onClose}>
      <div className="photo-viewer-bar" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="photo-viewer-button" onClick={() => setZoomed((current) => !current)}>
          {zoomed ? <><ZoomOut size={18} /> Reduzir</> : <><ZoomIn size={18} /> Ampliar</>}
        </button>
        <button type="button" className="photo-viewer-button" onClick={onClose} aria-label="Fechar foto">
          <X size={18} /> Fechar
        </button>
      </div>

      <div className={`photo-viewer-stage ${zoomed ? 'is-zoomed' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          onClick={() => setZoomed((current) => !current)}
          title={zoomed ? 'Clique para reduzir' : 'Clique para ampliar'}
        />
      </div>

      {caption && <p className="photo-viewer-caption" onMouseDown={(e) => e.stopPropagation()}>{caption}</p>}
    </div>
  )
}
