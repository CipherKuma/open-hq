import { useRef, useState, type KeyboardEvent } from "react";
import type { AgentId } from "@open-hq/shared";
import { AGENTS } from "@open-hq/shared";
import { Icon } from "../../components/Icon";
import { Mark } from "../../components/Mark";

// Enter sends, Shift+Enter adds a line. Typing "@" offers the agents in this channel.
export function Composer({ members, placeholder, onSend }: { members: AgentId[]; placeholder: string; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const mention = /(^|\s)@(\w*)$/.exec(text.slice(0, ref.current?.selectionStart ?? text.length));
  const options = mention ? members.filter((a) => a.startsWith(mention[2].toLowerCase()) || AGENTS[a].name.toLowerCase().startsWith(mention[2].toLowerCase())) : [];

  const pick = (a: AgentId) => {
    const pos = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@(\w*)$/, `@${a} `);
    setText(before + text.slice(pos));
    setSel(0);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(before.length, before.length); });
  };
  const send = () => {
    const t = text.trim();
    if (!t || t.length > 4000) return;
    onSend(t);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (options.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % options.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + options.length) % options.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(options[Math.min(sel, options.length - 1)]); return; }
      if (e.key === "Escape") { setText((t) => `${t} `); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  return (
    <div className="composer">
      {options.length ? (
        <ul className="mention-menu" role="listbox" aria-label="Mention an agent">
          {options.map((a, i) => (
            <li key={a} role="option" aria-selected={i === sel}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(a); }}><Mark id={a} size="xs" />{AGENTS[a].name}<span className="mono tiny muted">@{a}</span></button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="composer-box">
        <label htmlFor="composer" className="sr-only">Message</label>
        <textarea
          id="composer" ref={ref} className="composer-input" rows={1} value={text} maxLength={4000}
          placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
          style={{ height: `${Math.min(160, 22 * Math.max(1, text.split("\n").length) + 18)}px` }}
        />
        <button type="button" className="btn primary icon composer-send" onClick={send} disabled={!text.trim()} aria-label="Send"><Icon name="send" /></button>
      </div>
      <div className="composer-hint mono tiny muted">Enter to send · Shift+Enter for a new line · @ to mention</div>
    </div>
  );
}
