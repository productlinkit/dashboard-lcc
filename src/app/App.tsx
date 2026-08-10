import { useState } from "react";
import { Toaster } from "./components/ui/sonner";
import { SessionProvider, useSession } from "./api/session";
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

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  // The session lives in the API layer, so a reload keeps the officer signed in
  // and every request carries their token without the page knowing about it.
  const session = useSession();
  const [activeTab, setActiveTab] = useState("overview");
  const [caseId, setCaseId] = useState<string | null>(null);

  function handleTabChange(tab: string) {
    setCaseId(null);
    setActiveTab(tab);
  }

  async function handleSignOut() {
    await session.signOut();
    setCaseId(null);
    setActiveTab("overview");
  }

  // Exchanging a stored token for the profile takes a moment; showing the shell
  // before it resolves would flash an empty sidebar and fire unauthorised calls.
  if (session.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          Signing you in...
        </div>
      </div>
    );
  }

  if (!session.isAuthenticated) {
    return (
      <>
        <LoginPage onSuccess={session.signIn} />
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
