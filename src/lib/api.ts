// Thin REST client for the admin + recruiter endpoints on the api-gateway.
// Every request carries the admin Bearer token. A 401 clears the session and
// bounces to /login.
import { getToken, logout } from './auth';
// Recruiter calls carry the company they are working in. company.ts imports
// this module too; the cycle is safe because both only call each other at
// request time, never while loading.
import { currentCompanyId, withCompany } from './company';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const resp = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 401) {
    logout();
    window.location.href = '/login';
    throw new Error('Session expired. Please sign in again.');
  }

  const text = await resp.text();
  const data = text ? safeJson(text) : null;

  if (!resp.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${resp.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  course_ids: string[];
  created_at: string;
  /** Companies this user recruits for; empty for non-recruiters. */
  companies?: { id: string; name: string; role: string }[];
}

export interface ListUsersResponse {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportUserRow {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: string;
  course_ids?: string[];
}

export interface ImportRowResult {
  email: string;
  success: boolean;
  message: string;
  /** Whether a welcome email was actually dispatched to this address. */
  emailed?: boolean;
  /** True for a newly created account, false for one that already existed. */
  is_new_user?: boolean;
}

export interface BulkImportResponse {
  total: number;
  success: number;
  failed: number;
  results: ImportRowResult[];
}

// ─── Users (admin) ──────────────────────────────────────────────────────────

export interface UserFilters {
  search?: string;
  role?: string;
  /** A course id, or 'none' for users on no course. */
  course?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

function userFilterQuery(f: UserFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}

export const listUsers = (page = 1, pageSize = 50, filters: UserFilters = {}) =>
  request<ListUsersResponse>(
    'GET',
    `/api/admin/users?page=${page}&page_size=${pageSize}&${userFilterQuery(filters)}`,
  );

export type BulkUserAction = 'set_role' | 'grant_course' | 'revoke_course' | 'delete';

export const bulkUsers = (
  ids: string[],
  action: BulkUserAction,
  opts: { role?: string; course_id?: string } = {},
) =>
  request<{ affected: number; requested: number }>('POST', '/api/admin/users/bulk', {
    ids,
    action,
    ...opts,
  });

export async function exportUsersCsv(filters: UserFilters): Promise<void> {
  await downloadAuthed(
    `/api/admin/users/export.csv?${userFilterQuery(filters)}`,
    `users-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

// Fetches a file with the Bearer token and hands it to the browser as a download.
async function downloadAuthed(path: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(path, { headers });
  if (!resp.ok) throw new Error(`Export failed (${resp.status})`);
  const url = URL.createObjectURL(await resp.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface AdminStats {
  users_total: number;
  users_by_role: Record<string, number>;
  users_by_course: Record<string, number>;
  users_new_7d: number;
  users_no_course: number;
  enquiries_new: number;
  enquiries_7d: number;
  scholarship_pending: number;
  scholarship_7d: number;
  tests_published: number;
  attempts_7d: number;
  attempts_live: number;
  answers_to_grade: number;
  classes_active: number;
  signups_30d: { day: string; count: number }[];

  // Last week against the week before, for the trend arrows.
  users_new_prev_7d: number;
  enquiries_prev_7d: number;
  scholarship_prev_7d: number;
  attempts_prev_7d: number;
  /** Sign-ups per day over `signups_days`, split into students and staff. */
  signups_days: number;
  signups_by_role: { day: string; students: number; staff: number }[];
  /** The same split for the equally long window before it. */
  signups_prev: { students: number; staff: number };
  /** Daily counts for the last 14 days, oldest first. */
  spark: Record<'signups' | 'enquiries' | 'scholarship' | 'attempts' | 'enrolments' | 'submissions', number[]>;
}

export const getStats = (days: 7 | 30 | 90 = 30) => request<AdminStats>('GET', `/api/admin/stats?days=${days}`);

export interface ActivityItem {
  at: string;
  name: string;
  email: string;
  text: string;
  kind: 'enrolled' | 'test' | 'scholarship' | 'enquiry' | 'joined';
  link_to?: string;
  /** Course id for enrolments and scholarship applications. */
  course?: string;
}

export const getActivity = (limit = 8) =>
  request<{ items: ActivityItem[] }>('GET', `/api/admin/activity?limit=${limit}`);

export interface GradingQueueItem {
  attempt_id: string;
  assessment_id: string;
  title: string;
  user_name: string;
  user_email: string;
  pending: number;
  submitted_at: string;
}

export const getGradingQueue = () =>
  request<{ items: GradingQueueItem[] }>('GET', '/api/admin/grading-queue');

// ─── Audit log ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  actor_email: string;
  action: string;
  target_id: string;
  target_email: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export const listAudit = (page = 1, pageSize = 50, action = '', search = '') => {
  const p = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (action) p.set('action', action);
  if (search) p.set('search', search);
  return request<{ entries: AuditEntry[]; total: number }>('GET', `/api/admin/audit?${p}`);
};

export const bulkImport = (users: ImportUserRow[], sendWelcome = false) =>
  request<BulkImportResponse>('POST', '/api/admin/bulk-import', {
    users,
    send_welcome: sendWelcome,
  });

export const updateUserRole = (id: string, role: string) =>
  request<{ success: boolean }>('PATCH', `/api/admin/users/${id}`, { role });

export interface UserPatch {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

// Only the provided fields are changed server-side. Phone is written to the
// profile row; name/email/role to the users row.
export const updateUser = (id: string, patch: UserPatch) =>
  request<{ success: boolean }>('PATCH', `/api/admin/users/${id}`, patch);

export const deleteUser = (id: string) =>
  request<{ success: boolean }>('DELETE', `/api/admin/users/${id}`);

export const grantCourse = (id: string, courseId: string) =>
  request<{ success: boolean }>('POST', `/api/admin/users/${id}/courses`, {
    course_id: courseId,
  });

export const revokeCourse = (id: string, courseId: string) =>
  request<{ success: boolean }>(
    'DELETE',
    `/api/admin/users/${id}/courses/${encodeURIComponent(courseId)}`,
  );

// ─── Enquiries (marketing-site contact form leads) ──────────────────────────

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  interest: string;
  message: string;
  source: string;
  page_url: string;
  status: string; // new | contacted | closed
  notes: string;
  created_at: string;
  /** Set only on company leads for the hiring-test platform. */
  company?: string;
  job_title?: string;
  company_size?: string;
  hiring_volume?: string;
}

export interface ListInquiriesResponse {
  inquiries: Inquiry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InquiryFilters {
  search?: string;
  status?: string;
  source?: string;
  interest?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

const cleanFilters = (f: object): Record<string, string> =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => !!v)) as Record<string, string>;

export const listInquiries = (page = 1, pageSize = 25, f: InquiryFilters = {}) => {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...cleanFilters(f) });
  return request<ListInquiriesResponse>('GET', `/api/admin/inquiries?${q.toString()}`);
};

export interface Facet {
  value: string;
  label?: string;
  count: number;
}

export const getInquiryFacets = () =>
  request<{ status: Facet[]; source: Facet[]; interest: Facet[] }>('GET', '/api/admin/inquiries/facets');

/**
 * Either explicit ids, or every row matching `filters` (the same filters the
 * list uses). With allMatching, `expected` is the count the admin confirmed;
 * the server refuses if the match set has changed since.
 */
export type BulkTarget =
  | { ids: string[] }
  | { allMatching: true; filters: object; expected: number };

const bulkBody = (t: BulkTarget) =>
  'ids' in t
    ? { ids: t.ids }
    : { all_matching: true, filters: cleanFilters(t.filters), expected: t.expected };

export const bulkInquiries = (t: BulkTarget, action: 'status' | 'delete', status?: string) =>
  request<{ affected: number; requested: number }>('POST', '/api/admin/inquiries/bulk', {
    ...bulkBody(t),
    action,
    status,
  });

export const exportInquiriesCsv = (f: InquiryFilters) =>
  downloadAuthed(
    `/api/admin/inquiries/export.csv?${new URLSearchParams(cleanFilters(f))}`,
    `enquiries-${new Date().toISOString().slice(0, 10)}.csv`,
  );

export const updateInquiry = (id: string, patch: { status?: string; notes?: string }) =>
  request<{ success: boolean }>('PATCH', `/api/admin/inquiries/${id}`, patch);

// ─── Course catalog ─────────────────────────────────────────────────────────

export interface CourseDto {
  id: string;
  name: string;
}

export const fetchCourses = () =>
  request<{ courses: CourseDto[] }>('GET', '/api/admin/courses');

// ─── Assessments / tests (recruiter API; admin passes the guard) ────────────

export interface McqOption {
  id?: string;
  body: string;
  is_correct?: boolean;
  order_index: number;
}

export interface McqQuestion {
  id?: string;
  company_id?: string;
  /** Course id ('5', 'genai', …); '' or absent = general, usable by any course. */
  course_id?: string;
  topic: string;
  difficulty: string; // Easy | Medium | Hard
  body: string;
  kind: string; // single | multiple | numeric
  explanation?: string;
  is_active: boolean;
  options: McqOption[];
}

export interface SectionQuestion {
  id?: string;
  section_id?: string;
  mcq_question_id?: string;
  problem_id?: string;
  marks: number;
  order_index: number;
  title?: string;
  difficulty?: string;
}

export interface Section {
  id?: string;
  assessment_id?: string;
  title: string;
  kind: string; // mcq | coding | descriptive
  order_index: number;
  duration_minutes?: number;
  cutoff_marks?: number;
  /** >0 draws this many questions per attempt from the bank (random draw). */
  pick_count?: number;
  /** Random draw filters; '' = any. */
  pick_course?: string;
  pick_topic?: string;
  pick_difficulty?: string;
  /** Marks per drawn question. */
  pick_marks?: number;
  partial_credit?: boolean;
  questions?: SectionQuestion[];
}

export interface Assessment {
  id?: string;
  company_id?: string;
  /** Read-only: the owning company's name, for hiring tests. */
  company_name?: string;
  title: string;
  description?: string;
  purpose?: string; // practice | hiring | scholarship | certification
  duration_minutes: number;
  total_marks?: number;
  passing_marks?: number;
  negative_marking?: number;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  allow_backtrack?: boolean;
  /** Reveal the paper one question at a time; the next unlocks once this one is answered. */
  lock_forward?: boolean;
  reveal_results?: boolean;
  status?: string; // draft | published | archived
  max_attempts?: number;
  sections?: Section[];
  question_count?: number;
  attempt_count?: number;
  /** Practice tests: courses whose students may take it; empty = every student. */
  course_ids?: string[];
  created_at?: string;
}

// ─── Companies & hiring invites ───────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  slug?: string;
  logo_url?: string;
  website?: string;
  created_at?: string;
}

export const listCompanies = () =>
  request<{ companies: Company[] }>('GET', '/api/recruiter/companies');

export const createCompany = (c: { name: string; website?: string; logo_url?: string }) =>
  request<Company>('POST', '/api/recruiter/companies', c);

export interface CompanyMember {
  company_id: string;
  user_id: string;
  email?: string;
  name?: string;
  role: string; // recruiter | owner
}

export const listCompanyMembers = (companyId: string) =>
  request<{ members: CompanyMember[] }>('GET', `/api/recruiter/companies/${companyId}/members`);

/** Admin only. Re-adding an existing member just updates their role. */
export const addCompanyMember = (companyId: string, userId: string, role: 'recruiter' | 'owner' = 'recruiter') =>
  request<unknown>('POST', `/api/recruiter/companies/${companyId}/members`, { user_id: userId, role });

// ─── Hiring candidates ──────────────────────────────────────────────────────
// Candidates live in their own table (not All Users). Adding one emails them a
// personal link that signs them straight into the test. The link is never
// returned here: it is a login credential and only the candidate receives it.

export interface HiringCandidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** invited | opened | in_progress | submitted | evaluating | evaluated | disqualified | expired */
  status: string;
  added_at: string;
  emailed_at?: string;
  email_error?: string;
  expires_at?: string;
  opened_at?: string;
  submitted_at?: string;
  attempt_id?: string;
  score?: number;
  max_score?: number;
}

export interface CandidateInput {
  name: string;
  email: string;
  phone?: string;
}

export interface AddCandidatesResult {
  results: { email: string; status: 'added' | 'updated' | 'skipped'; message?: string }[];
  added: number;
  email_enabled: boolean;
}

export const listHiringCandidates = (assessmentId: string) =>
  request<{ candidates: HiringCandidate[] }>('GET', `/api/hiring/assessments/${assessmentId}/candidates`);

export const addHiringCandidates = (assessmentId: string, candidates: CandidateInput[], expiresAt?: string) =>
  request<AddCandidatesResult>('POST', `/api/hiring/assessments/${assessmentId}/candidates`, {
    candidates,
    expires_at: expiresAt || undefined,
  });

/** Sends a fresh link (the old one stops working) valid for another 7 days. */
export const resendHiringCandidate = (candidateId: string) =>
  request<{ resent: boolean; email_enabled: boolean }>('POST', `/api/hiring/candidates/${candidateId}/resend`);

/** Only before the candidate has started; afterwards their result is kept. */
export const removeHiringCandidate = (candidateId: string) =>
  request<unknown>('DELETE', `/api/hiring/candidates/${candidateId}`);

export const listAssessments = (params = '') =>
  request<{ assessments: Assessment[]; total: number }>(
    'GET',
    `/api/recruiter/assessments?${withCompany(params)}`,
  );

export const createAssessment = (a: Assessment) =>
  request<{ id: string }>('POST', '/api/recruiter/assessments', a);

export const getAssessment = (id: string) =>
  request<Assessment>('GET', `/api/recruiter/assessments/${id}`);

export const updateAssessment = (id: string, a: Assessment) =>
  request<unknown>('PATCH', `/api/recruiter/assessments/${id}`, a);

/** Copies a test (settings, sections, questions) as a new draft. */
export const duplicateTest = (id: string, title: string) =>
  request<{ id: string; sections: number; questions: number }>(
    'POST',
    `/api/admin/tests/${id}/duplicate`,
    { title },
  );

export const deleteAssessment = (id: string) =>
  request<unknown>('DELETE', `/api/recruiter/assessments/${id}`);

export const publishAssessment = (id: string, publish: boolean) =>
  request<unknown>('POST', `/api/recruiter/assessments/${id}/publish`, {
    publish,
  });

export const upsertSection = (assessmentId: string, s: Section) =>
  request<{ id: string }>(
    'POST',
    `/api/recruiter/assessments/${assessmentId}/sections`,
    s,
  );

export const deleteSection = (assessmentId: string, sectionId: string) =>
  request<unknown>(
    'DELETE',
    `/api/recruiter/assessments/${assessmentId}/sections/${sectionId}`,
  );

export const setSectionQuestions = (
  assessmentId: string,
  sectionId: string,
  questions: SectionQuestion[],
) =>
  request<unknown>(
    'PUT',
    `/api/recruiter/assessments/${assessmentId}/sections/${sectionId}/questions`,
    { questions },
  );

// ─── Coding problems (problem-service, via GraphQL) ─────────────────────────

export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: string;
}

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch('/api/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const body = await resp.json();
  if (body.errors?.length) throw new Error(body.errors[0].message || 'GraphQL error');
  return body.data as T;
}

export async function listProblems(search = ''): Promise<ProblemSummary[]> {
  // problem-service serves at most 100 per page (larger sizes fall back to
  // 50), so walk the pages rather than ask for everything at once.
  const all: ProblemSummary[] = [];
  for (let page = 1; page <= 50; page++) {
    const data = await graphql<{ listProblems: { problems: ProblemSummary[]; total: number } }>(
      `query($page: Int, $pageSize: Int){ listProblems(page: $page, pageSize: $pageSize){ problems { id title difficulty } total } }`,
      { page, pageSize: 100 },
    );
    const batch = data.listProblems?.problems || [];
    all.push(...batch);
    if (batch.length < 100 || all.length >= (data.listProblems?.total ?? 0)) break;
  }
  const v = search.trim().toLowerCase();
  return v ? all.filter((p) => p.title.toLowerCase().includes(v)) : all;
}

// ─── Coding problems (admin authoring) ──────────────────────────────────────

/** Types the judge's code generator supports, in the order shown to authors. */
export const PROBLEM_TYPES = [
  'int', 'long', 'double', 'bool', 'string', 'char',
  'int[]', 'long[]', 'double[]', 'bool[]', 'string[]', 'int[][]', 'string[][]',
  'TreeNode', 'ListNode',
] as const;

export interface ProblemParam { name: string; type: string }

export interface ProblemSignature {
  entry_point: string;
  params: ProblemParam[];
  return_type: string;
  /** exact | unordered | set | float */
  compare: string;
}

export interface ProblemTestCase {
  /** One JSON value per parameter, one per line. */
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

export interface CodingProblem {
  title: string;
  difficulty: string;
  topic: string;
  course_id: string;
  statement: string;
  constraints: string[];
  /** true = only usable in tests, hidden from the practice list. */
  is_private: boolean;
  signature: ProblemSignature;
  test_cases: ProblemTestCase[];
}

export interface ProblemRow {
  id: string;
  title: string;
  difficulty: string;
  topic: string;
  course_id: string;
  is_private: boolean;
  io_mode: string;
  editable: boolean;
  test_cases: number;
  used_in_tests: number;
  verified: boolean;
  updated_at: string;
}

export const listProblemsAdmin = (params: string) =>
  request<{ problems: ProblemRow[]; total: number }>('GET', `/api/admin/problems?${params}`);

export const getProblemAdmin = (id: string) =>
  request<{
    id: string;
    problem: CodingProblem;
    io_mode: string;
    editable: boolean;
    used_in_tests: number;
    reference_solutions: Record<string, string>;
  }>('GET', `/api/admin/problems/${id}`);

export const saveProblem = (p: CodingProblem, id?: string) =>
  request<{ id: string }>(id ? 'PUT' : 'POST', id ? `/api/admin/problems/${id}` : '/api/admin/problems', p);

export const deleteProblem = (id: string) =>
  request<{ success: boolean }>('DELETE', `/api/admin/problems/${id}`);

export const previewStarters = (s: Omit<ProblemSignature, 'compare'>) =>
  request<{ starters: Record<string, string> }>('POST', '/api/admin/problems/starters', s);

export interface VerifyResult {
  all_passed: boolean;
  result: {
    overall_status: string;
    compile_error?: string;
    test_results: {
      input: string;
      expected_output: string;
      actual_output: string;
      status: string;
      execution_ms: number;
      error?: string;
    }[];
  };
}

export const verifyProblem = (id: string, language: string, code: string) =>
  request<VerifyResult>('POST', `/api/admin/problems/${id}/verify`, { language, code });

// ─── MCQ bank ────────────────────────────────────────────────────────────────

export const listMcq = (params = '') =>
  request<{ questions: McqQuestion[]; total: number }>(
    'GET',
    `/api/recruiter/mcq-bank?${withCompany(params)}`,
  );

/** Selects questions with no course in listMcq / getMcqFacets. */
export const GENERAL_COURSE = '__general';

export const getMcqFacets = (course = '') =>
  request<{ course: Facet[]; topic: Facet[]; difficulty: Facet[] }>(
    'GET',
    `/api/admin/mcq-bank/facets?${withCompany(course ? `course=${encodeURIComponent(course)}` : '')}`,
  );

// For a recruiter the backend files new questions under their company and
// refuses edits to anything else; company_id just says which of theirs.
export const upsertMcq = (q: McqQuestion) =>
  request<{ id: string }>('POST', '/api/recruiter/mcq-bank', {
    ...q,
    company_id: currentCompanyId() || q.company_id,
  });

export const deleteMcq = (id: string) =>
  request<unknown>('DELETE', `/api/recruiter/mcq-bank/${id}?${withCompany()}`);

export const importMcq = (questions: McqQuestion[]) =>
  request<{ imported: number }>('POST', '/api/recruiter/mcq-bank/import', {
    questions,
    company_id: currentCompanyId() || undefined,
  });

// ─── Results ─────────────────────────────────────────────────────────────────

export interface AttemptSummary {
  id?: string;
  assessment_id?: string;
  user_name?: string;
  user_email?: string;
  attempt_no?: number;
  status?: string;
  started_at?: string;
  submitted_at?: string;
  score?: number;
  max_score?: number;
  percent?: number;
  passed?: boolean;
}

export const listAttempts = (assessmentId: string) =>
  request<{ attempts: AttemptSummary[]; total?: number }>(
    'GET',
    `/api/recruiter/assessments/${assessmentId}/attempts`,
  );

export interface ReportQuestion {
  id: string;
  section_id: string;
  kind: 'mcq' | 'coding' | 'descriptive';
  order_index: number;
  marks: number;
  body?: string;
  mcq_kind?: string;
  options?: { id?: string; body: string; is_correct?: boolean }[];
  problem_id?: string;
  problem_title?: string;
  selected_option_ids?: string[];
  text_answer?: string;
  language?: string;
  code?: string;
  grading_status: string;
  visited: boolean;
  marked_review: boolean;
  time_spent_ms: number;
  awarded_marks?: number;
}

export interface AttemptReport {
  summary: AttemptSummary & { integrity_score?: number; section_scores?: Record<string, number>; section_max?: Record<string, number> };
  questions: ReportQuestion[];
  proctor_events: { kind: string; detail?: string; occurred_at: string }[];
}

export const getAttemptReport = (attemptId: string) =>
  request<AttemptReport>('GET', `/api/recruiter/attempts/${attemptId}/report`);

export const gradeAnswer = (attemptId: string, questionId: string, marks: number) =>
  request<{ score: number; max_score: number }>(
    'PATCH',
    `/api/recruiter/attempts/${attemptId}/questions/${questionId}`,
    { marks },
  );

// The export endpoint needs the Bearer token, so we fetch it as a blob and
// trigger a client-side download rather than navigating to a bare URL.
export async function downloadResultsCsv(
  assessmentId: string,
  filename: string,
): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(
    `/api/recruiter/assessments/${assessmentId}/export.csv`,
    { headers },
  );
  if (!resp.ok) throw new Error(`Export failed (${resp.status})`);

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Scholarship ──────────────────────────────────────────────────────────────

export interface ScholarshipApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  course_id: string;
  course_name: string;
  qualification: string;
  college: string;
  graduation_year: number | null;
  city: string;
  /** Derived from the candidate's attempt, not stored — see the gateway handler. */
  status: string;
  attempt_id: string;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  award_percent: number | null;
  notes: string;
  created_at: string;
}

export interface ListScholarshipsResponse {
  applications: ScholarshipApplication[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AwardSlab {
  minPercent: number;
  awardPercent: number;
}

export interface ScholarshipProgram {
  id: string;
  course_id: string;
  course_name: string;
  assessment_id: string;
  assessment_title: string;
  /** 'missing' when the mapped assessment no longer exists. */
  assessment_status: string;
  is_active: boolean;
  opens_at?: string;
  closes_at?: string;
  seats: number;
  used: number;
  award_slabs: AwardSlab[];
}

export interface ScholarshipFilters {
  status?: string;
  courseId?: string;
  search?: string;
  minPercent?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

function scholarshipQuery(f: ScholarshipFilters): URLSearchParams {
  return new URLSearchParams(cleanFilters(f));
}

export const getScholarshipFacets = () =>
  request<{ status: Facet[]; course: Facet[] }>('GET', '/api/admin/scholarships/facets');

export const bulkDeleteScholarships = (t: BulkTarget) =>
  request<{ affected: number; requested: number; accounts_removed: number }>(
    'POST',
    '/api/admin/scholarships/bulk',
    { ...bulkBody(t), action: 'delete' },
  );

export const listScholarships = (page = 1, pageSize = 25, f: ScholarshipFilters = {}) => {
  const q = scholarshipQuery(f);
  q.set('page', String(page));
  q.set('pageSize', String(pageSize));
  return request<ListScholarshipsResponse>('GET', `/api/admin/scholarships?${q}`);
};

export const updateScholarship = (
  id: string,
  patch: { status?: string; award_percent?: number | null; notes?: string },
) => request<{ success: boolean }>('PATCH', `/api/admin/scholarships/${id}`, patch);

/**
 * Downloads the CSV for whatever the screen is currently filtered to.
 *
 * It cannot be a plain link: the endpoint needs the Bearer token, and an <a>
 * carries no headers. So the file is fetched, turned into an object URL and
 * clicked — and the URL is revoked afterwards so the blob is not held for the
 * life of the tab.
 */
export async function exportScholarshipsCsv(f: ScholarshipFilters = {}): Promise<void> {
  const token = getToken();
  const resp = await fetch(`/api/admin/scholarships/export.csv?${scholarshipQuery(f)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (resp.status === 401) {
    logout();
    window.location.href = '/login';
    throw new Error('Session expired. Please sign in again.');
  }
  if (!resp.ok) throw new Error(`Export failed (${resp.status})`);

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scholarship-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const listScholarshipPrograms = () =>
  request<{ programs: ScholarshipProgram[] }>('GET', '/api/admin/scholarship-programs');

export const upsertScholarshipProgram = (p: {
  course_id: string;
  course_name: string;
  assessment_id: string;
  is_active?: boolean;
  opens_at?: string;
  closes_at?: string;
  seats?: number;
  award_slabs?: AwardSlab[];
}) => request<{ success: boolean; id: string }>('POST', '/api/admin/scholarship-programs', p);

export interface ResendResult {
  /** False when the relay refused the message. The link is still valid. */
  success: boolean;
  email: string;
  /** The freshly issued link. Shown to staff so a broken mailbox is not a dead end. */
  testUrl: string;
  expires: string;
  /** Why the send failed, when it did. */
  emailError?: string;
}

/**
 * Issues a new test link and emails it again.
 *
 * The old link stops working — this is a reissued credential, not a copy of the
 * previous one — which is also what makes it the fix for an expired link rather
 * than only a lost one.
 */
export const resendScholarshipLink = (id: string) =>
  request<ResendResult>('POST', `/api/admin/scholarships/${id}/resend`);

/**
 * Removes an application, its invitation and any attempt at that paper.
 *
 * The candidate's account only goes with it when this funnel created it and
 * nothing else depends on it — a scholarship applicant is often a real student
 * with courses, and their account is not a by-product of this row.
 */
export const deleteScholarship = (id: string) =>
  request<{ success: boolean; email: string; accountRemoved: boolean }>(
    'DELETE',
    `/api/admin/scholarships/${id}`,
  );

/**
 * Turns an applicant into a student and grants the course they applied for.
 *
 * Deliberately a separate, manual step: passing the test is not enrolment — the
 * fee still has to be paid, and only a person knows whether it has been.
 */
export const enrolScholarshipApplicant = (id: string) =>
  request<{ success: boolean; email: string; courseName: string }>(
    'POST',
    `/api/admin/scholarships/${id}/enrol`,
  );

// ─── Live classes & attendance ───────────────────────────────────────────────

export interface ClassSchedule {
  id: string;
  course_id: string;
  title: string;
  instructor: string;
  meeting_url: string;
  /** 0 = Sunday … 6 = Saturday. */
  days_of_week: number[];
  start_time: string; // HH:MM, India time
  end_time: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  is_active: boolean;
  enrolled?: number;
}

export type ClassScheduleInput = Omit<ClassSchedule, 'id' | 'enrolled'>;

export interface RosterRow {
  user_id: string;
  name: string;
  email: string;
  status: 'present' | 'absent' | 'pending';
  marked_at?: string;
}

export interface SessionRoster {
  class: ClassSchedule;
  date: string;
  state: 'not_scheduled' | 'upcoming' | 'live' | 'ended';
  present: number;
  students: RosterRow[];
}

export const listClasses = () => request<{ classes: ClassSchedule[] }>('GET', '/api/admin/classes');

export const createClass = (c: ClassScheduleInput) =>
  request<{ success: boolean; id: string }>('POST', '/api/admin/classes', c);

export const updateClass = (id: string, c: ClassScheduleInput) =>
  request<{ success: boolean }>('PUT', `/api/admin/classes/${encodeURIComponent(id)}`, c);

export const deleteClass = (id: string) =>
  request<{ success: boolean }>('DELETE', `/api/admin/classes/${encodeURIComponent(id)}`);

export const getClassRoster = (id: string, date: string) =>
  request<SessionRoster>('GET', `/api/admin/classes/${encodeURIComponent(id)}/attendance?date=${date}`);

// ─── Online enrolments (Razorpay) ────────────────────────────────────────────

export interface EnrollmentOrder {
  id: string;
  course_id: string;
  course_name: string;
  plan: 'self' | 'mentor';
  /** Rupees. */
  amount: number;
  name: string;
  email: string;
  phone: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  /** created (checkout opened, not paid) | paid | enrolled | failed */
  status: string;
  new_account: boolean;
  error: string;
  created_at: string;
  paid_at: string | null;
}

export const listEnrollments = (page = 1, pageSize = 50, status = '', search = '') => {
  const p = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (status) p.set('status', status);
  if (search) p.set('search', search);
  return request<{ orders: EnrollmentOrder[]; total: number; revenue: number; enabled: boolean; test_mode: boolean }>(
    'GET',
    `/api/admin/enrollments?${p}`,
  );
};

// ─── Integrity report ───────────────────────────────────────────────────────
// Evidence for reviewers: a risk rating per candidate with the reasons behind
// it, similar code between candidates, identical wrong answers, shared
// networks, and the editor history behind code playback. Nothing here decides
// anything — it tells a reviewer where to look.

export interface IntegrityPerson {
  attempt_id: string;
  name: string;
  email: string;
}

export interface IntegritySignal {
  severity: 'high' | 'medium' | 'low';
  text: string;
}

export interface AttemptRisk extends IntegrityPerson {
  status: string;
  integrity_score: number;
  risk: 'high' | 'medium' | 'low';
  risk_points: number;
  signals: IntegritySignal[];
  ips: string[];
  sessions: number;
}

export interface SimilarPair {
  question_title: string;
  language: string;
  a: IntegrityPerson;
  b: IntegrityPerson;
  percent: number;
}

export interface IntegrityReport {
  attempts: AttemptRisk[];
  similarity: SimilarPair[];
  collusion: { a: IntegrityPerson; b: IntegrityPerson; shared_wrong: number; both_wrong: number }[];
  shared_ips: { ip: string; people: IntegrityPerson[] }[];
}

export interface CodeSnapshot {
  at: string;
  language: string;
  code: string;
  reason: 'start' | 'edit' | 'language' | 'run' | 'submit';
  chars_added: number;
}

export interface AttemptIntegrity {
  risk: AttemptRisk | null;
  sessions: { ip: string; user_agent: string; screen: string; first_seen: string; last_seen: string }[];
  /** Keyed by attempt question id. */
  snapshots: Record<string, CodeSnapshot[]>;
  similarity: SimilarPair[];
}

export const getIntegrityReport = (assessmentId: string) =>
  request<IntegrityReport>('GET', `/api/integrity/assessments/${assessmentId}`);

export const getAttemptIntegrity = (attemptId: string) =>
  request<AttemptIntegrity>('GET', `/api/integrity/attempts/${attemptId}`);

// ─── Paid certification exams ────────────────────────────────────────────────
// Two screens sit on these: the catalogue of exams on offer, and the people who
// have paid for one. A registration is a purchase first and an attempt second,
// so money (refunds) and the credential (issue/revoke) are recorded by hand —
// the attempt only produces the score behind those decisions.

export interface CertificationExam {
  id: string;
  /** Stable public key; the marketing site links to the exam by this. */
  slug: string;
  title: string;
  course_id: string;
  assessment_id: string;
  assessment_title: string;
  /** 'missing' when the mapped paper no longer exists. */
  assessment_status: string;
  price_rupees: number;
  pass_percent: number;
  /** How long the link issued on payment stays usable. */
  link_valid_days: number;
  /** Cooling-off period before a failed candidate may buy another sitting. */
  resit_wait_days: number;
  summary: string;
  is_active: boolean;
  opens_at?: string;
  closes_at?: string;
  registrations: number;
  passed: number;
}

export interface CertificationExamInput {
  slug: string;
  title: string;
  course_id: string;
  assessment_id: string;
  price_rupees: number;
  pass_percent: number;
  link_valid_days: number;
  resit_wait_days: number;
  summary: string;
  is_active: boolean;
  opens_at: string;
  closes_at: string;
}

export const listCertificationExams = () =>
  request<{ exams: CertificationExam[] }>('GET', '/api/admin/certification-exams');

/**
 * Creates or updates the exam with this slug.
 *
 * The slug is the key, so changing it produces a second exam rather than
 * renaming the first — which is why the form locks it once saved. The paper
 * must have purpose 'certification'; anything else is refused with a 400
 * explaining why, and `warning` carries the softer problems (an unpublished
 * paper, say) that are worth saying but not worth blocking on.
 */
export const upsertCertificationExam = (e: CertificationExamInput) =>
  request<{ success: boolean; id: string; warning?: string }>(
    'POST',
    '/api/admin/certification-exams',
    e,
  );

/** Refused with a 409 once anyone has registered — paid history is not deletable. */
export const deleteCertificationExam = (id: string) =>
  request<{ success: boolean }>('DELETE', `/api/admin/certification-exams/${id}`);

export interface CertificationRegistration {
  id: string;
  exam_title: string;
  exam_slug: string;
  name: string;
  email: string;
  phone: string;
  /** created | paid | started | submitted | passed | failed | expired | refunded */
  status: string;
  amount_rupees: number;
  payment_id: string;
  created_at: string;
  paid_at?: string;
  /** When the exam link stops working. */
  expires_at?: string;
  claimed_at?: string;
  emailed: boolean;
  attempt_id?: string;
  attempt_status?: string;
  score_percent?: number;
  /** Copied from the exam as it stood at purchase, so an old row reads correctly. */
  pass_percent: number;
  integrity_score?: number;
  credential_id?: string;
  credential_revoked: boolean;
  /** Set when the payment went through but issuing the link did not. */
  error?: string;
  notes?: string;
}

export interface CertificationFilters {
  status?: string;
  /** An exam slug. */
  exam?: string;
  search?: string;
}

export interface ListCertificationsResponse {
  registrations: CertificationRegistration[];
  total: number;
  page: number;
  pageSize: number;
}

export const listCertifications = (page = 1, pageSize = 25, f: CertificationFilters = {}) => {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...cleanFilters(f) });
  return request<ListCertificationsResponse>('GET', `/api/admin/certifications?${q}`);
};

export const exportCertificationsCsv = (f: CertificationFilters = {}) =>
  downloadAuthed(
    `/api/admin/certifications/export.csv?${new URLSearchParams(cleanFilters(f))}`,
    `certifications-${new Date().toISOString().slice(0, 10)}.csv`,
  );

/**
 * Records a note, or one of the decisions only a person can make.
 *
 * `refund` books the refund against the registration — it does not move money;
 * that happens in the payment dashboard. Issuing and revoking the credential
 * are likewise deliberate: passing the paper is evidence, not the certificate.
 */
export const updateCertification = (
  id: string,
  patch: {
    notes?: string;
    action?: 'refund' | 'issue_certificate' | 'revoke_certificate';
    reason?: string;
  },
) => request<{ success: boolean; credential_id?: string }>('PATCH', `/api/admin/certifications/${id}`, patch);

export interface CertificationResend {
  success: boolean;
  email: string;
  /** The freshly issued link. Shown to staff so a bouncing mailbox is not a dead end. */
  url: string;
  expires_at: string;
}

/** Issues a new link and emails it; the previous one stops working. */
export const resendCertificationLink = (id: string) =>
  request<CertificationResend>('POST', `/api/admin/certifications/${id}/resend`);

/** Pushes the deadline out without reissuing the link the candidate already has. */
export const extendCertification = (id: string, days: number) =>
  request<{ success: boolean; expires_at: string }>(
    'POST',
    `/api/admin/certifications/${id}/extend`,
    { days },
  );

// ─── Referral programme ──────────────────────────────────────────────────────
// Three screens sit on these: the offer itself (what a referral pays and what
// the friend saves), the people doing the referring, and the rewards they have
// earned. A reward is money leaving the business, so nothing here is automatic:
// staff approve it, then record the payout reference once it has actually been
// sent. `flags` is the backend's way of saying "look at this one first".

/**
 * The offer as it stands today.
 *
 * Every amount is in paise — the same unit the payment provider uses, so a
 * reward can never drift by a rounding of rupees. The screens divide by 100 on
 * the way in and multiply on the way out.
 */
export interface ReferralProgram {
  is_active: boolean;
  course_reward_paise: number;
  exam_reward_paise: number;
  friend_discount_percent: number;
  friend_discount_cap_paise: number;
  min_order_paise: number;
  /** Most one referrer can earn in a calendar month; 0 for no ceiling. */
  monthly_cap_paise: number;
  /** How long after a click a purchase still counts as that referral's. */
  attribution_days: number;
  terms_url: string;
}

export const getReferralProgram = () =>
  request<ReferralProgram>('GET', '/api/admin/referral-program');

/** Saves the whole offer — changes apply to new referrals, not earned rewards. */
export const saveReferralProgram = (p: ReferralProgram) =>
  request<{ success?: boolean }>('POST', '/api/admin/referral-program', p);

export interface Referrer {
  id: string;
  /** The code they share; every referral is attributed through it. */
  code: string;
  name: string;
  email: string;
  phone: string;
  /** Where a payout is sent. Without it nothing can be paid. */
  upi_id: string;
  pan: string;
  is_blocked: boolean;
  notes: string;
  created_at: string;
  clicks: number;
  conversions: number;
  earned_rupees: number;
  paid_rupees: number;
  pending_rupees: number;
}

export interface ListReferrersResponse {
  referrers: Referrer[];
  total: number;
  page: number;
  pageSize: number;
}

export const listReferrers = (page = 1, pageSize = 25, search = '') => {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) q.set('search', search);
  return request<ListReferrersResponse>('GET', `/api/admin/referrers?${q}`);
};

/**
 * Updates only the fields passed.
 *
 * Blocking stops new referrals being credited; it does not claw back rewards
 * already earned, which is why it is separate from rejecting them.
 */
export const updateReferrer = (
  id: string,
  patch: { upi_id?: string; pan?: string; notes?: string; is_blocked?: boolean },
) => request<{ success: boolean }>('PATCH', `/api/admin/referrers/${id}`, patch);

export interface Referral {
  id: string;
  code: string;
  referrer_name: string;
  referrer_email: string;
  /** Repeated on the reward so the payout run does not need the referrer list. */
  referrer_upi: string;
  friend_name: string;
  friend_email: string;
  /** course | certification */
  kind: string;
  item_name: string;
  order_rupees: number;
  discount_rupees: number;
  reward_rupees: number;
  /** pending | approved | paid | rejected | reversed */
  status: string;
  /** Why the backend thinks a human should look: self-referral, duplicates, … */
  flags: string;
  /** The reason recorded when it was rejected. */
  reason: string;
  approved_by: string;
  /** UTR or transaction id captured when the money was sent. */
  payout_ref: string;
  created_at: string;
  paid_at?: string;
}

export interface ReferralFilters {
  status?: string;
  kind?: string;
  /** A referrer's code — how the referrer list deep-links into this screen. */
  code?: string;
  /** 'true' to show only the rewards the backend has flagged. */
  flagged?: string;
  search?: string;
}

export interface ListReferralsResponse {
  referrals: Referral[];
  total: number;
  page: number;
  pageSize: number;
  /** Approved but unpaid, across everything matching the filters — not just this page. */
  owedRupees: number;
}

export const listReferrals = (page = 1, pageSize = 25, f: ReferralFilters = {}) => {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...cleanFilters(f) });
  return request<ListReferralsResponse>('GET', `/api/admin/referrals?${q}`);
};

/** The payout sheet: the same rows the screen is filtered to, with UPI ids. */
export const exportReferralsCsv = (f: ReferralFilters = {}) =>
  downloadAuthed(
    `/api/admin/referrals/export.csv?${new URLSearchParams(cleanFilters(f))}`,
    `referral-payouts-${new Date().toISOString().slice(0, 10)}.csv`,
  );

/** approve → owed, pay → sent, reject → never owed, reopen → back to pending. */
export type ReferralAction = 'approve' | 'reject' | 'pay' | 'reopen';

/**
 * Moves one reward along.
 *
 * The backend guards the order — only a pending reward can be approved and only
 * an approved one can be paid — so the buttons mirror that rather than relying
 * on it. A rejection must carry a reason and a payout must carry its reference:
 * both are what somebody is asked about months later.
 */
export const updateReferral = (
  id: string,
  patch: { action: ReferralAction; reason?: string; payout_ref?: string },
) => request<{ success: boolean }>('PATCH', `/api/admin/referrals/${id}`, patch);

/**
 * The same three moves over a selection — this is the weekly payout run.
 *
 * Ids only: there is no "all matching" mode here, because paying rows nobody
 * has looked at is exactly what the flags exist to prevent.
 */
export const bulkReferrals = (
  ids: string[],
  action: 'approve' | 'reject' | 'pay',
  opts: { reason?: string; payout_ref?: string } = {},
) => request<{ success: boolean; updated: number }>('POST', '/api/admin/referrals/bulk', {
  ids,
  action,
  ...opts,
});

// ─── Password reset (public) ─────────────────────────────────────────────────
//
// Both endpoints are deliberately unauthenticated: somebody locked out cannot
// present a token to ask for a way back in. The server answers identically for
// a known and an unknown address, so the UI must never report "no such user".

export const requestPasswordReset = async (email: string): Promise<{ code_required: boolean }> => {
  const resp = await fetch('/api/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Could not start the reset.');
  return { code_required: data.code_required !== false };
};

export const confirmPasswordReset = async (email: string, code: string, newPassword: string): Promise<void> => {
  const resp = await fetch('/api/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, new_password: newPassword }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Could not update the password.');
};
