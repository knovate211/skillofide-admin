// Excel/CSV parsing for the bulk-user import, built on SheetJS.
import { resolveCourseId, COURSES } from './courses';
import type { ImportUserRow } from './api';

// SheetJS is about 430 KB and only needed when a file is read or written, so it
// is fetched then rather than shipped with every screen that can open an
// import dialog (the tests list among them).
const loadXLSX = () => import('xlsx');

export interface ParsedRow {
  row: number; // 1-based row number in the sheet (excludes header)
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  courseCells: string[]; // raw course tokens from the file
  course_ids: string[]; // resolved ids
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ['student', 'admin', 'recruiter'];

// Header aliases → canonical field. Matching is case-insensitive and ignores
// spaces/underscores, so "Phone Number", "phone_number", "PHONE" all map to phone.
const HEADER_MAP: Record<string, string> = {
  name: 'name',
  fullname: 'name',
  email: 'email',
  emailaddress: 'email',
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  password: 'password',
  role: 'role',
  courses: 'courses',
  course: 'courses',
  courseenrolled: 'courses',
  coursesenrolled: 'courses',
  enrolledcourses: 'courses',
};

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');

function genPassword(): string {
  // Readable temporary password: 3 letters + 4 digits, e.g. "Knv4821".
  const n = Math.floor(1000 + ((Date.now() >> 3) % 9000));
  return `Knv${n}`;
}

export async function parseFile(file: File): Promise<ParsedRow[]> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  });

  return rows.map((raw, i) => remapAndValidate(raw, i + 1));
}

function remapAndValidate(raw: Record<string, any>, rowNum: number): ParsedRow {
  const mapped: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    const canonical = HEADER_MAP[norm(key)];
    if (canonical) mapped[canonical] = String(raw[key] ?? '').trim();
  }

  const name = mapped.name || '';
  const email = (mapped.email || '').toLowerCase();
  const phone = mapped.phone || '';
  let role = (mapped.role || 'student').toLowerCase();
  let password = mapped.password || '';

  const courseCells = (mapped.courses || '')
    .split(/[,;|]/)
    .map((c) => c.trim())
    .filter(Boolean);

  const course_ids: string[] = [];
  const errors: string[] = [];

  if (!name) errors.push('name is required');
  if (!email) errors.push('email is required');
  else if (!EMAIL_RE.test(email)) errors.push('email is invalid');

  if (!VALID_ROLES.includes(role)) {
    errors.push(`role "${role}" invalid — using student`);
    role = 'student';
  }

  if (!password) password = genPassword();

  for (const cell of courseCells) {
    const id = resolveCourseId(cell);
    if (id) course_ids.push(id);
    else errors.push(`unknown course "${cell}"`);
  }

  return {
    row: rowNum,
    name,
    email,
    phone,
    password,
    role,
    courseCells,
    course_ids,
    errors,
  };
}

export function toImportRows(rows: ParsedRow[]): ImportUserRow[] {
  return rows.map((r) => ({
    name: r.name,
    email: r.email,
    phone: r.phone,
    password: r.password,
    role: r.role,
    course_ids: r.course_ids,
  }));
}

// Builds a downloadable .xlsx template with the expected headers, an example row,
// and a second sheet listing valid course ids/names.
export async function downloadTemplate(): Promise<void> {
  const XLSX = await loadXLSX();
  const headers = ['name', 'email', 'phone', 'password', 'role', 'courses'];
  const example = [
    'Jane Doe',
    'jane@example.com',
    '9876543210',
    '(leave blank to auto-generate)',
    'student',
    '1, genai',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);

  const catalog = [['course id', 'course name'], ...COURSES.map((c) => [c.id, c.name])];
  const wsCourses = XLSX.utils.aoa_to_sheet(catalog);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  XLSX.utils.book_append_sheet(wb, wsCourses, 'Course IDs');
  XLSX.writeFile(wb, 'user-import-template.xlsx');
}


