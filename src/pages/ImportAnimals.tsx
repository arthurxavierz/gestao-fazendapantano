import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { ChangeEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { saveAnimalsBatch } from '../services/repository'
import {
  buildPreview,
  guessMapping,
  importFieldLabel,
  type ImportField,
  type ImportPreview
} from '../utils/importAnimals'
import { readSpreadsheet, type SheetData } from '../utils/spreadsheet'

const fields = Object.keys(importFieldLabel) as ImportField[]

export function ImportAnimals() {
  const navigate = useNavigate()
  const { animals, refresh } = useAppData()

  const [sheet, setSheet] = useState<SheetData | null>(null)
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<Record<ImportField, number | null> | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ saved: number; failed: number } | null>(null)

  const existingNumbers = useMemo(
    () => new Set(animals.map((animal) => animal.number)),
    [animals]
  )

  const preview: ImportPreview | null = useMemo(() => {
    if (!sheet || !mapping) return null
    return buildPreview(sheet.rows, mapping, existingNumbers)
  }, [sheet, mapping, existingNumbers])

  const toImport = useMemo(() => {
    if (!preview) return []
    return overwrite ? preview.valid : preview.valid.filter((row) => !row.duplicated)
  }, [preview, overwrite])

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setReading(true)
    setError(null)
    setResult(null)
    try {
      const data = await readSpreadsheet(file)
      if (!data.headers.length) throw new Error('A planilha parece estar vazia.')
      if (!data.rows.length) throw new Error('A planilha tem cabeçalho, mas nenhuma linha de dados.')
      setSheet(data)
      setFileName(file.name)
      setMapping(guessMapping(data.headers))
    } catch (err) {
      setSheet(null)
      setMapping(null)
      setError(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.')
    } finally {
      setReading(false)
      event.target.value = ''
    }
  }

  async function runImport() {
    if (!toImport.length) return
    setImporting(true)
    setError(null)
    try {
      const outcome = await saveAnimalsBatch(toImport.map((row) => row.animal))
      setResult(outcome)
      await refresh()
      if (!outcome.failed) {
        setSheet(null)
        setMapping(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a importação.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <button className="back-button" onClick={() => navigate('/animais')}><ArrowLeft size={18} /> Voltar para animais</button>

      <div className="page-heading">
        <div>
          <span className="eyebrow">Somente administradores</span>
          <h1>Importar planilha</h1>
          <p>Traga o controle que já existe em Excel ou CSV sem digitar tudo de novo.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className={`alert ${result.failed ? 'alert-error' : 'alert-success'}`}>
          {result.failed
            ? `${result.saved} animais importados e ${result.failed} com falha. Confira a lista e tente novamente os que faltaram.`
            : `${result.saved} animais importados com sucesso.`}
        </div>
      )}

      {/* Passo 1 */}
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Passo 1</span><h2>Escolha o arquivo</h2></div></div>
        <label className="import-dropzone">
          <FileSpreadsheet size={30} />
          <strong>{reading ? 'Lendo a planilha' : fileName || 'Selecionar arquivo .xlsx ou .csv'}</strong>
          <span>A primeira linha precisa conter os títulos das colunas.</span>
          <input type="file" accept=".xlsx,.csv,text/csv" onChange={selectFile} disabled={reading} />
        </label>
        <p className="panel-note">
          Planilhas antigas no formato <code>.xls</code> precisam ser abertas no Excel e salvas como <code>.xlsx</code> ou <code>.csv</code>.
        </p>
      </section>

      {sheet && mapping && (
        <>
          {/* Passo 2 */}
          <section className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Passo 2</span><h2>Confira o que é cada coluna</h2></div>
              <strong className="selection-count">{sheet.rows.length} linhas</strong>
            </div>
            <p className="panel-note">
              O sistema tentou adivinhar pelos títulos. Corrija o que estiver errado e deixe em
              <em> Não importar </em> o que não for usar. Só o número do animal é obrigatório.
            </p>

            <div className="mapping-grid">
              {fields.map((field) => (
                <label className="field" key={field}>
                  <span>{importFieldLabel[field]}{field === 'number' && ' *'}</span>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [field]: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">Não importar</option>
                    {sheet.headers.map((header, index) => (
                      <option key={index} value={index}>{header || `Coluna ${index + 1}`}</option>
                    ))}
                  </select>
                  {mapping[field] !== null && sheet.rows[0] && (
                    <small className="mapping-sample">Exemplo: {sheet.rows[0][mapping[field]!] || '(vazio)'}</small>
                  )}
                </label>
              ))}
            </div>
          </section>

          {/* Passo 3 */}
          {preview && (
            <section className="panel">
              <div className="panel-head"><div><span className="eyebrow">Passo 3</span><h2>Confira antes de gravar</h2></div></div>

              <div className="import-summary">
                <article className="is-ok"><CheckCircle2 /><div><strong>{toImport.length}</strong><span>serão importados</span></div></article>
                <article><AlertTriangle /><div><strong>{preview.existingInBase}</strong><span>já cadastrados</span></div></article>
                <article className={preview.invalid.length ? 'is-bad' : ''}><AlertTriangle /><div><strong>{preview.invalid.length}</strong><span>com problema</span></div></article>
              </div>

              {preview.existingInBase > 0 && (
                <label className="checkbox-field import-overwrite">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                  <span>Atualizar os animais que já existem, sobrescrevendo os dados atuais pelos da planilha</span>
                </label>
              )}

              {preview.invalid.length > 0 && (
                <div className="import-problems">
                  <strong>Linhas que serão ignoradas</strong>
                  <ul>
                    {preview.invalid.slice(0, 12).map((row) => (
                      <li key={row.line}><span>Linha {row.line}</span> {row.problems.join(' · ')}</li>
                    ))}
                  </ul>
                  {preview.invalid.length > 12 && <small>e mais {preview.invalid.length - 12} linhas.</small>}
                </div>
              )}

              {toImport.length > 0 && (
                <div className="import-preview-table">
                  <table>
                    <thead>
                      <tr><th>Número</th><th>Raça</th><th>Sexo</th><th>Nascimento</th><th>Peso</th><th>Local</th></tr>
                    </thead>
                    <tbody>
                      {toImport.slice(0, 8).map((row) => (
                        <tr key={row.line}>
                          <td><strong>{row.animal.number}</strong></td>
                          <td>{row.animal.breed || '—'}</td>
                          <td>{row.animal.sex === 'nao_informado' ? '—' : row.animal.sex === 'macho' ? 'Macho' : 'Fêmea'}</td>
                          <td>{row.animal.birth_date || '—'}</td>
                          <td>{row.animal.weight == null ? '—' : `${row.animal.weight} kg`}</td>
                          <td>{row.animal.lot || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {toImport.length > 8 && <small>Mostrando 8 de {toImport.length} linhas.</small>}
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="button button-ghost" onClick={() => { setSheet(null); setMapping(null) }}>Cancelar</button>
                <button type="button" className="button button-primary" onClick={() => void runImport()} disabled={importing || !toImport.length}>
                  <Upload size={18} /> {importing ? 'Importando' : `Importar ${toImport.length} animais`}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
