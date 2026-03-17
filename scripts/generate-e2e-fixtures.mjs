import {mkdirSync, writeFileSync} from 'fs'
import {join} from 'path'

const outDir = join(process.cwd(), 'test', 'fixtures', 'pdfs')
mkdirSync(outDir, { recursive: true })

function buildPdf(pages) {
  const objects = []
  const pageRefs = []

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'

  for (let i = 0; i < pages.length; i++) {
    const pageObjectId = 3 + i * 2
    const contentObjectId = pageObjectId + 1
    const page = pages[i]
    const content = page.content.endsWith('\n') ? page.content : `${page.content}\n`

    pageRefs.push(`${pageObjectId} 0 R`)
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Contents ${contentObjectId} 0 R /Resources << >> >>`
    objects[contentObjectId] =
      `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}endstream`
  }

  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8')
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return pdf
}

function writePdf(name, pages) {
  writeFileSync(join(outDir, name), buildPdf(pages), 'binary')
}

function panelPage(width, height, panels) {
  const commands = [
    '1 1 1 rg',
    `0 0 ${width} ${height} re`,
    'f',
    '0 0 0 rg'
  ]

  for (const panel of panels) {
    commands.push(`${panel.x} ${panel.y} ${panel.width} ${panel.height} re`)
    commands.push('f')
  }

  return { width, height, content: commands.join('\n') }
}

writePdf('auto-slice-3panels.pdf', [
  panelPage(200, 600, [
    { x: 20, y: 0, width: 160, height: 160 },
    { x: 20, y: 200, width: 160, height: 160 },
    { x: 20, y: 400, width: 160, height: 200 }
  ])
])

writePdf('simple-2page.pdf', [
  panelPage(240, 320, [
    { x: 20, y: 20, width: 200, height: 280 }
  ]),
  panelPage(240, 320, [
    { x: 20, y: 20, width: 80, height: 280 },
    { x: 140, y: 20, width: 80, height: 280 }
  ])
])
