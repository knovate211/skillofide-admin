import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { isAdmin, isStaff, homePath } from './lib/auth';
import { loadCourses } from './lib/courses';
import Login from './pages/Login';
import UserList from './pages/Users/UserList';
import BulkImport from './pages/Import/BulkImport';
import TestList from './pages/Tests/TestList';
import TestEditor from './pages/Tests/TestEditor';
import McqList from './pages/McqBank/McqList';
import InquiryList from './pages/Inquiries/InquiryList';
import ApplicationList from './pages/Scholarship/ApplicationList';
import ProgramList from './pages/Scholarship/ProgramList';
import Results from './pages/Results/AttemptList';
import ClassList from './pages/Classes/ClassList';
import Dashboard from './pages/Dashboard/Dashboard';
import AttemptDetail from './pages/Results/AttemptDetail';
import AuditLog from './pages/Audit/AuditLog';
import ProblemList from './pages/Problems/ProblemList';
import EnrollmentList from './pages/Enrollments/EnrollmentList';
import ProblemEditor from './pages/Problems/ProblemEditor';
import CompanyList from './pages/Companies/CompanyList';

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
    <Route path="/classes" element={<RequireAdmin><ClassList /></RequireAdmin>} />
    <Route path="/companies" element={<RequireAdmin><CompanyList /></RequireAdmin>} />
    <Route path="*" element={<Navigate to={isStaff() ? homePath() : '/login'} replace />} />
  </Routes>
  );
};

export default App;
