import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { isAdmin, isStaff, homePath } from './lib/auth';
import { loadCourses } from './lib/courses';
import Login from './pages/Login';

// Every screen but login is loaded on first visit, so an admin opening the
// panel downloads only the page in front of them — the spreadsheet library
// behind the import screens included.
const UserList = React.lazy(() => import('./pages/Users/UserList'));
const BulkImport = React.lazy(() => import('./pages/Import/BulkImport'));
const TestList = React.lazy(() => import('./pages/Tests/TestList'));
const TestEditor = React.lazy(() => import('./pages/Tests/TestEditor'));
const McqList = React.lazy(() => import('./pages/McqBank/McqList'));
const InquiryList = React.lazy(() => import('./pages/Inquiries/InquiryList'));
const ApplicationList = React.lazy(() => import('./pages/Scholarship/ApplicationList'));
const ProgramList = React.lazy(() => import('./pages/Scholarship/ProgramList'));
const Results = React.lazy(() => import('./pages/Results/AttemptList'));
const ClassList = React.lazy(() => import('./pages/Classes/ClassList'));
const Dashboard = React.lazy(() => import('./pages/Dashboard/Dashboard'));
const AttemptDetail = React.lazy(() => import('./pages/Results/AttemptDetail'));
const AuditLog = React.lazy(() => import('./pages/Audit/AuditLog'));
const ProblemList = React.lazy(() => import('./pages/Problems/ProblemList'));
const EnrollmentList = React.lazy(() => import('./pages/Enrollments/EnrollmentList'));
const ProblemEditor = React.lazy(() => import('./pages/Problems/ProblemEditor'));
const CompanyList = React.lazy(() => import('./pages/Companies/CompanyList'));
const ExamList = React.lazy(() => import('./pages/Certifications/ExamList'));
const RegistrationList = React.lazy(() => import('./pages/Certifications/RegistrationList'));
const RewardList = React.lazy(() => import('./pages/Referrals/RewardList'));
const ReferrerList = React.lazy(() => import('./pages/Referrals/ReferrerList'));
const ProgramSettings = React.lazy(() => import('./pages/Referrals/ProgramSettings'));

// A recruiter who follows a link to an admin-only screen goes to their home
// (the tests list) rather than the login page they are already past.
const RequireAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) =>
  isAdmin() ? children : <Navigate to={isStaff() ? homePath() : '/login'} replace />;

// Screens recruiters share with admins. The backend scopes every call on them
// to the recruiter's company.
const RequireStaff: React.FC<{ children: React.ReactElement }> = ({ children }) =>
  isStaff() ? children : <Navigate to="/login" replace />;

const App: React.FC = () => {
  React.useEffect(() => {
    if (isStaff()) loadCourses();
  }, []);

  return (
  <React.Suspense fallback={null}>
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/dashboard" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
    <Route path="/audit" element={<RequireAdmin><AuditLog /></RequireAdmin>} />
    <Route path="/users" element={<RequireAdmin><UserList /></RequireAdmin>} />
    <Route path="/import" element={<RequireAdmin><BulkImport /></RequireAdmin>} />
    <Route path="/tests" element={<RequireStaff><TestList /></RequireStaff>} />
    <Route path="/tests/:id" element={<RequireStaff><TestEditor /></RequireStaff>} />
    <Route path="/tests/:id/results" element={<RequireStaff><Results /></RequireStaff>} />
    <Route path="/tests/:id/results/:attemptId" element={<RequireStaff><AttemptDetail /></RequireStaff>} />
    <Route path="/problems" element={<RequireAdmin><ProblemList /></RequireAdmin>} />
    <Route path="/problems/:id" element={<RequireAdmin><ProblemEditor /></RequireAdmin>} />
    <Route path="/mcq-bank" element={<RequireStaff><McqList /></RequireStaff>} />
    <Route path="/enrollments" element={<RequireAdmin><EnrollmentList /></RequireAdmin>} />
    <Route path="/enquiries" element={<RequireAdmin><InquiryList /></RequireAdmin>} />
    <Route path="/scholarship" element={<RequireAdmin><ApplicationList /></RequireAdmin>} />
    <Route path="/scholarship/programmes" element={<RequireAdmin><ProgramList /></RequireAdmin>} />
    <Route path="/certifications" element={<RequireAdmin><RegistrationList /></RequireAdmin>} />
    <Route path="/certifications/exams" element={<RequireAdmin><ExamList /></RequireAdmin>} />
    <Route path="/referrals" element={<RequireAdmin><RewardList /></RequireAdmin>} />
    <Route path="/referrals/referrers" element={<RequireAdmin><ReferrerList /></RequireAdmin>} />
    <Route path="/referrals/settings" element={<RequireAdmin><ProgramSettings /></RequireAdmin>} />
    <Route path="/classes" element={<RequireAdmin><ClassList /></RequireAdmin>} />
    <Route path="/companies" element={<RequireAdmin><CompanyList /></RequireAdmin>} />
    <Route path="*" element={<Navigate to={isStaff() ? homePath() : '/login'} replace />} />
  </Routes>
  </React.Suspense>
  );
};

export default App;
