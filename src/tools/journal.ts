import fs from 'fs';
import path from 'path';
export type JournalEntry = { ts: string; role: string; tool?: string; args?: any; result?: any; content?: string; };
export class Journal {
  private file: string;
  constructor(workdir: string) {
    this.file = path.join(workdir, '.muse', 'journal.jsonl');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }
  append(e: JournalEntry) {
    fs.appendFileSync(this.file, JSON.stringify({ ...e, ts: new Date().toISOString() }) + '\n');
  }
  readAll(): JournalEntry[] {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  }
  clear() { if (fs.existsSync(this.file)) fs.unlinkSync(this.file); }
}
