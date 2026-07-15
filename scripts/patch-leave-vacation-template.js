const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { templatesRoot } = require('../services/wordTemplateService');

const templateFileName = process.argv[2] || 'نموذج اجازة مدنيين.docx';
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
  const lines = String(text || '').split(/\r?\n/);
  const runs = lines.map((line, index) => {
    const lineXml = `${rPr}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
    return index === 0 ? `<w:r>${lineXml}</w:r>` : `<w:r>${rPr}<w:br/><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`;
  }).join('');
  return `${openTag}${pPr}${runs}</w:p>`;
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

    return anchorXml.replace(contentMatch[0], `<w:txbxContent>${newParagraph}</w:txbxContent>`);
  });
}

function replaceFirstAnchorContaining(xml, searchText, text) {
  const anchors = [...xml.matchAll(/<wp:anchor[\s\S]*?<\/wp:anchor>/g)];
  const normalizeSearch = (value) => String(value || '').replace(/[\sـ]+/g, '');
  const needle = normalizeSearch(searchText);
  const index = anchors.findIndex((match) => normalizeSearch(match[0]).includes(needle));
  if (index < 0) {
    throw new Error(`Anchor containing "${searchText}" not found.`);
  }

  return replaceAnchorTextBoxText(xml, index, text);
}

function normalizeBrokenLeaveDays(xml) {
  return xml.replace(
    /<w:r\b[^>]*>\s*<w:rPr>[\s\S]*?<w:t>\{\{<\/w:t><\/w:r><w:proofErr w:type="spellStart"\/><w:r\b[^>]*>\s*<w:rPr>[\s\S]*?<w:t>leave_days<\/w:t><\/w:r><w:proofErr w:type="spellEnd"\/><w:r\b[^>]*>\s*<w:rPr>[\s\S]*?<w:t>\}<\/w:t><\/w:r>/g,
    '<w:r><w:rPr><w:rFonts w:cs="Fanan"/><w:rtl/><w:lang w:bidi="ar-KW"/></w:rPr><w:t xml:space="preserve">{{leave_days}}</w:t></w:r>'
  );
}

const zip = new PizZip(fs.readFileSync(templatePath));
let xml = zip.file('word/document.xml').asText();

// Header values (keep exact existing geometry/formatting).
xml = replaceCellText(xml, 0, 0, 1, '{{current_day_name}}');
xml = replaceCellText(xml, 0, 1, 1, '{{current_date}}');
xml = replaceCellText(xml, 0, 2, 1, '{{section}}');

xml = replaceFirstAnchorContaining(xml, 'الرتبة', '{{title}} / {{employee_name}}');
xml = replaceFirstAnchorContaining(xml, 'القسم', '{{department}}');
xml = replaceFirstAnchorContaining(xml, 'الرقم المدني', '{{civil_id}}');
xml = replaceFirstAnchorContaining(
  xml,
  'يرجى من سيادتكم',
  'السيد / مدير ادارة البلاغات                                                                                   المحترم\nتحية طيبة وبعد ،،،\nيرجى من سيادتكم التكرم بالموافقة علي تحديد الإجازة ( السنوية / الادارية )  لمدة ( {{leave_days}} ) يوم من تاريخ {{leave_start_date}} م  الي {{leave_end_date}} م .\nولكم مني جزيل الشكر'
);

xml = xml.replace(/\{\{\s*leave_type\s*\}\}/g, '{{leave_type}}');
xml = xml.replace(/\{\{\s*leave_days\s*\}(?!\})/g, '{{leave_days}}');
xml = xml.replace(/\{\{\s*leave_days\s*\}\}/g, '{{leave_days}}');
xml = normalizeBrokenLeaveDays(xml);

zip.file('word/document.xml', xml);
fs.writeFileSync(templatePath, zip.generate({ type: 'nodebuffer' }));

console.log(`Patched template: ${templatePath}`);
