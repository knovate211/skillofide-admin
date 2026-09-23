// Thin REST client for the admin + recruiter endpoints on the api-gateway.
// Every request carries the admin Bearer token. A 401 clears the session and
// bounces to /login.
import { getToken, logout } from './auth';

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
}

export const getStats = () => request<AdminStats>('GET', '/api/admin/stats');

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
  title: string;
  description?: string;
  purpose?: string; // practice | hiring | scholarship
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

export const listAssessments = (params = '') =>
  request<{ assessments: Assessment[]; total: number }>(
    'GET',
    `/api/recruiter/assessments${params ? `?${params}` : ''}`,
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
  const data = await graphql<{ listProblems: { problems: ProblemSummary[] } }>(
    `query($pageSize: Int){ listProblems(pageSize: $pageSize){ problems { id title difficulty } } }`,
    { pageSize: 300 },
  );
  const all = data.listProblems?.problems || [];
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
    `/api/recruiter/mcq-bank${params ? `?${params}` : ''}`,
  );

/** Selects questions with no course in listMcq / getMcqFacets. */
export const GENERAL_COURSE = '__general';

export const getMcqFacets = (course = '') =>
  request<{ course: Facet[]; topic: Facet[]; difficulty: Facet[] }>(
    'GET',
    `/api/admin/mcq-bank/facets${course ? `?course=${encodeURIComponent(course)}` : ''}`,
  );

export const upsertMcq = (q: McqQuestion) =>
  request<{ id: string }>('POST', '/api/recruiter/mcq-bank', q);

export const deleteMcq = (id: string) =>
  request<unknown>('DELETE', `/api/recruiter/mcq-bank/${id}`);

export const importMcq = (questions: McqQuestion[]) =>
  request<{ imported: number }>('POST', '/api/recruiter/mcq-bank/import', {
    questions,
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
