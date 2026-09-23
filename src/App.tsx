import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { isAdmin } from './lib/auth';
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
import ProblemEditor from './pages/Problems/ProblemEditor';

const RequireAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) =>
  isAdmin() ? children : <Navigate to="/login" replace />;

const App: React.FC = () => {
  React.useEffect(() => {
    if (isAdmin()) loadCourses();
  }, []);

  return (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/dashboard" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
    <Route path="/audit" element={<RequireAdmin><AuditLog /></RequireAdmin>} />
    <Route path="/users" element={<RequireAdmin><UserList /></RequireAdmin>} />
    <Route path="/import" element={<RequireAdmin><BulkImport /></RequireAdmin>} />
    <Route path="/tests" element={<RequireAdmin><TestList /></RequireAdmin>} />
    <Route path="/tests/:id" element={<RequireAdmin><TestEditor /></RequireAdmin>} />
    <Route path="/tests/:id/results" element={<RequireAdmin><Results /></RequireAdmin>} />
    <Route path="/tests/:id/results/:attemptId" element={<RequireAdmin><AttemptDetail /></RequireAdmin>} />
    <Route path="/problems" element={<RequireAdmin><ProblemList /></RequireAdmin>} />
    <Route path="/problems/:id" element={<RequireAdmin><ProblemEditor /></RequireAdmin>} />
    <Route path="/mcq-bank" element={<RequireAdmin><McqList /></RequireAdmin>} />
    <Route path="/enquiries" element={<RequireAdmin><InquiryList /></RequireAdmin>} />
    <Route path="/scholarship" element={<RequireAdmin><ApplicationList /></RequireAdmin>} />
    <Route path="/scholarship/programmes" element={<RequireAdmin><ProgramList /></RequireAdmin>} />
    <Route path="/classes" element={<RequireAdmin><ClassList /></RequireAdmin>} />
    <Route path="*" element={<Navigate to={isAdmin() ? '/dashboard' : '/login'} replace />} />
  </Routes>
  );
};

export default App;
