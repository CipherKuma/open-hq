import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentId, Channel } from "@open-hq/shared";
import { AGENTS } from "@open-hq/shared";
import { api } from "../../api";
import { qk } from "../../lib/queries";
import { AGENT_ORDER } from "../../lib/agents";
import { Mark } from "../../components/Mark";
import { errorText } from "../../components/States";

export function NewGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [agents, setAgents] = useState<AgentId[]>(["cos"]);
  const qc = useQueryClient();
  const nav = useNavigate();
  const create = useMutation({
    mutationFn: () => api.createGroup(name.trim(), agents),
    onSuccess: (ch) => {
      qc.setQueryData<Channel[]>(qk.channels, (old) => (old ? [...old.filter((c) => c.id !== ch.id), ch] : old));
      void qc.invalidateQueries({ queryKey: qk.channels });
      onClose();
      setName("");
      nav(`/chat/${encodeURIComponent(ch.id)}`);
    },
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const toggle = (a: AgentId) => setAgents((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));
  const valid = name.trim().length > 0 && name.trim().length <= 60 && agents.length > 0;

  return (
    <dialog ref={ref} className="dlg" onClose={onClose} aria-labelledby="ng-h">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
        <div className="dlg-body">
          <div className="stack tight">
            <h2 id="ng-h">New group</h2>
            <p className="small dim">A group is for one goal, like a launch. Add the agents it needs; they'll answer when you @mention them.</p>
          </div>
          <label className="field">Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="launch-week" maxLength={60} autoFocus required />
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ marginBottom: 6 }}>Agents</legend>
            <div className="chips">
              {AGENT_ORDER.map((a) => (
                <label key={a} className="check">
                  <input type="checkbox" checked={agents.includes(a)} onChange={() => toggle(a)} />
                  <Mark id={a} size="xs" />{AGENTS[a].name}
                </label>
              ))}
            </div>
          </fieldset>
          {create.isError ? <div className="notice bad" role="alert">{errorText(create.error)}</div> : null}
        </div>
        <div className="dlg-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!valid || create.isPending}>{create.isPending ? <span className="spin" /> : null}Create group</button>
        </div>
      </form>
    </dialog>
  );
}
