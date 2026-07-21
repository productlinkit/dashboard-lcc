import { useState } from "react";
import { Toaster } from "./components/ui/sonner";
import { DashboardLayout } from "./components/DashboardLayout";
import { OverviewPage } from "./pages/OverviewPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { CaseDetailPage } from "./pages/CaseDetailPage";
import { ApprovalQueuePage } from "./pages/ApprovalQueuePage";
import { CivilRegistrationPage } from "./pages/CivilRegistrationPage";
import { PopulationPage } from "./pages/PopulationPage";
import { WatchlistPage } from "./pages/WatchlistPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { GisMapPage } from "./pages/GisMapPage";
import { LoginPage } from "./pages/LoginPage";

const AUTH_KEY = "lcc-authed";

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(AUTH_KEY) === "1");
  const [activeTab, setActiveTab] = useState("overview");
  const [caseId, setCaseId] = useState<string | null>(null);

  function handleTabChange(tab: string) {
    setCaseId(null);
    setActiveTab(tab);
  }

  function handleLogin() {
    localStorage.setItem(AUTH_KEY, "1");
    setAuthed(true);
  }

  function handleSignOut() {
    localStorage.removeItem(AUTH_KEY);
    setCaseId(null);
    setActiveTab("overview");
    setAuthed(false);
  }

  if (!authed) {
    return (
      <>
        <LoginPage onSuccess={handleLogin} />
        <Toaster position="top-right" richColors />
      </>
    );
  }

  return (
    <>
      <DashboardLayout activeTab={activeTab} onTabChange={handleTabChange} onSignOut={handleSignOut}>
        {caseId ? (
          <CaseDetailPage key={caseId} caseId={caseId} onBack={() => setCaseId(null)} />
        ) : (
          <>
            {activeTab === "overview" && <OverviewPage onOpenCase={setCaseId} />}
            {activeTab === "applications" && <ApplicationsPage onOpenCase={setCaseId} />}
            {activeTab === "approval-queue" && <ApprovalQueuePage onOpenCase={setCaseId} />}
            {activeTab === "civil-registration" && <CivilRegistrationPage onOpenCase={setCaseId} />}
            {activeTab === "population" && <PopulationPage />}
            {activeTab === "watchlist" && <WatchlistPage />}
            {activeTab === "payments" && <PaymentsPage />}
            {activeTab === "reports" && <ReportsPage />}
            {activeTab === "gis-map" && <GisMapPage />}
            {activeTab === "alerts" && <AlertsPage onOpenCase={setCaseId} />}
            {activeTab === "settings" && <SettingsPage />}
          </>
        )}
      </DashboardLayout>
      <Toaster position="top-right" richColors />
    </>
  );
}
