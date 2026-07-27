import { FileDown, FileSpreadsheet, FileText, Filter, Printer, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppData } from '../AppContext'
import type { AnimalStatus } from '../types'
import { exportAnimalsPdf, exportAnimalsWord, exportHandlingSheetPdf } from '../utils/exporters'
import { formatCoat, statusLabel } from '../utils/format'

export function Reports() {
  const { animals } = useAppData()
  const [status, setStatus] = useState<string>('ativos')
  const [query, setQuery] = useState('')
  const [generating, setGenerating] = useState<string | null>(null)

  const selectedAnimals = useMemo(() => {
    const q = query.trim().toLowerCase()
    return animals.filter((animal) => {
      const matchesQuery = !q || [animal.number, animal.breed, animal.lot, animal.origin, animal.notes]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(q))
      const matchesStatus = status === 'todos'
        || (status === 'ativos' && !['morto', 'vendido'].includes(animal.status))
        || animal.status === status
      return matchesQuery && matchesStatus
    })
  }, [animals, status, query])

  // As fotos são baixadas e embutidas no documento, então a geração é assíncrona.
  async function generate(kind: string, task: () => Promise<void>) {
    if (generating) return
    setGenerating(kind)
    try {
      await task()
    } finally {
      setGenerating(null)
    }
  }

  function exportCsv() {
    const header = ['Número', 'Situação', 'Sexo', 'Raça', 'Pelagem', 'Nascimento', 'Peso', 'Local ou lote', 'Origem', 'Observações', 'Link da foto']
    const rows = selectedAnimals.map((animal) => [
      animal.number,
      statusLabel[animal.status],
      animal.sex,
      animal.breed || '',
      formatCoat(animal.coat),
      animal.birth_date || '',
      animal.weight ?? '',
      animal.lot || '',
      animal.origin || '',
      animal.notes || '',
      animal.photo_url?.startsWith('http') ? animal.photo_url : ''
    ])
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'relacao-animais.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Papel e arquivo digital</span><h1>Documentos</h1><p>Prepare fichas, relações e folhas de controle prontas para impressão.</p></div>
      </div>

      <section className="panel report-filter-panel">
        <div className="panel-head"><div><span className="eyebrow">Seleção dos dados</span><h2>Quais animais devem entrar no documento?</h2></div><strong className="selection-count">{selectedAnimals.length} selecionados</strong></div>
        <div className="filters-panel embedded">
          <label className="search-box"><Search size={20} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por número, raça ou local" /></label>
          <label className="select-box"><Filter size={18} /><select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ativos">Somente animais ativos</option>
            <option value="todos">Todos os animais</option>
            {(Object.keys(statusLabel) as AnimalStatus[]).map((key) => <option key={key} value={key}>{statusLabel[key]}</option>)}
          </select></label>
        </div>
      </section>

      <section className="report-grid">
        <article className="report-card">
          <div className="report-icon"><FileText /></div>
          <span className="eyebrow">Relação completa</span>
          <h2>Lista dos animais</h2>
          <p>Foto, número, situação, sexo, raça, peso, local e observações em formato de tabela.</p>
          <div className="report-actions">
            <button className="button button-primary" onClick={() => void generate('lista-pdf', () => exportAnimalsPdf(selectedAnimals))} disabled={!selectedAnimals.length || Boolean(generating)}><FileDown size={18} /> {generating === 'lista-pdf' ? 'Gerando' : 'PDF'}</button>
            <button className="button button-secondary" onClick={() => void generate('lista-word', () => exportAnimalsWord(selectedAnimals))} disabled={!selectedAnimals.length || Boolean(generating)}><FileDown size={18} /> {generating === 'lista-word' ? 'Gerando' : 'Word'}</button>
          </div>
        </article>

        <article className="report-card featured-report">
          <div className="report-icon"><Printer /></div>
          <span className="eyebrow">Uso no curral</span>
          <h2>Folha de controle de manejo</h2>
          <p>Gera uma folha com a foto de cada animal e espaço para presença, situação, peso, observação e assinatura do responsável.</p>
          <div className="report-actions"><button className="button button-light" onClick={() => void generate('manejo', () => exportHandlingSheetPdf(selectedAnimals))} disabled={Boolean(generating)}><Printer size={18} /> {generating === 'manejo' ? 'Gerando' : 'Preparar folha'}</button></div>
        </article>

        <article className="report-card">
          <div className="report-icon"><FileSpreadsheet /></div>
          <span className="eyebrow">Planilha</span>
          <h2>Arquivo CSV</h2>
          <p>Compatível com Excel para manter uma cópia dos dados ou realizar análises adicionais.</p>
          <div className="report-actions"><button className="button button-secondary" onClick={exportCsv} disabled={!selectedAnimals.length}><FileDown size={18} /> Baixar CSV</button></div>
        </article>
      </section>

      <section className="panel document-notice">
        <FileText size={24} />
        <div><strong>Ficha individual</strong><p>Para gerar a ficha de apenas um animal, abra o cadastro dele e escolha PDF, Word ou impressão direta.</p></div>
      </section>
    </>
  )
}
