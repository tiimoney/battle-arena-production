import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import { LeagueDataProvider } from "./state/LeagueDataContext";
import { AuthScreen } from "./screens/AuthScreen";
import { TeamAssignmentScreen } from "./screens/TeamAssignmentScreen";
import { CompetitorHomeScreen } from "./screens/CompetitorHomeScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { GroupsScreen } from "./screens/GroupsScreen";
import { FixturesScreen } from "./screens/FixturesScreen";
import { MatchHistoryScreen } from "./screens/MatchHistoryScreen";
import { ArchivedSeasonsScreen } from "./screens/ArchivedSeasonsScreen";
import { UserManagementScreen } from "./screens/UserManagementScreen";
import { SupportInboxScreen } from "./screens/SupportInboxScreen";
import { StandingsScreen } from "./screens/StandingsScreen";

function LoadingScreen({ label }: { label: string }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div className="spinner" style={{ borderTopColor: "var(--color-primary)", borderColor: "var(--color-outline-variant)" }} />
      <span>{label}</span>
    </div>
  );
}

// Ports _AppGate from lib/app.dart exactly:
//   loading session -> loading
//   not authenticated -> AuthScreen
//   competitor with no team -> TeamAssignmentScreen (admin-only assignment, no self-service picker)
//   admin -> 5-section admin shell
//   competitor with a team -> CompetitorHomeScreen
export default function App() {
  const { profile, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen label="Checking session..." />;
  }

  if (!profile) {
    return <AuthScreen />;
  }

  return (
    <LeagueDataProvider>
      <Gate />
    </LeagueDataProvider>
  );
}

function Gate() {
  const { profile } = useAuth();
  if (!profile) return null;

  if (profile.role === "competitor" && !profile.teamId) {
    return <TeamAssignmentScreen />;
  }

  return (
    <Routes>
      <Route path="/standings" element={<StandingsScreen />} />
      {profile.role === "admin" ? (
        <>
          <Route path="/admin" element={<DashboardScreen />} />
          <Route path="/admin/groups" element={<GroupsScreen />} />
          <Route path="/admin/fixtures" element={<FixturesScreen />} />
          <Route path="/admin/matches" element={<MatchHistoryScreen />} />
          <Route path="/admin/archives" element={<ArchivedSeasonsScreen />} />
          <Route path="/admin/users" element={<UserManagementScreen />} />
          <Route path="/admin/support" element={<SupportInboxScreen />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<CompetitorHomeScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
