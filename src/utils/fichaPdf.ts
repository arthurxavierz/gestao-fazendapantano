import { jsPDF } from 'jspdf'
import { brand } from '../brand'
import { LINHAS_POR_PAGINA } from '../domain/ficha'
import { faixaDoAnimal } from '../domain/regras'
import type { Animal, FichaCampo } from '../types'
import { loadExportImage } from './images'
import { data } from './format'

/**
 * Ficha de campo em A4 deitado: uma linha por animal, com quadradinhos para
 * marcar com X. O código da ficha (F-0001) e a página vão grandes no topo, e
 * há marcas nos cantos, para a IA achar e endireitar a folha na foto.
 */
export async function gerarFichaPdf(ficha: FichaCampo, animais: Animal[], comFotos = true) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297
  const H = 210
  const M = 9
  const rowH = 7.5
  const green: [number, number, number] = [31, 78, 61]
  const c = ficha.colunas
  const paginas = Math.max(1, Math.ceil(animais.length / LINHAS_POR_PAGINA))
  const fotos = comFotos ? await Promise.all(animais.map((item) => loadExportImage(item.foto_url, { maxSide: 120, square: true }))) : []

  // Colunas: [título, largura, subtítulos dos quadradinhos]
  type Col = { key: string; title: string; w: number; boxes?: string[] }
  const cols: Col[] = [
    { key: 'n', title: 'Nº', w: 7 },
    ...(comFotos ? [{ key: 'foto', title: 'Foto', w: 10 }] : []),
    { key: 'brinco', title: 'Brinco', w: 17 },
    { key: 'atual', title: 'Hoje', w: 21 },
    ...(ficha.manejo ? [{ key: 'presente', title: 'Veio', w: 11, boxes: ['X'] }] : []),
    ...(c.sexo ? [{ key: 'sexo', title: 'Sexo', w: 15, boxes: ['M', 'F'] }] : []),
    ...(c.faixa ? [{ key: 'faixa', title: 'Faixa (meses)', w: 27, boxes: ['1', '2', '3', '4'] }] : []),
    ...(c.peso ? [{ key: 'peso', title: 'Peso (kg)', w: 18 }] : []),
    ...(c.diagnostico ? [{ key: 'diag', title: 'Prenha/Vazia', w: 20, boxes: ['P', 'V'] }] : []),
    ...(c.saida ? [{ key: 'saida', title: 'Saiu', w: 27, boxes: ['M', 'V', 'D'] }] : [])
  ]
  const used = cols.reduce((sum, col) => sum + col.w, 0)
  cols.push({ key: 'obs', title: 'Observação', w: W - 2 * M - used })

  const box = (x: number, y: number, size = 3.6) => { doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.3); doc.rect(x, y, size, size) }

  for (let page = 0; page < paginas; page += 1) {
    if (page > 0) doc.addPage()
    // Marcas de canto.
    doc.setFillColor(0, 0, 0)
    for (const [x, y] of [[3, 3], [W - 8, 3], [3, H - 8], [W - 8, H - 8]]) doc.rect(x, y, 5, 5, 'F')

    doc.setTextColor(...green)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(`${brand.name} · ${ficha.titulo}`, M + 3, M + 6)
    doc.setFontSize(22)
    doc.text(ficha.codigo, W - M - 3, M + 7, { align: 'right' })
    doc.setFontSize(10)
    doc.setTextColor(60, 60, 60)
    doc.text(`Página ${page + 1} de ${paginas}`, W - M - 3, M + 12.5, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    const linha2 = [`Data: ${data(ficha.data)}`, ficha.manejo ? `Manejo do dia: ${ficha.manejo}${ficha.produtos ? ` (${ficha.produtos})` : ''}` : null, 'Responsável: ______________________'].filter(Boolean).join('     ')
    doc.text(linha2, M + 3, M + 12.5)
    doc.setFontSize(8.5)
    doc.setTextColor(30, 30, 30)
    doc.text(`Marque com X. Faixa: 1 = 0 a 12 meses · 2 = 13 a 24 · 3 = 25 a 36 · 4 = acima de 36.${c.saida ? ' Saiu: M = morreu · V = vendeu · D = descarte.' : ''}${ficha.manejo ? ' Veio = passou no manejo do dia.' : ''} Só marque o que mudou ou estava em branco.`, M + 3, M + 17.5)

    const top = M + 21
    let x = M
    doc.setFillColor(...green)
    doc.rect(M, top, W - 2 * M, rowH, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.6)
    for (const col of cols) {
      doc.text(col.title, x + col.w / 2, top + (col.boxes ? 3.2 : 4.8), { align: 'center', maxWidth: col.w - 1 })
      if (col.boxes) {
        const step = col.w / col.boxes.length
        col.boxes.forEach((label, i) => doc.text(label, x + step * i + step / 2, top + 6.6, { align: 'center' }))
      }
      x += col.w
    }

    const slice = animais.slice(page * LINHAS_POR_PAGINA, (page + 1) * LINHAS_POR_PAGINA)
    slice.forEach((animal, r) => {
      const y = top + rowH * (r + 1)
      const n = page * LINHAS_POR_PAGINA + r + 1
      if (r % 2 === 1) { doc.setFillColor(243, 246, 243); doc.rect(M, y, W - 2 * M, rowH, 'F') }
      doc.setDrawColor(170, 170, 170)
      doc.setLineWidth(0.15)
      doc.line(M, y + rowH, W - M, y + rowH)
      let cx = M
      for (const col of cols) {
        doc.setTextColor(20, 20, 20)
        if (col.key === 'n') { doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(String(n), cx + col.w / 2, y + 4.9, { align: 'center' }) }
        if (col.key === 'foto') {
          const img = fotos[page * LINHAS_POR_PAGINA + r]
          if (img) doc.addImage(img.bytes, 'JPEG', cx + 1.5, y + 0.4, rowH - 0.8, rowH - 0.8)
        }
        if (col.key === 'brinco') { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(animal.brinco, cx + col.w / 2, y + 5.3, { align: 'center' }) }
        if (col.key === 'atual') {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 90, 90)
          doc.text(`${animal.sexo ?? '—'} · ${faixaDoAnimal(animal)?.replace(' a ', '-').replace('Acima de 36', '36+') ?? 's/ faixa'}`, cx + col.w / 2, y + 4.9, { align: 'center' })
        }
        if (col.boxes) {
          const step = col.w / col.boxes.length
          col.boxes.forEach((_, i) => box(cx + step * i + step / 2 - 1.8, y + 1.95))
        }
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.1)
        doc.line(cx, y, cx, y + rowH)
        cx += col.w
      }
    })
    doc.setDrawColor(120, 120, 120)
    doc.setLineWidth(0.3)
    doc.rect(M, top, W - 2 * M, rowH * (slice.length + 1))
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text(`${ficha.codigo} · fotografe a folha inteira, de cima e com boa luz, e envie em Fichas de campo.`, W / 2, H - 4.5, { align: 'center' })
  }
  doc.save(`Ficha_${ficha.codigo}_${ficha.data}.pdf`)
}
