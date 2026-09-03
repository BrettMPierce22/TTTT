import { supabase } from "../../lib/supabaseClient";
import OrganizerInsights from "./OrganizerInsights";
import { fetchOrganizerReportData } from "./reportData";

const loadData = (request) => fetchOrganizerReportData(supabase, request);

export default function LeagueOrganizerReports({ league, isAdmin }) {
  return <OrganizerInsights league={league} isAdmin={isAdmin} loadData={loadData} />;
}
