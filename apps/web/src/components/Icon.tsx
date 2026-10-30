// Small stroke icon set, drawn for Open HQ (24px grid, 1.6 stroke).
const P: Record<string, string> = {
  lamp: "M12 3v2M5.6 5.6l1.4 1.4M18.4 5.6 17 7M8 14a4 4 0 1 1 8 0c0 1.5-.8 2.4-1.5 3.2-.4.4-.5.8-.5 1.3V19h-4v-.5c0-.5-.1-.9-.5-1.3C8.8 16.4 8 15.5 8 14ZM10 21.5h4",
  check: "M5 12.5 10 17l9-10",
  inbox: "M4 13.5 6.5 5h11l2.5 8.5V19H4v-5.5Zm0 0h4.5l1 2h5l1-2H20",
  chat: "M4 5.5h16v10H9l-5 4v-14Z",
  hash: "M9 4 7.5 20M16.5 4 15 20M4.5 9h16M3.5 15h16",
  room: "M4 20V8l8-4 8 4v12M9 20v-6h6v6",
  box: "M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Zm0 0 8 3.5m0 0 8-3.5M12 11v9",
  plug: "M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8Zm5 8v5",
  calendar: "M4 6h16v14H4V6Zm0 4h16M8 3.5v4M16 3.5v4",
  pulse: "M3 12h4l2.5-6 5 12L17 12h4",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  plus: "M12 5v14M5 12h14",
  menu: "M4 7h16M4 12h16M4 17h16",
  x: "M6 6l12 12M18 6 6 18",
  back: "M15 5l-7 7 7 7",
  send: "M4 12 20 4l-6 16-2.5-6.5L4 12Zm7.5 1.5L20 4",
  ext: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  lock: "M6 11h12v9H6v-9Zm2.5 0V8a3.5 3.5 0 0 1 7 0v3",
  alert: "M12 4 2.5 20h19L12 4Zm0 6v4.5m0 3v.01",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5",
  play: "M7 4.5v15l12-7.5-12-7.5Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5a7.5 7.5 0 0 1 15 0",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  chev: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  wifi: "M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0M12 19.5v.01",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  trash: "M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13",
};

export type IconName = keyof typeof P;

export function Icon({ name, className = "ico", title }: { name: IconName | string; className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={P[name] ?? P.more} />
    </svg>
  );
}
