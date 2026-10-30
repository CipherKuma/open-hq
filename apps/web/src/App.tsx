import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useEffect } from "react";
import { Shell } from "./layout/Shell";
import { Tonight } from "./screens/Tonight";
import { ChatIndex } from "./screens/ChatIndex";
import { Thread } from "./screens/Thread";
import { Decisions } from "./screens/Decisions";
import { ProductScreen } from "./screens/Product";
import { AgentScreen } from "./screens/Agent";
import { Connections } from "./screens/Connections";
import { ScheduleScreen } from "./screens/Schedule";
import { Activity } from "./screens/Activity";
import { Welcome } from "./screens/Welcome";
import { Empty } from "./components/States";
import { useWorkspace } from "./lib/queries";
import { setTimezone } from "./lib/time";
import { isAgent } from "./lib/agents";

function AgentRoute() {
  const { id = "" } = useParams();
  if (!isAgent(id)) return <div className="page"><Empty title="No agent by that name" icon="user">Open HQ has five agents: Chief of Staff, Revenue, Support, Ship and Scout.</Empty></div>;
  return <AgentScreen id={id} />;
}

export function App() {
  const ws = useWorkspace();
  useEffect(() => { if (ws.data) setTimezone(ws.data.schedule.timezone); }, [ws.data]);
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route element={<Shell />}>
        <Route index element={<Tonight />} />
        <Route path="chat" element={<ChatIndex />} />
        <Route path="chat/:channelId" element={<Thread />} />
        <Route path="decisions" element={<Decisions />} />
        <Route path="products/:id" element={<ProductScreen />} />
        <Route path="agents/:id" element={<AgentRoute />} />
        <Route path="connections" element={<Connections />} />
        <Route path="schedule" element={<ScheduleScreen />} />
        <Route path="activity" element={<Activity />} />
        <Route path="tonight" element={<Navigate to="/" replace />} />
        <Route path="*" element={<div className="page"><Empty title="Nothing here" icon="room">That page doesn't exist. Tonight's handover is on the home screen.</Empty></div>} />
      </Route>
    </Routes>
  );
}
