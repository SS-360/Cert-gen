import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, normalizeTable, matchColumn, resolveValue, validateRecipients, certificateFilename, escapeHtml, toCsv } from '../src/lib/data.js';

test('CSV supports BOM, commas inside quotes, escaped quotes, and multiline cells', () => {
  const parsed = parseCsv('\uFEFFName,Event,Score\r\n"Participant, Example","The ""Future""\nForum",0\r\n');
  assert.deepEqual(parsed.headers, ['Name', 'Event', 'Score']);
  assert.deepEqual(parsed.rows, [{ Name: 'Participant, Example', Event: 'The "Future"\nForum', Score: '0' }]);
});

test('CSV detects TSV and semicolon delimiters', () => {
  assert.deepEqual(parseCsv('Name\nSample Participant').rows, [{ Name: 'Sample Participant' }]);
  assert.equal(parseCsv('Name;College\nSample;Sample institution').rows[0].College, 'Sample institution');
  assert.equal(parseCsv('Name\tCollege\nSample\tSample institution').rows[0].Name, 'Sample');
});

test('CSV rejects malformed quotes, duplicate headers, extra cells, and absent recipients', () => {
  assert.throws(() => parseCsv('Name,Event\n"Sample,Test'), /CSV/);
  assert.throws(() => parseCsv('Name,name\nSample,Demo'), /unique/);
  assert.throws(() => parseCsv('Name,Event\nSample,Test,Extra'), /more values/);
  assert.throws(() => parseCsv('Name,Event\n'), /at least one/);
});

test('Excel-style values keep zeroes and dates and ignore empty rows', () => {
  assert.deepEqual(normalizeTable([['Name', 'Score', 'Date'], ['Sample', 0, new Date('2026-10-08T00:00:00Z')], ['', '', '']]).rows,
    [{ Name: 'Sample', Score: '0', Date: '2026-10-08' }]);
});

test('Imported prototype-looking headers do not mutate objects', () => {
  const result = parseCsv('__proto__,Name\nvalue,Sample');
  assert.equal(result.rows[0].__proto__, 'value');
  assert.equal({}.polluted, undefined);
});

test('Column matching ignores spacing and supports recipient-name aliases', () => {
  assert.equal(matchColumn('Name', ['Full Name', 'College']), 'Full Name');
  assert.equal(matchColumn('Event Name', ['EVENT_NAME']), 'EVENT_NAME');
  assert.equal(matchColumn('Unknown', ['Name']), '');
});

test('Required validation uses mapped columns, common values, and sequential IDs', () => {
  const fields = [{ name: 'Name', source: 'column', column: 'Full Name', required: true },
    { name: 'Event', source: 'constant', value: 'Sample event', required: true },
    { name: 'ID', source: 'sequence', prefix: 'TF-', start: 9, digits: 4, required: true }];
  assert.equal(validateRecipients(fields, [{ 'Full Name': 'Sample' }]).length, 0);
  assert.equal(resolveValue(fields[2], {}, 1), 'TF-0010');
  assert.equal(validateRecipients(fields, [{ 'Full Name': '' }])[0].row, 1);
  assert.equal(resolveValue({ source: 'column', column: 'score' }, { score: 0 }), '0');
});

test('Filenames remain safe and unique for duplicate names', () => {
  assert.equal(certificateFilename('Sample / Demo: "Team"', 0), '0001-Sample - Demo- -Team-.pdf');
  assert.notEqual(certificateFilename('Sample', 0), certificateFilename('Sample', 1));
});

test('Untrusted text is escaped and CSV exports guard spreadsheet formulas', () => {
  assert.equal(escapeHtml('<img src="x" onerror=\'alert(1)\'>'), '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;');
  assert.match(toCsv([{ Name: '=HYPERLINK("bad")' }]), /'=HYPERLINK/);
});
