// Turns an Excel workbook (.xlsx) into CSV text, in the browser, with no library: the first sheet for
// imports, or every sheet by name for notes. An .xlsx file is a zip; we read its directory, inflate the
// shared strings and the worksheets, and pick the cell values out of the XML.

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not an Excel workbook. Save it as .xlsx or .csv and try again.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, () => Promise<string>>();
  const dec = new TextDecoder();
  for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    files.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      return dec.decode(method === 0 ? raw : await inflate(raw));
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

const textOf = (xml: string) => unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

async function sharedStrings(files: Map<string, () => Promise<string>>): Promise<string[]> {
  const shared: string[] = [];
  const ss = files.get('xl/sharedStrings.xml');
  if (ss) for (const m of (await ss()).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  return shared;
}

function sheetToCsv(xml: string, shared: string[]): string {
  const lines: string[] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (v !== undefined) value = unescapeXml(v);
      const i = ref ? colIndex(ref) : cells.length;
      while (cells.length < i) cells.push('');
      cells[i] = value;
    }
    if (cells.some((x) => x.trim())) lines.push(cells.map(csvCell).join(','));
  }
  return lines.join('\n');
}

export async function xlsxToCsv(buf: ArrayBuffer): Promise<string> {
  const files = await unzip(buf);
  const shared = await sharedStrings(files);
  const sheetName = files.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : [...files.keys()].filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0];
  const sheet = sheetName ? files.get(sheetName) : undefined;
  if (!sheet) throw new Error('No sheet found in this workbook.');
  return sheetToCsv(await sheet(), shared);
}

/** Every sheet of a workbook, in tab order, with its tab name. */
export async function xlsxSheets(buf: ArrayBuffer): Promise<{ name: string; csv: string }[]> {
  const files = await unzip(buf);
  const shared = await sharedStrings(files);
  const book = files.get('xl/workbook.xml');
  const rels = files.get('xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  if (rels) for (const m of (await rels()).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const out: { name: string; csv: string }[] = [];
  if (book) for (const m of (await book()).matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1] ?? '';
    const file = files.get(targets.get(rid) ?? '');
    if (file) out.push({ name: name || `Sheet ${out.length + 1}`, csv: sheetToCsv(await file(), shared) });
  }
  if (!out.length) return [{ name: 'Sheet 1', csv: await xlsxToCsv(buf) }];
  return out;
}

/** Reads a file as plain text for notes; a workbook gives every sheet under its own heading. */
export async function fileToText(file: File, firstSheets?: RegExp): Promise<string> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  if (!(head[0] === 0x50 && head[1] === 0x4b)) return fileToCsv(file);
  const sheets = await xlsxSheets(buf);
  if (firstSheets) sheets.sort((a, b) => Number(firstSheets.test(b.name)) - Number(firstSheets.test(a.name)));
  return sheets.filter((x) => x.csv.trim()).map((x) => `## Sheet: ${x.name}\n${x.csv}`).join('\n\n');
}

/** Reads a picked file as CSV text: Excel workbooks are converted, anything else is read as text. */
export async function fileToCsv(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  if (head[0] === 0x50 && head[1] === 0x4b) return xlsxToCsv(buf);
  if (/\.xls$/i.test(file.name)) throw new Error('Older .xls files cannot be read. Save it as .xlsx or .csv and try again.');
  return new TextDecoder().decode(buf).replace(/^﻿/, '');
}
