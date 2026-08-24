import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { BrowsePage } from './pages/BrowsePage';
import { PartDetailPage } from './pages/PartDetailPage';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { StaffSearchPage } from './pages/StaffSearchPage';
import { ProtectedRoute } from './auth/ProtectedRoute';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/parts/:id" element={<PartDetailPage />} />
        <Route path="/staff/login" element={<StaffLoginPage />} />
        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffSearchPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Layout>
  );
}
