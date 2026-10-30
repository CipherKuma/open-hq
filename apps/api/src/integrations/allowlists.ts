// Per-agent READ allowlists (exact Composio tool slugs, verified against the Composio catalog) and the
// write-only set used by execute(). Composio enforces these server-side per session; callReadTool also
// rejects anything off the list before a network call is made.
import type { AgentId } from "@open-hq/shared";

// Privacy: the connected Gmail is a real persona inbox. Support and the dashboard only ever see mail matching this
// fixed query; callReadTool AND-s it onto every agent query and checks by-id reads against it.
export const SUPPORT_QUERY = 'subject:"[Tidyform support]" OR label:tidyform-support';

export const WEB_FETCH = "web_fetch_public_page";
export const GITHUB_REFERRERS = "github_traffic_referrers";

export interface AgentReads {
  toolkits: string[];
  tools: Record<string, string[]>; // toolkit -> Composio slugs
  custom: string[]; // tools implemented in this module (not Composio slugs)
}

export const READ_ALLOWLIST: Record<AgentId, AgentReads> = {
  cos: { toolkits: [], tools: {}, custom: [] }, // reads other agents' output, never an app
  revenue: {
    toolkits: ["stripe"],
    tools: {
      stripe: [
        "STRIPE_LIST_CUSTOMERS",
        "STRIPE_RETRIEVE_CUSTOMER",
        "STRIPE_LIST_SUBSCRIPTIONS",
        "STRIPE_GET_SUBSCRIPTION",
        "STRIPE_LIST_CHARGES",
        "STRIPE_RETRIEVE_CHARGE",
        "STRIPE_LIST_INVOICES",
        "STRIPE_GET_INVOICES_INVOICE",
        "STRIPE_RETRIEVE_BALANCE",
        "STRIPE_LIST_PAYMENT_INTENTS",
        "STRIPE_LIST_REFUNDS",
      ],
    },
    custom: [],
  },
  support: {
    toolkits: ["gmail"],
    tools: {
      gmail: [
        "GMAIL_FETCH_EMAILS",
        "GMAIL_LIST_MESSAGES",
        "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
        "GMAIL_LIST_THREADS",
        "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
      ],
    },
    custom: [],
  },
  ship: {
    toolkits: ["github", "sentry"],
    tools: {
      github: [
        "GITHUB_LIST_COMMITS",
        "GITHUB_GET_A_COMMIT",
        "GITHUB_LIST_PULL_REQUESTS",
        "GITHUB_GET_A_PULL_REQUEST",
        "GITHUB_LIST_REPOSITORY_ISSUES",
        "GITHUB_GET_AN_ISSUE",
        "GITHUB_LIST_WORKFLOW_RUNS_FOR_A_REPOSITORY",
        "GITHUB_GET_A_WORKFLOW_RUN",
        "GITHUB_LIST_JOBS_FOR_A_WORKFLOW_RUN",
        "GITHUB_LIST_DEPLOYMENTS",
        "GITHUB_LIST_DEPLOYMENT_STATUSES",
      ],
      sentry: [
        "SENTRY_LIST_ORGANIZATIONS",
        "SENTRY_GET_PROJECT_LIST",
        "SENTRY_LIST_AN_ORGANIZATIONS_ISSUES",
        "SENTRY_GET_ORGANIZATION_ISSUE_DETAILS",
        "SENTRY_RETRIEVE_ISSUE_EVENTS_BY_ID",
        "SENTRY_RETRIEVE_ORGANIZATION_EVENTS",
        "SENTRY_GET_ORGANIZATION_STATS_SUMMARY",
      ],
    },
    custom: [],
  },
  scout: {
    toolkits: ["github"],
    tools: {
      github: [
        "GITHUB_GET_A_REPOSITORY",
        "GITHUB_LIST_STARGAZERS",
        "GITHUB_GET_PAGE_VIEWS",
        "GITHUB_GET_REPOSITORY_CLONES",
      ],
    },
    custom: [WEB_FETCH, GITHUB_REFERRERS],
  },
};

// Used only by execute(), through a separate Composio session no agent can reach.
export const WRITE_TOOLS: Record<string, string[]> = {
  stripe: ["STRIPE_CREATE_REFUND", "STRIPE_RETRIEVE_BALANCE", "STRIPE_RETRIEVE_CHARGE"],
  gmail: ["GMAIL_REPLY_TO_THREAD", "GMAIL_FETCH_MESSAGE_BY_THREAD_ID"],
  github: [
    "GITHUB_CREATE_AN_ISSUE",
    "GITHUB_CREATE_A_PULL_REQUEST",
    "GITHUB_CREATE_A_REFERENCE",
    "GITHUB_CREATE_A_TREE",
    "GITHUB_CREATE_A_COMMIT",
    "GITHUB_GET_A_COMMIT",
    "GITHUB_GET_A_BRANCH",
    "GITHUB_GET_A_TREE",
  ],
};

export function allowedFor(agent: AgentId): Set<string> {
  const a = READ_ALLOWLIST[agent];
  return new Set([...Object.values(a.tools).flat(), ...a.custom]);
}

// Slugs the module may call for its own reads (dashboard, identity). Read-only, never exposed to agents.
export const SYSTEM_READS: Record<string, string[]> = {
  stripe: [...new Set(Object.values(READ_ALLOWLIST).flatMap((a) => a.tools.stripe ?? []))],
  gmail: ["GMAIL_GET_PROFILE", "GMAIL_LIST_THREADS"], // dashboard builds its own scoped query
  github: [
    "GITHUB_GET_THE_AUTHENTICATED_USER",
    ...new Set(Object.values(READ_ALLOWLIST).flatMap((a) => a.tools.github ?? [])),
  ],
  sentry: [...(READ_ALLOWLIST.ship.tools.sentry ?? []), "SENTRY_RETRIEVE_ORGANIZATION_STATS_V2"],
};
