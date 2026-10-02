import { Check, Search } from 'lucide-react'
import { ReactNode, useMemo, useState } from 'react'
import { animalCategory, byNumber, expandNumberRange } from '../domain/herd'
import type { Animal } from '../types'
import { categoryLabel } from '../utils/format'

/**
 * Seleção de vários animais para um manejo em lote (protocolo, vacina,
 * pesagem). No curral a seleção é quase sempre "o lote inteiro" ou "estes
 * brincos aqui", então os dois caminhos são diretos: filtro por lote com
 * "marcar todos", ou colar a lista de números.
 */
export function AnimalMultiPicker({
  animals,
  selected,
  onChange,
  renderExtra,
  emptyText = 'Nenhum animal disponível para este manejo.'
}: {
  animals: Animal[]
  selected: string[]
  onChange: (ids: string[]) => void
  renderExtra?: (animal: Animal) => ReactNode
  emptyText?: string
}) {
  const [query, setQuery] = useState('')
  const [lot, setLot] = useState('todos')
  const [category, setCategory] = useState('todas')
  const [pasteMode, setPasteMode] = useState(false)
  const [pasted, setPasted] = useState('')
  const [pasteResult, setPasteResult] = useState<string | null>(null)

  const lots = useMemo(() => [...new Set(animals.map((item) => item.lot).filter(Boolean) as string[])].sort(), [animals])
  const categories = useMemo(() => [...new Set(animals.map((item) => animalCategory(item)).filter(Boolean) as string[])], [animals])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return animals
      .filter((item) => (lot === 'todos' || item.lot === lot)
        && (category === 'todas' || animalCategory(item) === category)
        && (!q || [item.number, item.breed, item.lot].filter(Boolean).some((value) => String(value).toLowerCase().includes(q))))
      .sort(byNumber)
  }, [animals, query, lot, category])

  const selectedSet = new Set(selected)
  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selectedSet.has(item.id))

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((item) => item !== id) : [...selected, id])
  }

  function toggleAll() {
    const ids = filtered.map((item) => item.id)
    if (allFilteredSelected) onChange(selected.filter((id) => !ids.includes(id)))
    else onChange([...new Set([...selected, ...ids])])
  }

  function applyPaste() {
    const numbers = expandNumberRange(pasted)
    const byNum = new Map(animals.map((item) => [item.number, item.id]))
    const found = numbers.map((number) => byNum.get(number)).filter(Boolean) as string[]
    const missing = numbers.filter((number) => !byNum.has(number))
    onChange([...new Set([...selected, ...found])])
    setPasteResult(`${found.length} marcados${missing.length ? `. Não encontrados ou fora deste manejo: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}` : '.'}`)
    setPasted('')
  }

  return (
    <div className="picker">
      <div className="picker-toolbar">
        <label className="search-box compact"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar brinco, raça ou lote" /></label>
        {lots.length > 1 && (
          <select className="select-compact" value={lot} onChange={(e) => setLot(e.target.value)}>
            <option value="todos">Todos os lotes</option>
            {lots.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        )}
        {categories.length > 1 && (
          <select className="select-compact" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="todas">Todas as categorias</option>
            {categories.map((item) => <option key={item} value={item}>{categoryLabel[item as keyof typeof categoryLabel]}</option>)}
          </select>
        )}
      </div>

      <div className="picker-bar">
        <button type="button" className="text-button" onClick={toggleAll} disabled={!filtered.length}>
          {allFilteredSelected ? 'Desmarcar os exibidos' : `Marcar os ${filtered.length} exibidos`}
        </button>
        <button type="button" className="text-button" onClick={() => setPasteMode((value) => !value)}>Digitar lista de brincos</button>
        <strong className="picker-count">{selected.length} selecionado{selected.length === 1 ? '' : 's'}</strong>
      </div>

      {pasteMode && (
        <div className="picker-paste">
          <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Ex.: 301-310, 315, 320" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPaste() } }} />
          <button type="button" className="button button-secondary" onClick={applyPaste} disabled={!pasted.trim()}>Marcar</button>
          {pasteResult && <small>{pasteResult}</small>}
        </div>
      )}

      <div className="picker-list">
        {filtered.map((animal) => {
          const isOn = selectedSet.has(animal.id)
          const cat = animalCategory(animal)
          return (
            <button type="button" key={animal.id} className={`picker-item ${isOn ? 'selected' : ''}`} onClick={() => toggle(animal.id)}>
              <span className="picker-check">{isOn && <Check size={14} />}</span>
              <span className="picker-main">
                <strong>{animal.number}</strong>
                <small>{[cat ? categoryLabel[cat] : null, animal.lot].filter(Boolean).join(' · ') || 'Sem lote'}</small>
              </span>
              {renderExtra?.(animal)}
            </button>
          )
        })}
        {!filtered.length && <p className="muted picker-empty">{animals.length ? 'Nenhum animal corresponde ao filtro.' : emptyText}</p>}
      </div>
    </div>
  )
}

/** Escolha de um único animal por busca, usada para indicar a mãe. */
export function AnimalSearchSelect({
  animals,
  value,
  onChange,
  placeholder = 'Digite o brinco'
}: {
  animals: Animal[]
  value: string | null | undefined
  onChange: (id: string | null) => void
  placeholder?: string
}) {
  const current = animals.find((item) => item.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return animals
      .filter((item) => !q || item.number.toLowerCase().includes(q) || (item.breed ?? '').toLowerCase().includes(q))
      .sort(byNumber)
      .slice(0, 40)
  }, [animals, query])

  if (current && !open) {
    return (
      <div className="search-select-chip">
        <span><strong>{current.number}</strong> {current.breed ? `· ${current.breed}` : ''}</span>
        <button type="button" className="text-button" onClick={() => { onChange(null); setOpen(true) }}>Trocar</button>
      </div>
    )
  }

  return (
    <div className="search-select">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
      />
      {open && (
        <ul className="search-select-menu">
          {options.map((item) => (
            <li key={item.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(item.id); setQuery(''); setOpen(false) }}>
                <strong>{item.number}</strong>
                <span>{[item.breed, item.lot].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
          {!options.length && <li className="search-select-empty">Nenhum animal encontrado</li>}
        </ul>
      )}
    </div>
  )
}
