export interface RosterInput { registerNumber: string; name: string; githubLogin?: string; }

/** Parse only locally, so previewing a roster never sends personal data to the server. */
export function parseRoster(text: string): RosterInput[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  const result: RosterInput[] = [], seen = new Set<string>();
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index].trim();
    if (/^\|?[\s:|\-]+\|?$/.test(line)) continue;
    const markdown = line.startsWith('|');
    if (markdown) line = line.replace(/^\|/, '').replace(/\|$/, '');
    const delimiter = markdown ? '|' : line.includes('\t') ? '\t' : ',';
    const cells: string[] = []; let value = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ''; }
      else value += char;
    }
    if (quoted) throw new Error(`Row ${index + 1}: close the quoted field. Multiline fields are not supported.`);
    cells.push(value.trim());
    if (!result.length && /^(reg(?:ister)?[\s._-]*(?:no|number)\.?|registerNumber)$/i.test(cells[0])) continue;
    if (cells.length < 2 || cells.length > 3 || !cells[0] || !cells[1]) throw new Error(`Row ${index + 1}: provide register number, name, and optionally GitHub username.`);
    const registerNumber = cells[0], name = cells[1].replace(/\s+/g, ' '), githubLogin = cells[2]?.replace(/^@/, '');
    if (!/^[A-Za-z0-9/-]{1,40}$/.test(registerNumber) || name.length > 120) throw new Error(`Row ${index + 1}: use a valid register number and a name up to 120 characters.`);
    if (githubLogin && !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(githubLogin)) throw new Error(`Row ${index + 1}: enter a GitHub username, not a URL.`);
    if (seen.has(registerNumber.toLowerCase())) throw new Error(`Duplicate register number at row ${index + 1}: ${registerNumber}.`);
    seen.add(registerNumber.toLowerCase()); result.push({registerNumber, name, ...(githubLogin ? {githubLogin} : {})});
  }
  if (!result.length) throw new Error('Enter at least one student before previewing.');
  if (result.length > 250) throw new Error('Import at most 250 students at a time.');
  return result;
}
