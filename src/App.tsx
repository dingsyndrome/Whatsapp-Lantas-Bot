import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { DashboardWithCollapsibleSidebar } from '@/components/ui/dashboard-with-collapsible-sidebar';
import { DashboardPage } from '@/src/pages/dashboard';
import { TimemarkPage } from '@/src/pages/timemark';
import { SprinPage } from '@/src/pages/sprin';
import { LinksPage } from '@/src/pages/links';
import { SettingsPage } from '@/src/pages/settings';
import { useTheme } from '@/src/lib/theme';

function NotFoundPage() {
  return <Navigate to="/" replace />;
}

export default function App() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <>
      <DashboardWithCollapsibleSidebar isDark={isDark} onToggleTheme={toggleTheme}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/timemark" element={<TimemarkPage />} />
          <Route path="/sprin" element={<SprinPage />} />
          <Route path="/links" element={<LinksPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </DashboardWithCollapsibleSidebar>
      <Toaster
        theme={isDark ? 'dark' : 'light'}
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          className: 'rounded-xl border border-border bg-card text-card-foreground shadow-2xl',
          duration: 4200
        }}
      />
    </>
  );
}
