import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { BrowsePage } from './pages/BrowsePage';
import { PartDetailPage } from './pages/PartDetailPage';
import { VisitPage } from './pages/VisitPage';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { StaffSearchPage } from './pages/StaffSearchPage';
import { StaffUsersPage } from './pages/StaffUsersPage';
import { StaffReportsPage } from './pages/StaffReportsPage';
import { StaffIngestPage } from './pages/StaffIngestPage';
import { StaffIngestReviewPage } from './pages/StaffIngestReviewPage';
import { ProtectedRoute } from './auth/ProtectedRoute';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/parts/:id" element={<PartDetailPage />} />
        <Route path="/visit" element={<VisitPage />} />
        <Route path="/staff/login" element={<StaffLoginPage />} />
        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffSearchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/ingest"
          element={
            <ProtectedRoute>
              <StaffIngestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/ingest/:runId"
          element={
            <ProtectedRoute>
              <StaffIngestReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/users"
          element={
            <ProtectedRoute role="ADMIN">
              <StaffUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/reports"
          element={
            <ProtectedRoute role="ADMIN">
              <StaffReportsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Layout>
  );
}
