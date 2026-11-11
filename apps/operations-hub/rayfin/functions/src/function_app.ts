import {
  AudienceType,
  UserDataFunctions,
  type RayfinContext,
} from '@microsoft/fabric-user-data-functions';

const udf = new UserDataFunctions();

// Configuration: fill in before you deploy (see README.md). The functions run as the
// owner of the app item, so that account needs access to every agent named here.

/** The workspace that holds the data agents (the GUID in its Fabric URL). */
const WORKSPACE_ID = 'YOUR-WORKSPACE-GUID';

/**
 * Published data agents the app may call. The browser sends only the key, so
 * it can never point the function at another item. Each id is in the agent's URL.
 */
const AGENTS: Record<string, { id: string; name: string }> = {
  planning: { id: 'YOUR-PLANNING-AGENT-GUID', name: 'da_contoso_dev_swc_planning_01' },
  maintenance: { id: 'YOUR-MAINTENANCE-AGENT-GUID', name: 'da_contoso_dev_swc_maintenance_01' },
  procurement: { id: 'YOUR-PROCUREMENT-AGENT-GUID', name: 'da_contoso_dev_swc_procurement_01' },
};

/**
 * Optional: a Foundry prompt agent that has the data agents above as tools and routes
 * each question (instructions and tools live in your Foundry project, not here).
 * Leave both empty to turn it off.
 */
const FOUNDRY_PROJECT = ''; // https://<account>.services.ai.azure.com/api/projects/<project>
const FOUNDRY_AGENT = '';

const FABRIC_API = 'https://api.fabric.microsoft.com/v1';
const TIMEOUT_MS = 230_000;

const configured = (value: string) => value !== '' && !value.startsWith('YOUR-');

interface JsonRpcResponse {
  result?: {
    tools?: { name: string; inputSchema?: { properties?: Record<string, unknown> } }[];
    content?: { type: string; text?: string; resource?: { uri?: string; text?: string; _meta?: { title?: string } } }[];
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

/** Sends one JSON-RPC request to the data agent MCP endpoint (streamable HTTP, stateless). */
async function rpc(
  token: string,
  agentId: string,
  method: string,
  params: Record<string, unknown>,
  signal: AbortSignal,
): Promise<JsonRpcResponse> {
  const url = `${FABRIC_API}/mcp/workspaces/${WORKSPACE_ID}/dataagents/${agentId}/agent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal,
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Data agent endpoint returned HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const events = body
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    return JSON.parse(events[events.length - 1] ?? '{}') as JsonRpcResponse;
  }
  return JSON.parse(body) as JsonRpcResponse;
}

/**
 * Asks one published Fabric data agent a question through its MCP endpoint and
 * returns the answer text plus any result tables (CSV) the agent attached.
 * Runs as the app identity (the owner of the Fabric app item).
 */
udf.func(
  'askDataAgent',
  async (
    ctx: RayfinContext<Record<string, any>, AudienceType.Fabric>,
    agent: string,
    question: string,
  ): Promise<{ agent: string; answer: string; tables: { title: string; csv: string }[]; elapsedMs: number }> => {
    const target = AGENTS[agent];
    if (!target) {
      throw new Error(`Unknown data agent "${agent}". Use one of: ${Object.keys(AGENTS).join(', ')}.`);
    }
    if (!configured(WORKSPACE_ID) || !configured(target.id)) {
      throw new Error(
        `The ${agent} data agent is not configured. Set WORKSPACE_ID and its id in rayfin/functions/src/function_app.ts, then deploy again.`,
      );
    }
    const text = (question ?? '').trim();
    if (text.length < 3 || text.length > 1000) {
      throw new Error('The question must be between 3 and 1000 characters.');
    }

    const started = Date.now();
    const token = ctx.Tokens.Fabric;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const listed = await rpc(token, target.id, 'tools/list', {}, controller.signal);
      const tool = listed.result?.tools?.[0];
      if (!tool) {
        throw new Error(listed.error?.message ?? 'The data agent exposes no tool. Is it published?');
      }
      const argName = Object.keys(tool.inputSchema?.properties ?? {})[0] ?? 'userQuestion';
      const called = await rpc(
        token,
        target.id,
        'tools/call',
        { name: tool.name, arguments: { [argName]: text } },
        controller.signal,
      );
      if (called.error) {
        throw new Error(`Data agent error ${called.error.code}: ${called.error.message}`);
      }
      const content = called.result?.content ?? [];
      const answer = content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text as string)
        .join('\n\n');
      const tables = content
        .filter((c) => c.type === 'resource' && c.resource?.text)
        .map((c) => ({
          title: c.resource?._meta?.title ?? c.resource?.uri ?? 'Result',
          csv: c.resource?.text ?? '',
        }));
      if (called.result?.isError) {
        throw new Error(answer || 'The data agent reported an error.');
      }
      return { agent: target.name, answer, tables, elapsedMs: Date.now() - started };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`The data agent did not answer within ${TIMEOUT_MS / 1000} seconds.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
  [],
);

interface FoundryResponse {
  status?: string;
  error?: { code?: string; message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; name?: string; server_label?: string; content?: { type: string; text?: string }[] }[];
}

/**
 * Asks the Foundry agent, which picks the data agent(s) and phrases the answer.
 * Returns the tools it used so the app can show where the answer came from.
 * Runs as the app identity, which needs access to the Foundry project.
 */
udf.func(
  'askFoundryAgent',
  async (
    ctx: RayfinContext<Record<string, any>, AudienceType.AzureAI>,
    question: string,
  ): Promise<{ agent: string; answer: string; usedTools: string[]; elapsedMs: number }> => {
    if (!configured(FOUNDRY_PROJECT) || !configured(FOUNDRY_AGENT)) {
      throw new Error(
        'The Foundry agent is not configured. Set FOUNDRY_PROJECT and FOUNDRY_AGENT in rayfin/functions/src/function_app.ts, then deploy again.',
      );
    }
    const text = (question ?? '').trim();
    if (text.length < 3 || text.length > 1000) {
      throw new Error('The question must be between 3 and 1000 characters.');
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${FOUNDRY_PROJECT}/openai/v1/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.Tokens.AzureAI}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: text, agent_reference: { type: 'agent_reference', name: FOUNDRY_AGENT } }),
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`The Foundry agent returned HTTP ${res.status}: ${body.slice(0, 400)}`);
      }
      const response = JSON.parse(body) as FoundryResponse;
      if (response.error) {
        throw new Error(`Foundry agent error: ${response.error.message ?? response.error.code}`);
      }
      const output = response.output ?? [];
      const answer = output
        .filter((o) => o.type === 'message')
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === 'output_text' && c.text)
        .map((c) => c.text as string)
        .join('\n\n');
      if (response.status && response.status !== 'completed') {
        throw new Error(answer || `The Foundry agent stopped: ${response.incomplete_details?.reason ?? response.status}.`);
      }
      const usedTools = [
        ...new Set(
          output.flatMap((o) => {
            if (o.type === 'mcp_call') return [(o.name ?? o.server_label ?? '').replace(/^DataAgent_/, '')];
            if (o.type === 'web_search_call') return ['web search'];
            return [];
          }),
        ),
      ].filter(Boolean);
      return { agent: FOUNDRY_AGENT, answer, usedTools, elapsedMs: Date.now() - started };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`The Foundry agent did not answer within ${TIMEOUT_MS / 1000} seconds.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
  [],
);