// Download an email→password sheet so the admin can hand out temporary
// credentials after a bulk import (passwords are hashed server-side and cannot
// be recovered later).
export async function downloadCredentials(rows: ParsedRow[]): Promise<void> {
  const XLSX = await loadXLSX();
  const data = [
    ['name', 'email', 'password', 'role'],
    ...rows.map((r) => [r.name, r.email, r.password, r.role]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Credentials');
  XLSX.writeFile(wb, 'user-credentials.xlsx');
}

// ─── MCQ bulk import parsing ─────────────────────────────────────────────────
// Sheet columns: question, option1..optionN, correct, topic, difficulty, type,
// explanation. `correct` is a 1-based index (single) or comma list (multiple).
export interface ParsedMcq {
  row: number;
  topic: string;
  difficulty: string;
  body: string;
  kind: string;
  explanation: string;
  options: { body: string; is_correct: boolean; order_index: number }[];
  errors: string[];
}

const MCQ_HEADER: Record<string, string> = {
  question: 'question',
  body: 'question',
  topic: 'topic',
  difficulty: 'difficulty',
  type: 'type',
  kind: 'type',
  correct: 'correct',
  answer: 'correct',
  correctanswer: 'correct',
  explanation: 'explanation',
};

export async function parseMcqFile(file: File): Promise<ParsedMcq[]> {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  return rows.map((raw, i) => {
    const mapped: Record<string, string> = {};
    const optionCols: string[] = [];
    for (const key of Object.keys(raw)) {
      const n = norm(key);
      const canonical = MCQ_HEADER[n];
      if (canonical) mapped[canonical] = String(raw[key] ?? '').trim();
      else if (/^option\d+$/.test(n) || /^opt\d+$/.test(n)) {
        const val = String(raw[key] ?? '').trim();
        if (val) optionCols.push(val);
      }
    }

    const errors: string[] = [];
    const body = mapped.question || '';
    const topic = mapped.topic || 'General';
    let difficulty = (mapped.difficulty || 'Medium');
    difficulty = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
    if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) difficulty = 'Medium';
    const kind = (mapped.type || 'single').toLowerCase() === 'multiple' ? 'multiple' : 'single';

    if (!body) errors.push('question is required');
    if (optionCols.length < 2) errors.push('at least two options required');

    const correctRaw = mapped.correct || '';
    const correctIdx = new Set(
      correctRaw
        .split(/[,;]/)
        .map((x) => parseInt(x.trim(), 10) - 1)
        .filter((x) => !Number.isNaN(x)),
    );
    if (correctIdx.size === 0) errors.push('correct answer index required');

    const options = optionCols.map((body, idx) => ({
      body,
      is_correct: correctIdx.has(idx),
      order_index: idx,
    }));
    if (options.length && !options.some((o) => o.is_correct)) errors.push('correct index out of range');

    return {
      row: i + 1,
      topic,
      difficulty,
      body,
      kind,
      explanation: mapped.explanation || '',
      options,
      errors,
    };
  });
}

export async function downloadMcqTemplate(): Promise<void> {
  const XLSX = await loadXLSX();
  const headers = ['question', 'option1', 'option2', 'option3', 'option4', 'correct', 'topic', 'difficulty', 'type', 'explanation'];
  const example = ['What is 2+2?', '3', '4', '5', '6', '2', 'Math', 'Easy', 'single', 'Basic arithmetic'];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  XLSX.writeFile(wb, 'mcq-import-template.xlsx');
}

// ─── Hiring candidates ──────────────────────────────────────────────────────
// Bulk "add candidates" for a hiring test: name, email and phone per row. Any
// header spelling the user import accepts works here too ("Full Name",
// "Email Address", "Mobile"…). Rows are validated before anything is sent.

export interface ParsedCandidate {
  row: number;
  name: string;
  email: string;
  phone: string;
  errors: string[];
}

const CANDIDATE_HEADERS: Record<string, 'name' | 'email' | 'phone'> = {
  name: 'name', fullname: 'name', candidate: 'name', candidatename: 'name',
  email: 'email', emailaddress: 'email', emailid: 'email', mail: 'email',
  phone: 'phone', phonenumber: 'phone', mobile: 'phone', mobilenumber: 'phone', contact: 'phone',
};

export async function parseCandidateFile(file: File): Promise<ParsedCandidate[]> {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const seen = new Set<string>();

  return rows
    .map((raw, i) => {
      const out: ParsedCandidate = { row: i + 2, name: '', email: '', phone: '', errors: [] };
      for (const [k, v] of Object.entries(raw)) {
        const field = CANDIDATE_HEADERS[norm(k)];
        if (field) out[field] = String(v ?? '').trim();
      }
      out.email = out.email.toLowerCase();
      if (!out.email) out.errors.push('missing email');
      else if (!EMAIL_RE.test(out.email)) out.errors.push('invalid email');
      else if (seen.has(out.email)) out.errors.push('listed twice in the file');
      if (out.email) seen.add(out.email);
      return out;
    })
    // A fully blank row (common at the bottom of a sheet) is not an error.
    .filter((r) => r.name || r.email || r.phone);
}

export async function downloadCandidateTemplate(): Promise<void> {
  const XLSX = await loadXLSX();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Email', 'Phone'],
    ['Asha Rao', 'asha@example.com', '9876543210'],
    ['Ravi Kumar', 'ravi@example.com', ''],
  ]);
  ws['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
  XLSX.writeFile(wb, 'candidates-template.xlsx');
}
