const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { templatesRoot } = require('../services/wordTemplateService');

const templateFileName = process.argv[2] || 'نموذج استئذان مدنيين.docx';
const templatePath = path.join(templatesRoot, templateFileName);

if (!fs.existsSync(templatePath)) {
  throw new Error(`Template not found: ${templatePath}`);
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceMatchAtIndex(source, pattern, index, replacer) {
  const matches = [...source.matchAll(pattern)];
  const target = matches[index];
  if (!target) {
    throw new Error(`Match index ${index} not found.`);
  }

  return source.slice(0, target.index) + replacer(target[0]) + source.slice(target.index + target[0].length);
}

function buildParagraphFrom(paragraphXml, text) {
  const openTag = paragraphXml.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>';
  const pPr = paragraphXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] || '';
  const rPr = paragraphXml.match(/<w:rPr[\s\S]*?<\/w:rPr>/)?.[0] || '';
  return `${openTag}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}


function replaceParagraphText(xml, paragraphIndex, text) {
  return replaceMatchAtIndex(xml, /<w:p\b[\s\S]*?<\/w:p>/g, paragraphIndex, (paragraphXml) => buildParagraphFrom(paragraphXml, text));
}

function replaceCellText(xml, tableIndex, rowIndex, cellIndex, text) {
  return replaceMatchAtIndex(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/g, tableIndex, (tableXml) => {
    return replaceMatchAtIndex(tableXml, /<w:tr\b[\s\S]*?<\/w:tr>/g, rowIndex, (rowXml) => {
      return replaceMatchAtIndex(rowXml, /<w:tc\b[\s\S]*?<\/w:tc>/g, cellIndex, (cellXml) => {
        const paragraphMatch = cellXml.match(/<w:p\b[\s\S]*?<\/w:p>/);
        if (!paragraphMatch) {
          return cellXml.replace(/<\/w:tc>$/, `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`);
        }

        const newParagraph = buildParagraphFrom(paragraphMatch[0], text);
        return cellXml.replace(paragraphMatch[0], newParagraph);
      });
    });
  });
}

function replaceCellWithSingleParagraph(xml, tableIndex, rowIndex, cellIndex, text) {
  return replaceMatchAtIndex(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/g, tableIndex, (tableXml) => {
    return replaceMatchAtIndex(tableXml, /<w:tr\b[\s\S]*?<\/w:tr>/g, rowIndex, (rowXml) => {
      return replaceMatchAtIndex(rowXml, /<w:tc\b[\s\S]*?<\/w:tc>/g, cellIndex, (cellXml) => {
        const firstParagraph = cellXml.match(/<w:p\b[\s\S]*?<\/w:p>/)?.[0] || '<w:p><w:r><w:t/></w:r></w:p>';
        const rebuiltParagraph = buildParagraphFrom(firstParagraph, text);
        return cellXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, '').replace(/<\/w:tc>$/, `${rebuiltParagraph}</w:tc>`);
      });
    });
  });
}

function setParagraphAlignment(paragraphXml, align = 'center') {
  if (!paragraphXml) return paragraphXml;

  if (/<w:pPr[\s\S]*?<\/w:pPr>/.test(paragraphXml)) {
    return paragraphXml.replace(/<w:pPr([\s\S]*?)>([\s\S]*?)<\/w:pPr>/, (_all, attrs, inner) => {
      const withoutJc = inner.replace(/<w:jc\b[^>]*\/>/g, '');
      return `<w:pPr${attrs}>${withoutJc}<w:jc w:val="${align}"/></w:pPr>`;
    });
  }

  return paragraphXml.replace(/<w:p\b([^>]*)>/, `<w:p$1><w:pPr><w:jc w:val="${align}"/></w:pPr>`);
}

function setParagraphFontSize(paragraphXml, sizeHalfPt) {
  if (!paragraphXml || !sizeHalfPt) return paragraphXml;

  let updated = paragraphXml.replace(/<w:rPr[\s\S]*?<\/w:rPr>/g, (rPrXml) => {
    const noSz = rPrXml.replace(/<w:sz\b[^>]*\/>/g, '').replace(/<w:szCs\b[^>]*\/>/g, '');
    return noSz.replace(/<\/w:rPr>/, `<w:sz w:val="${sizeHalfPt}"/><w:szCs w:val="${sizeHalfPt}"/></w:rPr>`);
  });

  updated = updated.replace(/<w:r\b([^>]*)>(?!\s*<w:rPr>)/g, `<w:r$1><w:rPr><w:sz w:val="${sizeHalfPt}"/><w:szCs w:val="${sizeHalfPt}"/></w:rPr>`);
  return updated;
}

function alignCellParagraph(xml, tableIndex, rowIndex, cellIndex, align = 'center') {
  return replaceMatchAtIndex(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/g, tableIndex, (tableXml) => {
    return replaceMatchAtIndex(tableXml, /<w:tr\b[\s\S]*?<\/w:tr>/g, rowIndex, (rowXml) => {
      return replaceMatchAtIndex(rowXml, /<w:tc\b[\s\S]*?<\/w:tc>/g, cellIndex, (cellXml) => {
        return cellXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => setParagraphAlignment(paragraphXml, align));
      });
    });
  });
}

function styleParagraphContainingIfExists(xml, searchText, occurrenceIndex = 0, options = {}) {
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .filter((match) => match[0].includes(searchText));
  const target = paragraphs[occurrenceIndex];
  if (!target) return xml;

  let nextParagraph = target[0];
  if (options.align) {
    nextParagraph = setParagraphAlignment(nextParagraph, options.align);
  }
  if (options.fontSizeHalfPt) {
    nextParagraph = setParagraphFontSize(nextParagraph, options.fontSizeHalfPt);
  }

  return xml.slice(0, target.index) + nextParagraph + xml.slice(target.index + target[0].length);
}

function styleAllParagraphsContaining(xml, searchText, options = {}) {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    if (!paragraphXml.includes(searchText)) return paragraphXml;
    let nextParagraph = paragraphXml;
    if (options.align) {
      nextParagraph = setParagraphAlignment(nextParagraph, options.align);
    }
    if (options.fontSizeHalfPt) {
      nextParagraph = setParagraphFontSize(nextParagraph, options.fontSizeHalfPt);
    }
    return nextParagraph;
  });
}

function removeFirstTableRowContaining(xml, tokenRegex) {
  return replaceMatchAtIndex(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/g, 0, (tableXml) => {
    const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
    const target = rows.find((match) => tokenRegex.test(match[0]));
    if (!target) return tableXml;
    return tableXml.slice(0, target.index) + tableXml.slice(target.index + target[0].length);
  });
}

function insertParagraphBeforeTable(xml, tableIndex, paragraphXml) {
  return replaceMatchAtIndex(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/g, tableIndex, (tableXml) => `${paragraphXml}${tableXml}`);
}

function buildCenteredRequestParagraph(text) {
  return `<w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:rPr><w:rFonts w:cs="Fanan"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:cs="Fanan"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function updateTableRow(xml, tableIndex, rowIndex, updater) {
  return replaceMatchAtIndex(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/g, tableIndex, (tableXml) => {
    return replaceMatchAtIndex(tableXml, /<w:tr\b[\s\S]*?<\/w:tr>/g, rowIndex, updater);
  });
}

function insertTableRowAfter(xml, tableIndex, rowIndex, rowXml) {
  return replaceMatchAtIndex(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/g, tableIndex, (tableXml) => {
    const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
    const target = rows[rowIndex];
    if (!target) {
      throw new Error(`Row ${rowIndex} not found in table ${tableIndex}.`);
    }

    const insertAt = target.index + target[0].length;
    return tableXml.slice(0, insertAt) + rowXml + tableXml.slice(insertAt);
  });
}

function replaceParagraphContaining(xml, searchText, replacementText, occurrenceIndex = 0) {
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .filter((match) => match[0].includes(searchText));
  const target = paragraphs[occurrenceIndex];
  if (!target) {
    throw new Error(`Paragraph containing "${searchText}" occurrence ${occurrenceIndex} not found.`);
  }

  return xml.slice(0, target.index) + buildParagraphFrom(target[0], replacementText) + xml.slice(target.index + target[0].length);
}

function replaceParagraphContainingIfExists(xml, searchText, replacementText, occurrenceIndex = 0) {
  try {
    return replaceParagraphContaining(xml, searchText, replacementText, occurrenceIndex);
  } catch {
    return xml;
  }
}


function replaceAnchorTextBoxText(xml, anchorIndex, text) {
  return replaceMatchAtIndex(xml, /<wp:anchor[\s\S]*?<\/wp:anchor>/g, anchorIndex, (anchorXml) => {
    const contentMatch = anchorXml.match(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/);
    if (!contentMatch) {
      throw new Error(`Anchor ${anchorIndex} does not contain a text box.`);
    }

    const innerXml = contentMatch[1];
    const paragraphMatch = innerXml.match(/<w:p\b[\s\S]*?<\/w:p>/);
    const newParagraph = paragraphMatch
      ? buildParagraphFrom(paragraphMatch[0], text)
      : `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;

    const nextInnerXml = paragraphMatch
      ? innerXml.replace(paragraphMatch[0], newParagraph)
      : `${innerXml}${newParagraph}`;

    return anchorXml.replace(contentMatch[0], `<w:txbxContent>${nextInnerXml}</w:txbxContent>`);
  });
}

const zip = new PizZip(fs.readFileSync(templatePath));
let xml = zip.file('word/document.xml').asText();

xml = replaceAnchorTextBoxText(xml, 1, '{{current_day_name}}');
xml = replaceAnchorTextBoxText(xml, 3, '{{current_date}}');
xml = replaceCellText(xml, 0, 0, 1, '{{rank}}');
xml = replaceCellText(xml, 0, 0, 3, '{{employee_name}}');
xml = replaceCellText(xml, 0, 1, 1, '{{department}}');
xml = replaceCellText(xml, 0, 1, 3, '{{civil_id}}');

// Remove previously-added extra row (النوبة / تاريخ الاستئذان) to match the original template.
xml = removeFirstTableRowContaining(xml, /(النوبة|\{\{section\}\}|تاريخ الاستئذان|\{\{permit_date\}\})/);

// Move day to the right side in its original cell to avoid left-shift.
xml = alignCellParagraph(xml, 0, 0, 2, 'right');

// Keep request sentence on the original line/size and only refresh its text.
xml = replaceParagraphContainingIfExists(xml, 'يرجى من سيادتكم التكرم بمنحي', 'يرجى من سيادتكم التكرم بمنحي ( إذن ) يوم {{day_name}} الموافق {{permit_date}}', 0);
xml = replaceParagraphContainingIfExists(xml, '{{day_name}}', 'يرجى من سيادتكم التكرم بمنحي ( إذن ) يوم {{day_name}} الموافق {{permit_date}}', 0);
xml = styleAllParagraphsContaining(xml, 'يرجى من سيادتكم', { align: 'center', fontSizeHalfPt: '24' });
if (!xml.includes('{{day_name}}') || !xml.includes('{{permit_date}}')) {
  xml = insertParagraphBeforeTable(xml, 1, buildCenteredRequestParagraph('يرجى من سيادتكم التكرم بمنحي ( إذن ) يوم {{day_name}} الموافق {{permit_date}}'));
}

xml = replaceCellText(xml, 1, 0, 1, 'حضور متأخر ( {{from_time}} )');
xml = replaceCellText(xml, 1, 0, 4, 'خروج مبكر ( {{to_time}} )');
xml = replaceCellText(xml, 4, 0, 2, '{{reason}}\n{{notes}}');
xml = replaceParagraphContainingIfExists(xml, 'الرتبة /', '{{rank}} / الرتبة', 0);
xml = replaceParagraphContainingIfExists(xml, 'الإســـم /', '{{employee_name}} / الإســـم', 0);
xml = replaceParagraphContainingIfExists(xml, 'الرتبة /', '{{rank}} / الرتبة', 1);
xml = replaceParagraphContainingIfExists(xml, 'الإســـم /', '{{employee_name}} / الإســـم', 1);
xml = replaceParagraphContainingIfExists(xml, 'الرتبة :', '{{rank}} / الرتبة', 0);
xml = replaceParagraphContainingIfExists(xml, 'الإســـم :', '{{employee_name}} / الإســـم', 0);
xml = replaceParagraphContainingIfExists(xml, 'الرتبة :', '{{rank}} / الرتبة', 1);
xml = replaceParagraphContainingIfExists(xml, 'الإســـم :', '{{employee_name}} / الإســـم', 1);

zip.file('word/document.xml', xml);
fs.writeFileSync(templatePath, zip.generate({ type: 'nodebuffer' }));

console.log(`Patched template: ${templatePath}`);