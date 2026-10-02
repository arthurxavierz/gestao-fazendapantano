import { Save, Settings2 } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useAppData } from '../AppContext'
import { Alert, Field, PageHeading } from '../components/ui'
import { defaultSettings } from '../domain/reproduction'
import type { FarmSettings } from '../types'

/** Regras que mudam de uma fazenda para outra. Só o administrador altera. */
export function Settings() {
  const { settings, updateSettings } = useAppData()
  const [form, setForm] = useState<FarmSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => setForm(settings), [settings])

  const set = (key: keyof FarmSettings, value: string) => setForm((current) => ({ ...current, [key]: Number(value) }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await updateSettings(form)
      setMessage({ tone: 'success', text: 'Regras salvas. O quadro de reprodução e a agenda já usam os novos valores.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Não foi possível salvar.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeading eyebrow="Administração" title="Regras da fazenda" text="Estes números orientam os alertas, a agenda e a regra de descarte reprodutivo." />
      <form className="form-layout narrow" onSubmit={submit}>
        <section className="panel form-panel">
          <div className="form-section-title"><span><Settings2 size={16} /></span><div><h2>Reprodução</h2><p>Valores padrão de mercado para gado de corte. Ajuste com o veterinário.</p></div></div>
          <div className="form-grid two">
            <Field label="Tentativas sem prenhez até o descarte" hint={`Na ${form.max_breeding_attempts}ª tentativa sem prenhez, o sistema sugere enviar a matriz para abate.`}>
              <input type="number" min={1} max={10} value={form.max_breeding_attempts} onChange={(e) => set('max_breeding_attempts', e.target.value)} />
            </Field>
            <Field label="Duração da gestação (dias)" hint="Nelore fica perto de 292; taurinos, perto de 283.">
              <input type="number" min={250} max={320} value={form.gestation_days} onChange={(e) => set('gestation_days', e.target.value)} />
            </Field>
            <Field label="Diagnóstico após a inseminação (dias)" hint="Usado quando o protocolo não tem etapa de diagnóstico.">
              <input type="number" min={20} max={120} value={form.diagnosis_days} onChange={(e) => set('diagnosis_days', e.target.value)} />
            </Field>
            <Field label="Idade mínima para reprodução (meses)" hint="Fêmeas mais novas não aparecem como aptas.">
              <input type="number" min={8} max={36} value={form.min_breeding_age_months} onChange={(e) => set('min_breeding_age_months', e.target.value)} />
            </Field>
          </div>
        </section>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={() => setForm(defaultSettings)}>Restaurar padrão</button>
          <button className="button button-primary" disabled={saving}><Save size={18} /> {saving ? 'Salvando' : 'Salvar regras'}</button>
        </div>
      </form>
    </>
  )
}
