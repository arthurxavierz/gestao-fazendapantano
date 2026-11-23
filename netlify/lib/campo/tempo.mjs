// Datas no fuso da fazenda.
//
// As funções do Netlify rodam em UTC. Sem fixar o fuso, um áudio gravado às
// 22h de Brasília seria lançado no dia seguinte. O TZ é ajustado antes de
// qualquer cálculo; o Node aplica a troca na hora.
process.env.TZ = process.env.FARM_TIMEZONE || 'America/Sao_Paulo'

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function isoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function addDaysISO(iso, days) {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

export function diffDays(from, to) {
  return Math.round((new Date(`${to.slice(0, 10)}T12:00:00`) - new Date(`${from.slice(0, 10)}T12:00:00`)) / 86400000)
}

/** "21/11" */
export function br(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}${y !== String(new Date().getFullYear()) ? `/${y}` : ''}`
}

/** "sexta, 21/11 às 14:32" */
export function brDateTime(date) {
  const d = new Date(date)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${WEEKDAYS[d.getDay()]}, ${br(isoDate(d))} às ${hh}:${mm}`
}

/** "2h10", "35 min" */
export function humanDelay(ms) {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`
}

export function weekday(iso) {
  return WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()]
}
