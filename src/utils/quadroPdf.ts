import { jsPDF } from 'jspdf'
import { brand } from '../brand'
import { CODIGOS_QUADRO, hoje } from '../domain/regras'
import { data } from './format'

export interface ItemQuadro {
  brinco: string
  sexo: string
  faixa: string
  situacao: string
  pend: number
}

/**
 * Quadro de campo (lona), igual à VBA GerarQuadro: 6 blocos de colunas com os
 * animais e um 7º bloco para ocorrências. Página grande e vetorial, para a
 * gráfica ampliar sem perder qualidade.
 */
export async function gerarQuadroPdf(itens: ItemQuadro[], nAnimais: number, nBezerros: number) {
  const blocos = 6
  const porBloco = Math.max(25, Math.ceil(itens.length / blocos))
  const margin = 14
  const rowH = 7.2
  const headerH = 34
  const colW = [20, 9, 18, 30, 10, 48] // brinco, sexo, faixa, situação, pend., anotação
  const blocoW = colW.reduce((a, b) => a + b, 0)
  const gap = 5
  const ocorrW = 150
  const width = margin * 2 + blocos * (blocoW + gap) + ocorrW
  const height = margin * 2 + headerH + rowH * (porBloco + 1)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [height, width] })
  const green: [number, number, number] = [31, 78, 61]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...green)
  doc.text(`QUADRO DE CAMPO DO REBANHO · ${brand.name.toUpperCase()}`, margin, margin + 9)
  doc.setFontSize(14)
  doc.setTextColor(60, 60, 60)
  doc.text(`Atualizado em ${data(hoje())}   |   ${nAnimais} animais e ${nBezerros} bezerros ao pé`, margin, margin + 17)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12.5)
  doc.setTextColor(20, 20, 20)
  const legenda = 'Escreva na coluna ANOTAÇÃO do animal: CÓDIGO + detalhe.     ' + Object.entries(CODIGOS_QUADRO).map(([c, l]) => `${c} = ${l}`).join('     ')
  doc.text(legenda, margin, margin + 26)

  const top = margin + headerH
  const heads = ['Brinco', 'Sexo', 'Faixa', 'Situação', 'Pend.', 'ANOTAÇÃO']

  const drawHeader = (x: number, labels: string[], widths: number[]) => {
    let cx = x
    labels.forEach((label, i) => {
      doc.setFillColor(...green)
      doc.rect(cx, top, widths[i], rowH, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.text(label, cx + widths[i] / 2, top + rowH / 2 + 1.3, { align: 'center' })
      cx += widths[i]
    })
  }

  let k = 0
  for (let b = 0; b < blocos; b += 1) {
    const x0 = margin + b * (blocoW + gap)
    drawHeader(x0, heads, colW)
    for (let r = 0; r < porBloco; r += 1) {
      const y = top + rowH * (r + 1)
      if (r % 2 === 0) {
        doc.setFillColor(242, 246, 243)
        doc.rect(x0, y, blocoW - colW[5], rowH, 'F')
      }
      doc.setDrawColor(150, 150, 150)
      doc.setLineWidth(0.15)
      let cx = x0
      for (const w of colW) { doc.rect(cx, y, w, rowH); cx += w }
      const item = itens[k]
      if (item && k < itens.length) {
        const values = [item.brinco, item.sexo, item.faixa, item.situacao, item.pend ? String(item.pend) : '']
        let tx = x0
        values.forEach((value, i) => {
          doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
          doc.setFontSize(i === 0 ? 10.5 : i === 3 ? 7.5 : 9)
          doc.setTextColor(i === 4 ? 192 : 20, i === 4 ? 0 : 20, i === 4 ? 0 : 20)
          const text = doc.splitTextToSize(String(value), colW[i] - 1.5)[0] ?? ''
          doc.text(text, tx + colW[i] / 2, y + rowH / 2 + 1.2, { align: 'center' })
          tx += colW[i]
        })
      }
      k += 1
    }
  }

  // Bloco de ocorrências.
  const ox = margin + blocos * (blocoW + gap)
  const ow = [22, 20, 12, ocorrW - 54]
  drawHeader(ox, ['Data', 'Brinco', 'Cód.', 'OCORRÊNCIAS: o que aconteceu'], ow)
  for (let r = 0; r < porBloco; r += 1) {
    const y = top + rowH * (r + 1)
    let cx = ox
    for (const w of ow) { doc.rect(cx, y, w, rowH); cx += w }
  }

  doc.save(`Quadro_rebanho_${hoje()}.pdf`)
}
