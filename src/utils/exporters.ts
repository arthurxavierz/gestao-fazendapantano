import { saveAs } from 'file-saver'
import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from 'docx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Animal } from '../types'
import { formatCoat, formatDate, formatWeight, sexLabel, statusLabel } from './format'
import { fitInside, loadAnimalImages, loadExportImage, type ExportImage } from './images'

const brand = 'Fazenda Pântano'
const green: [number, number, number] = [23, 63, 44]

// Miniatura usada nas listas e foto grande usada nas fichas individuais.
const THUMB = { maxSide: 320, square: true } as const
const PORTRAIT = { maxSide: 1100 } as const

function safeFileName(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string))
}

function animalRows(animal: Animal): [string, string][] {
  return [
    ['Número', animal.number],
    ['Situação', statusLabel[animal.status]],
    ['Sexo', sexLabel[animal.sex]],
    ['Raça', animal.breed || 'Não informado'],
    ['Pelagem', formatCoat(animal.coat) || 'Não informado'],
    ['Nascimento', formatDate(animal.birth_date)],
    ['Peso', formatWeight(animal.weight)],
    ['Local ou lote', animal.lot || 'Não informado'],
    ['Origem', animal.origin || 'Não informado'],
    ['Observações', animal.notes || 'Sem observações']
  ]
}

export async function exportAnimalPdf(animal: Animal) {
  const photo = await loadExportImage(animal.photo_url, PORTRAIT)
  const doc = new jsPDF()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(brand, 14, 20)
  doc.setFontSize(14)
  doc.text(`Ficha individual do animal ${animal.number}`, 14, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Documento gerado em ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`, 14, 39)

  let startY = 48

  if (photo) {
    const top = 46
    const { width, height } = fitInside(photo, 100, 76)
    doc.addImage(photo.dataUrl, 'JPEG', 14, top, width, height, undefined, 'FAST')
    doc.setDrawColor(196, 204, 197)
    doc.setLineWidth(0.4)
    doc.rect(14, top, width, height)

    // Coluna de destaques ao lado da foto.
    const columnX = 14 + width + 10
    let line = top + 6
    for (const [label, value] of [
      ['Situação', statusLabel[animal.status]],
      ['Sexo', sexLabel[animal.sex]],
      ['Raça', animal.breed || 'Não informado'],
      ['Local ou lote', animal.lot || 'Não informado']
    ]) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(122, 133, 124)
      doc.text(label.toUpperCase(), columnX, line)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(23, 42, 31)
      doc.text(doc.splitTextToSize(value, 210 - columnX - 14)[0], columnX, line + 6)
      line += 17
    }
    doc.setTextColor(0, 0, 0)
    startY = top + Math.max(height, line - top) + 12
  }

  autoTable(doc, {
    startY,
    theme: 'grid',
    head: [['Campo', 'Informação']],
    body: animalRows(animal),
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: green },
    columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' } }
  })

  doc.save(`ficha-animal-${safeFileName(animal.number)}.pdf`)
}

/** Desenha a miniatura centralizada dentro da célula da tabela. */
function drawThumbnail(doc: jsPDF, image: ExportImage, cell: { x: number; y: number; width: number; height: number }) {
  const padding = 1.6
  const size = Math.min(cell.width - padding * 2, cell.height - padding * 2)
  if (size <= 0) return
  const x = cell.x + (cell.width - size) / 2
  const y = cell.y + (cell.height - size) / 2
  doc.addImage(image.dataUrl, 'JPEG', x, y, size, size, undefined, 'FAST')
  doc.setDrawColor(205, 212, 206)
  doc.setLineWidth(0.3)
  doc.rect(x, y, size, size)
}

export async function exportAnimalsPdf(animals: Animal[], title = 'Relação completa de animais') {
  const photos = await loadAnimalImages(animals, THUMB)
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.text(brand, 14, 17)
  doc.setFontSize(13)
  doc.text(title, 14, 27)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Total: ${animals.length} animais`, 14, 34)

  autoTable(doc, {
    startY: 40,
    theme: 'striped',
    margin: { left: 14, right: 14 },
    head: [['Foto', 'Número', 'Situação', 'Sexo', 'Raça', 'Nascimento', 'Peso', 'Local ou lote', 'Observações']],
    body: animals.map((animal) => [
      '',
      animal.number,
      statusLabel[animal.status],
      sexLabel[animal.sex],
      animal.breed || '',
      formatDate(animal.birth_date),
      animal.weight == null ? '' : `${animal.weight} kg`,
      animal.lot || '',
      animal.notes || ''
    ]),
    styles: { fontSize: 8, cellPadding: 2.4, overflow: 'linebreak', minCellHeight: 19, valign: 'middle' },
    headStyles: { fillColor: green, minCellHeight: 8 },
    columnStyles: {
      0: { cellWidth: 21 },
      1: { cellWidth: 20, fontStyle: 'bold' },
      2: { cellWidth: 24 },
      3: { cellWidth: 20 },
      4: { cellWidth: 28 },
      5: { cellWidth: 24 },
      6: { cellWidth: 18 },
      7: { cellWidth: 30 }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      const photo = photos.get(animals[data.row.index]?.id)
      if (photo) drawThumbnail(doc, photo, data.cell)
    }
  })

  doc.save(`${safeFileName(title)}.pdf`)
}

function tableCell(text: string, bold = false) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text, bold })] })]
  })
}

function imageCell(image: ExportImage | undefined, size: number) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: image
          ? [new ImageRun({ type: 'jpg', data: image.bytes, transformation: { width: size, height: size } })]
          : [new TextRun({ text: '—', color: '9AA69C' })]
      })
    ]
  })
}

