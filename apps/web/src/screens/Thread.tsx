import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentId, Channel } from "@open-hq/shared";
import { AGENTS } from "@open-hq/shared";
import { api } from "../api";
import { markRead, qk, useChannels, useMessages } from "../lib/queries";
import { useAgentStatus, useLive } from "../live/LiveProvider";
import { Icon } from "../components/Icon";
import { Mark, Marks } from "../components/Mark";
import { Empty, ErrorState, LoadingBlock } from "../components/States";
import { agentName, isAgent } from "../lib/agents";
import { dayKey, fmtDay } from "../lib/time";
import { MessageItem, type UiMessage } from "./chat/MessageItem";
import { Composer } from "./chat/Composer";

function ThreadHeader({ ch }: { ch: Channel }) {
  const agents = ch.members.filter(isAgent);
  const statusOf = useAgentStatus();
  const dmAgent = ch.kind === "dm" ? agents[0] : null;
  return (
    <header className="thread-h">
      <Link to="/chat" className="btn ghost icon thread-back" aria-label="All chats"><Icon name="back" /></Link>
      {dmAgent ? <Mark id={dmAgent} status={statusOf(dmAgent)} /> : ch.kind === "group" ? <span className="thread-hash">#</span> : <Icon name="room" className="ico thread-room" />}
      <div className="grow">
        <h1 className="thread-title ellipsis">{ch.kind === "backroom" ? ch.name : ch.kind === "group" ? ch.name : agentName(dmAgent ?? "")}</h1>
        <div className="thread-sub ellipsis">
          {dmAgent ? AGENTS[dmAgent].job : ch.kind === "group" ? `You, ${agents.map(agentName).join(", ")}` : `Back room · ${agents.map(agentName).join(" ↔ ")}`}
        </div>
      </div>
      {dmAgent ? <Link to={`/agents/${dmAgent}`} className="btn sm">Profile</Link> : <Marks ids={agents} />}
    </header>
  );
}

function Working({ agents }: { agents: AgentId[] }) {
  const statusOf = useAgentStatus();
  const busy = agents.filter((a) => statusOf(a) === "working");
  if (!busy.length) return <div className="working" aria-live="polite" />;
  return (
    <div className="working on" aria-live="polite">
      <Marks ids={busy} size="xs" />
      <span>{busy.map(agentName).join(", ")} {busy.length > 1 ? "are" : "is"} working</span>
      <span className="dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

export function Thread() {
  const { channelId = "" } = useParams();
  const channels = useChannels();
  const msgs = useMessages(channelId);
  const qc = useQueryClient();
  const { setOpenChannel } = useLive();
  const endRef = useRef<HTMLDivElement>(null);
  const ch = channels.data?.find((c) => c.id === channelId);

  useEffect(() => {
    setOpenChannel(channelId);
    markRead(qc, channelId);
    return () => setOpenChannel(null);
  }, [channelId, qc, setOpenChannel]);

  const send = useMutation({
    mutationFn: ({ text }: { text: string; tmpId: string }) => api.postMessage(channelId, text),
    onMutate: ({ text, tmpId }) => {
      const tmp: UiMessage = { id: tmpId, channelId, author: "you", text, createdAt: new Date().toISOString(), heldDuringWork: false, level: null, proposalId: null, mentions: [], refs: [], pending: true };
      qc.setQueryData<UiMessage[]>(qk.messages(channelId), (old) => [...(old ?? []).filter((m) => !(m.failed && m.text === text)), tmp]);
    },
    onSuccess: (m, { tmpId }) => qc.setQueryData<UiMessage[]>(qk.messages(channelId), (old) => {
      const rest = (old ?? []).filter((x) => x.id !== tmpId);
      return rest.some((x) => x.id === m.id) ? rest : [...rest, m];
    }),
    onError: (_e, { tmpId }) => qc.setQueryData<UiMessage[]>(qk.messages(channelId), (old) => old?.map((x) => (x.id === tmpId ? { ...x, pending: false, failed: true } : x))),
  });
  const post = (text: string) => send.mutate({ text, tmpId: `tmp_${Date.now()}` });

  const count = msgs.data?.length ?? 0;
  useLayoutEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [count, channelId]);

  if (channels.isPending) return <div className="page"><LoadingBlock rows={5} /></div>;
  if (channels.isError) return <div className="page"><ErrorState error={channels.error} onRetry={() => void channels.refetch()} /></div>;
  if (!ch) return <div className="page"><Empty title="This chat doesn't exist" icon="chat">It may have been an old back-room thread. Pick another chat from the list.</Empty></div>;

  const agents = ch.members.filter(isAgent);
  const list = (msgs.data ?? []) as UiMessage[];
  const firstHeld = list.findIndex((m) => m.heldDuringWork);
  let heldRun = 0;
  for (let i = Math.max(0, firstHeld); firstHeld >= 0 && i < list.length && list[i].heldDuringWork; i++) heldRun++;
  const heldTotal = list.filter((m) => m.heldDuringWork).length;

  return (
    <div className="thread">
      <ThreadHeader ch={ch} />
      <div className="thread-scroll">
        {ch.kind === "backroom" ? (
          <div className="notice lamp backroom-banner"><Icon name="eye" /><span><b>Agents talk here.</b> You can read every message, and none of it ever notifies you. Threads stop after 6 messages and go to the Chief of Staff. To weigh in, message an agent directly.</span></div>
        ) : null}
        {msgs.isPending ? <LoadingBlock rows={4} label="Loading messages" /> : msgs.isError ? (
          <ErrorState error={msgs.error} onRetry={() => void msgs.refetch()} title="Couldn't load messages" compact />
        ) : list.length === 0 ? (
          <Empty compact title="No messages yet" icon="chat">{ch.kind === "backroom" ? "The agents haven't said anything here yet." : `Say hello. ${agents.length > 1 ? "Use @ to address one agent." : `${agentName(agents[0] ?? "")} answers within a few seconds.`}`}</Empty>
        ) : (
          <ol className="msgs">
            {list.map((m, i) => {
              const newDay = i === 0 || dayKey(list[i - 1].createdAt) !== dayKey(m.createdAt);
              return (
                <Fragment key={m.id}>
                  {newDay ? <li className="daysep" aria-hidden="true"><span>{dayKey(m.createdAt) === dayKey(new Date().toISOString()) ? "Today" : fmtDay(m.createdAt)}</span></li> : null}
                  {i === firstHeld ? <li className="held"><span>Held while you were at work · {heldTotal} message{heldTotal === 1 ? "" : "s"}</span></li> : null}
                  <MessageItem m={m} onRetry={(x) => post(x.text)} />
                  {firstHeld >= 0 && i === firstHeld + heldRun - 1 && i < list.length - 1 ? <li className="held end" aria-hidden="true" /> : null}
                </Fragment>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </div>
      <Working agents={agents} />
      {ch.kind === "backroom" ? (
        <div className="readonly-bar"><Icon name="lock" />Read-only for you. Agents can't approve anything here; only you approve.</div>
      ) : (
        <Composer members={agents} placeholder={ch.kind === "dm" ? `Message ${agentName(agents[0] ?? "")}` : `Message #${ch.name}`} onSend={post} />
      )}
    </div>
  );
}

