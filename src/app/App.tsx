import { useState } from "react";
import { Toaster } from "./components/ui/sonner";
import { DashboardLayout } from "./components/DashboardLayout";
import { OverviewPage } from "./pages/OverviewPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { CaseDetailPage } from "./pages/CaseDetailPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
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
            {activeTab === "citizens" && (
              <PlaceholderPage
                title="Citizens"
                description="Search the civil registry, view citizen profiles, and link records across services. Coming next."
              />
            )}
            {activeTab === "reports" && (
              <PlaceholderPage
                title="Reports"
                description="Generate registration statistics, revenue summaries, and exportable reports by province and period."
              />
            )}
            {activeTab === "settings" && (
              <PlaceholderPage
                title="Settings"
                description="Manage staff accounts, roles, offices, fees, and service configuration."
              />
            )}
          </>
        )}
      </DashboardLayout>
      <Toaster position="top-right" richColors />
    </>
  );
}