export async function exportAnimalWord(animal: Animal) {
  const photo = await loadExportImage(animal.photo_url, PORTRAIT)
  const photoParagraphs = photo
    ? (() => {
        const { width, height } = fitInside(photo, 380, 300)
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ type: 'jpg', data: photo.bytes, transformation: { width: Math.round(width), height: Math.round(height) } })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Foto registrada do animal ${animal.number}`, italics: true, size: 18, color: '6B7A6F' })]
          }),
          new Paragraph({ text: '' })
        ]
      })()
    : []

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: brand, heading: HeadingLevel.TITLE }),
        new Paragraph({ text: `Ficha individual do animal ${animal.number}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: `Documento gerado em ${new Intl.DateTimeFormat('pt-BR').format(new Date())}` }),
        new Paragraph({ text: '' }),
        ...photoParagraphs,
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [tableCell('Campo', true), tableCell('Informação', true)] }),
            ...animalRows(animal).map(([label, value]) => new TableRow({ children: [tableCell(label, true), tableCell(value)] }))
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Assinatura do responsável: ______________________________________' })]
        })
      ]
    }]
  })
  const blob = await Packer.toBlob(doc)
  saveAs(blob, `ficha-animal-${safeFileName(animal.number)}.docx`)
}

export async function exportAnimalsWord(animals: Animal[], title = 'Relação completa de animais') {
  const photos = await loadAnimalImages(animals, THUMB)

  const rows = animals.map((animal) => new TableRow({
    children: [
      imageCell(photos.get(animal.id), 52),
      tableCell(animal.number, true),
      tableCell(statusLabel[animal.status]),
      tableCell(sexLabel[animal.sex]),
      tableCell(animal.breed || ''),
      tableCell(animal.weight == null ? '' : `${animal.weight} kg`),
      tableCell(animal.lot || ''),
      tableCell(animal.notes || '')
    ]
  }))

  const doc = new Document({
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
      children: [
        new Paragraph({ text: brand, heading: HeadingLevel.TITLE }),
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: `Total: ${animals.length} animais` }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: ['Foto', 'Número', 'Situação', 'Sexo', 'Raça', 'Peso', 'Local ou lote', 'Observações'].map((item) => tableCell(item, true)) }),
            ...rows
          ]
        })
      ]
    }]
  })
  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${safeFileName(title)}.docx`)
}

export async function exportHandlingSheetPdf(animals: Animal[], title = 'Folha de controle de manejo') {
  const photos = await loadAnimalImages(animals, THUMB)
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.text(brand, 14, 17)
  doc.setFontSize(13)
  doc.text(title, 14, 27)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Data: ____/____/________    Responsável: ________________________________________________', 14, 35)

  const list = animals.length ? animals : Array.from({ length: 20 }, (_, index) => ({ id: '', number: String(index + 1) } as Animal))
  const body = list.map((animal) => [' ', animal.number || '', '', '', '', '', ''])

  autoTable(doc, {
    startY: 42,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    head: [['Foto', 'Animal', 'Presente', 'Situação', 'Peso', 'Observação', 'Visto do responsável']],
    body,
    styles: { fontSize: 9, minCellHeight: 19, valign: 'middle' },
    headStyles: { fillColor: green, minCellHeight: 8 },
    columnStyles: {
      0: { cellWidth: 21 },
      1: { cellWidth: 24 },
      2: { cellWidth: 24 },
      3: { cellWidth: 36 },
      4: { cellWidth: 24 },
      5: { cellWidth: 90 },
      6: { cellWidth: 50 }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      const photo = photos.get(list[data.row.index]?.id)
      if (photo) drawThumbnail(doc, photo, data.cell)
    }
  })

  doc.save(`${safeFileName(title)}.pdf`)
}

export async function printAnimal(animal: Animal) {
  const photo = await loadExportImage(animal.photo_url, PORTRAIT)
  const rows = animalRows(animal)
    .slice(1)
    .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join('')

  const html = `
    <html><head><meta charset="utf-8"><title>Ficha do animal ${escapeHtml(animal.number)}</title><style>
      body{font-family:Arial,sans-serif;color:#1c2a22;padding:32px} h1{margin:0;color:#173f2c} h2{margin-top:8px}
      .photo{margin-top:22px} .photo img{max-width:340px;max-height:270px;width:auto;border:1px solid #c4ccc5;border-radius:8px}
      .photo small{display:block;color:#6b7a6f;margin-top:6px}
      table{border-collapse:collapse;width:100%;margin-top:24px} td{border:1px solid #bbb;padding:10px} td:first-child{font-weight:bold;width:32%}
      .sign{margin-top:60px;text-align:center} @media print{body{padding:0}}
    </style></head><body>
      <h1>${brand}</h1><h2>Ficha individual do animal ${escapeHtml(animal.number)}</h2>
      ${photo ? `<div class="photo"><img src="${photo.dataUrl}" alt="Foto do animal ${escapeHtml(animal.number)}"><small>Foto registrada do animal ${escapeHtml(animal.number)}</small></div>` : ''}
      <table>${rows}</table>
      <div class="sign">Assinatura do responsável: ______________________________________</div>
      <script>
        window.onload = function () {
          var pending = Array.prototype.slice.call(document.images).map(function (image) {
            return image.complete ? null : new Promise(function (done) { image.onload = image.onerror = done })
          }).filter(Boolean)
          Promise.all(pending).then(function () { window.print() })
        }
      </script>
    </body></html>`
  const popup = window.open('', '_blank')
  if (!popup) return
  popup.document.write(html)
  popup.document.close()
}
