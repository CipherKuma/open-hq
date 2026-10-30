import { Fragment, type ReactNode } from "react";
import { isAgent, agentName } from "../lib/agents";

// markdown-lite: **bold**, `code`, [label](url), bare https links, @agent mentions. No HTML is ever injected.
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+|@(?:cos|revenue|support|ship|scout)\b)/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const tok = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      out.push(<a key={k} href={mm?.[2]} target="_blank" rel="noreferrer">{mm?.[1]}</a>);
    } else if (tok.startsWith("@")) {
      const id = tok.slice(1);
      out.push(isAgent(id) ? <span key={k} className={`mention ${id}`}>@{agentName(id)}</span> : tok);
    } else out.push(<a key={k} href={tok} target="_blank" rel="noreferrer">{tok.replace(/^https?:\/\//, "")}</a>);
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const paras = text.split(/\n{2,}/);
  return (
    <div className={`rich ${className ?? ""}`}>
      {paras.map((p, pi) => (
        <p key={pi}>
          {p.split("\n").map((line, li) => (
            <Fragment key={li}>{li > 0 ? <br /> : null}{inline(line, `${pi}-${li}`)}</Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
