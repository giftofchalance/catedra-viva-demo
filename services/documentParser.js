/**
 * Extractor de texto y láminas desde archivos .pdf, .pptx, .txt y .md en memoria.
 * Sin escritura temporal en disco ni binarios nativos externos (100% compatible con Render Linux).
 */

import path from 'path';
import JSZip from 'jszip';
import { extractText } from 'unpdf';

const MAX_SLIDES = 40;
const MAX_FULL_TEXT_CHARS = 12000;
const MIN_TEXT_CHARS = 15;

function decodeXmlEntities(str = '') {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function fixMultipartFilename(name = '') {
  const base = path.basename(String(name || 'documento')).trim() || 'documento';
  if (/Ã[\x80-\xBF]/.test(base)) {
    try {
      return Buffer.from(base, 'latin1').toString('utf8');
    } catch (_) {
      return base;
    }
  }
  return base;
}

function detectFormat({ originalname = '', mimetype = '' }) {
  const ext = path.extname(originalname).toLowerCase();
  const mime = (mimetype || '').toLowerCase();

  if (ext === '.pptx' || mime.includes('presentationml')) return 'pptx';
  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === '.md' || mime.includes('markdown')) return 'md';
  if (ext === '.txt' || mime === 'text/plain') return 'txt';
  return null;
}

function cleanSlideLines(rawText = '') {
  const lines = String(rawText)
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').replace(/^[-*•·]+\s*/, '').trim())
    .filter(Boolean);

  // Filtrar marcadores puros de número de página si hay más contenido
  const nonFooter = lines.filter(l => !/^\d{1,3}(\s*\/\s*\d{1,3})?$/.test(l));
  return nonFooter.length > 0 ? nonFooter : lines;
}

function blockLinesToSlide(lines = [], fallbackNumber = 1) {
  if (!lines || lines.length === 0) return null;
  const rawTitle = lines[0]
    .replace(/^#+\s*/, '')
    .replace(/^L[áa]mina\s*\d+\s*[:.-]?\s*/i, '')
    .trim();
  const title = (rawTitle || `Lámina ${fallbackNumber}`).slice(0, 120);
  const bullets = lines.slice(1, 7).map(b => b.slice(0, 220));
  return {
    title,
    bulletPoints: bullets.length > 0 ? bullets : [title]
  };
}

function extractPptxSlideText(xmlString = '') {
  const paragraphs = [];
  const pRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  let pMatch;

  while ((pMatch = pRegex.exec(xmlString)) !== null) {
    const tRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
    const parts = [];
    let tMatch;
    while ((tMatch = tRegex.exec(pMatch[1])) !== null) {
      parts.push(decodeXmlEntities(tMatch[1]));
    }
    const line = parts.join('').replace(/\s+/g, ' ').trim();
    if (line) paragraphs.push(line);
  }

  if (paragraphs.length === 0) {
    const tRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(xmlString)) !== null) {
      const t = decodeXmlEntities(tMatch[1]).replace(/\s+/g, ' ').trim();
      if (t) paragraphs.push(t);
    }
  }

  return paragraphs;
}

async function parsePptxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideEntries = Object.keys(zip.files)
    .map(key => {
      const m = key.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      return m ? { key, slideNum: Number(m[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.slideNum - b.slideNum);

  const slides = [];
  const textBlocks = [];

  for (const item of slideEntries.slice(0, MAX_SLIDES)) {
    const xml = await zip.files[item.key].async('string');
    const rawParagraphs = extractPptxSlideText(xml);
    const cleaned = cleanSlideLines(rawParagraphs.join('\n'));
    if (cleaned.length === 0) continue;

    const slide = blockLinesToSlide(cleaned, slides.length + 1);
    if (slide) {
      slides.push(slide);
      textBlocks.push(`[Lámina ${slides.length}: ${slide.title}]\n${cleaned.join('\n')}`);
    }
  }

  return {
    slides,
    fullText: textBlocks.join('\n\n'),
    totalPages: slideEntries.length || slides.length
  };
}

async function parsePdfBuffer(buffer) {
  const result = await extractText(new Uint8Array(buffer), { mergePages: false });
  const pages = Array.isArray(result?.text)
    ? result.text
    : [String(result?.text || '')];

  const slides = [];
  const textBlocks = [];

  for (const pageText of pages.slice(0, MAX_SLIDES)) {
    const cleaned = cleanSlideLines(pageText);
    if (cleaned.length === 0) continue;

    const slide = blockLinesToSlide(cleaned, slides.length + 1);
    if (slide) {
      slides.push(slide);
      textBlocks.push(`[Pág. ${slides.length}: ${slide.title}]\n${cleaned.join('\n')}`);
    }
  }

  return {
    slides,
    fullText: textBlocks.join('\n\n'),
    totalPages: result?.totalPages || pages.length || slides.length
  };
}

function parsePlainTextBuffer(buffer) {
  const raw = buffer.toString('utf8');
  const blocks = raw.includes('---')
    ? raw.split(/^\s*---+\s*$/m)
    : raw.split(/\n\s*\n+/);

  const slides = [];
  const textBlocks = [];

  for (const block of blocks.slice(0, MAX_SLIDES)) {
    const cleaned = cleanSlideLines(block);
    if (cleaned.length === 0) continue;
    const slide = blockLinesToSlide(cleaned, slides.length + 1);
    if (slide) {
      slides.push(slide);
      textBlocks.push(cleaned.join('\n'));
    }
  }

  return {
    slides,
    fullText: textBlocks.join('\n\n') || raw.trim(),
    totalPages: slides.length || 1
  };
}

/**
 * Parsea un documento subido en memoria y devuelve láminas estructuradas y texto completo.
 */
export async function parseUploadedDocument({ buffer, originalname = '', mimetype = '' }) {
  if (!buffer || buffer.length === 0) {
    const err = new Error('El archivo subido está vacío.');
    err.statusCode = 400;
    throw err;
  }

  const fileName = fixMultipartFilename(originalname);
  const format = detectFormat({ originalname: fileName, mimetype });
  if (!format) {
    const err = new Error('Formato no soportado. Sube un archivo .pdf, .pptx, .txt o .md.');
    err.statusCode = 400;
    throw err;
  }

  let parsed;
  if (format === 'pptx') {
    parsed = await parsePptxBuffer(buffer);
  } else if (format === 'pdf') {
    parsed = await parsePdfBuffer(buffer);
  } else {
    parsed = parsePlainTextBuffer(buffer);
  }

  const fullText = (parsed.fullText || '').trim().slice(0, MAX_FULL_TEXT_CHARS);
  if (fullText.replace(/\s+/g, '').length < MIN_TEXT_CHARS) {
    const err = new Error('No se encontró texto seleccionable en este archivo (puede ser un PDF escaneado como imagen). Exporta el PPT/PDF con texto o pega los puntos clave manualmente.');
    err.statusCode = 422;
    throw err;
  }

  const totalPages = Math.max(parsed.totalPages || 0, parsed.slides.length || 1);
  const unitLabel = format === 'pptx' ? 'lám.' : 'pág.';

  return {
    format,
    fileName,
    slides: parsed.slides,
    fullText,
    totalPages,
    pagesLabel: `${totalPages} ${unitLabel}`
  };
}
