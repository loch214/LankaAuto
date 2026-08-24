import { Route, Routes } from 'react-router-dom';
import { BrowsePage } from './pages/BrowsePage';
import { PartDetailPage } from './pages/PartDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BrowsePage />} />
      <Route path="/parts/:id" element={<PartDetailPage />} />
    </Routes>
  );
}
