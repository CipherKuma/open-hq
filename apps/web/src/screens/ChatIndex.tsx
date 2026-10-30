import { Navigate } from "react-router-dom";
import { useChannels } from "../lib/queries";
import { useIsDesktop } from "../lib/useMedia";
import { ChannelLinks, chatPath } from "../layout/Rail";
import { ErrorState, LoadingBlock } from "../components/States";

// Desktop: the rail already lists channels, so jump to the most relevant thread. Mobile: the list is the page.
export function ChatIndex() {
  const q = useChannels();
  const desktop = useIsDesktop();
  if (q.isPending) return <div className="page"><LoadingBlock rows={6} label="Loading chats" /></div>;
  if (q.isError) return <div className="page"><ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load your chats" /></div>;
  if (desktop) {
    const first = q.data.find((c) => c.unread > 0 && c.kind !== "backroom") ?? q.data.find((c) => c.id === "dm:cos") ?? q.data[0];
    if (first) return <Navigate to={chatPath(first.id)} replace />;
  }
  return (
    <div className="page chat-index">
      <div className="stack tight"><span className="eyebrow lamp">Chat</span><h1>Your agents</h1></div>
      <div className="chat-index-list rail-scroll">
        <ChannelLinks channels={q.data} />
      </div>
    </div>
  );
}
