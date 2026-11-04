import type { PdfTable, TextItem } from './pdfTable'
import { buildTable } from './pdfTable'

export class PdfPasswordError extends Error {
  constructor(public readonly wrong: boolean) { super(wrong ? 'Incorrect PDF password' : 'This PDF is password protected') }
}
export class PdfNoTextError extends Error {
  constructor() { super('No readable text in this PDF. It may be a scanned image; download the CSV/Excel statement from your bank instead.') }
}

/** Minimal shape of the pdf.js API we use, so the loader works with both the browser and Node builds. */
interface PdfJs {
  getDocument: (src: { data: Uint8Array; password?: string }) => {
    promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> }>
    destroy: () => Promise<void>
  }
}

export async function extractItems(pdfjs: PdfJs, data: ArrayBuffer, password?: string): Promise<TextItem[]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), password })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    await task.destroy().catch(() => undefined)
    const err = e as { name?: string; code?: number }
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2)
    throw e
  }
  const items: TextItem[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    for (const raw of content.items) {
      const it = raw as { str?: string; transform?: number[]; width?: number; height?: number }
      if (typeof it.str !== 'string' || !it.transform) continue
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width ?? 0, height: it.height ?? Math.abs(it.transform[3]) ?? 8, page: p })
    }
  }
  await task.destroy()
  if (!items.some((i) => i.str.trim())) throw new PdfNoTextError()
  return items
}

/** Browser entry: lazy-loads pdf.js (and its worker) only when a PDF is actually chosen. */
export async function readStatementPdf(data: ArrayBuffer, password?: string): Promise<PdfTable> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const items = await extractItems(pdfjs as unknown as PdfJs, data, password)
  const table = buildTable(items)
  if (!table) throw new Error('No transaction rows were found in this PDF. Try the CSV export from your bank.')
  return table
}
