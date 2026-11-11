import { Bot, Boxes, CalendarRange, Loader2, Send, Sparkles, Truck, User, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Badge, PageHeader } from '@/components/kit/Panel';
import { Markdown } from '@/components/Markdown';
import { displayCell, parseCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import { getRayfinClient } from '@/services/rayfin/RayfinClientService';

type AgentKey = 'planning' | 'maintenance' | 'procurement' | 'foundry';

const AGENTS: Record<AgentKey, { label: string; item: string; description: string; icon: ReactNode; tone: string; questions: string[] }> = {
  planning: {
    label: 'Planning',
    item: 'da_contoso_dev_swc_planning_01',
    description: 'Hours, progress against plan and forecast at completion.',
    icon: <CalendarRange className="size-4" />,
    tone: 'from-indigo-500 to-violet-500',
    questions: [
      'Which three projects have the most hours booked in total?',
      'Which executing projects have the highest forecast overrun rate?',
      'How many activities were behind plan in the latest week, by discipline?',
    ],
  },
  maintenance: {
    label: 'Maintenance',
    item: 'da_contoso_dev_swc_maintenance_01',
    description: 'Work orders, cost, downtime and live equipment telemetry.',
    icon: <Wrench className="size-4" />,
    tone: 'from-teal-500 to-emerald-500',
    questions: [
      'Which installations had the most corrective work orders in 2026?',
      'What was the total maintenance cost by work order type last quarter?',
      'Which equipment class groups cause the most downtime?',
    ],
  },
  procurement: {
    label: 'Procurement',
    item: 'da_contoso_dev_swc_procurement_01',
    description: 'Purchase orders, suppliers, delivery performance.',
    icon: <Truck className="size-4" />,
    tone: 'from-amber-500 to-orange-500',
    questions: [
      'Which suppliers have the worst on-time delivery with at least 20 delivered lines?',
      'What is the open order value by material group?',
      'How did order value develop per quarter in 2026?',
    ],
  },
  foundry: {
    label: 'Foundry agent',
    item: 'Foundry prompt agent (optional)',
    description: 'Routes any question to the right data agent.',
    icon: <Sparkles className="size-4" />,
    tone: 'from-fuchsia-500 to-indigo-500',
    questions: [
      'Which three projects have the most hours booked in total?',
      'Which suppliers have the worst on-time delivery with at least 20 delivered lines?',
      'Which installations had the most corrective work orders in 2026?',
    ],
  },
};

interface Message {
  id: string;
  role: 'user' | 'agent';
  agent: AgentKey;
  text: string;
  tables?: { title: string; csv: string }[];
  /** Data agents (or web search) the Foundry agent used. */
  via?: string[];
  elapsedMs?: number;
  error?: boolean;
}

const STORAGE_KEY = 'operations-hub.chat';
const who = (key: AgentKey) => (key === 'foundry' ? 'the Foundry agent' : `the ${AGENTS[key].label.toLowerCase()} agent`);
const toolLabel = (tool: string) => Object.values(AGENTS).find((a) => a.item === tool)?.label ?? tool;

export function Ask() {
  const [agent, setAgent] = useState<AgentKey>('planning');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as Message[];
    } catch {
      return [];
    }
  });
  const [pending, setPending] = useState<{ agent: AgentKey; started: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pending]);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pending]);

  async function ask(question: string) {
    const q = question.trim();
    if (q.length < 3 || pending) return;
    const target = agent;
    setInput('');
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', agent: target, text: q }]);
    setPending({ agent: target, started: Date.now() });
    try {
      const functions = getRayfinClient().functions;
      const reply =
        target === 'foundry'
          ? await functions.askFoundryAgent.invoke({ question: q }, { timeoutMs: 245_000 })
          : await functions.askDataAgent.invoke({ agent: target, question: q }, { timeoutMs: 245_000 });
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          agent: target,
          text: reply.answer || '_The agent returned no text._',
          tables: 'tables' in reply ? reply.tables : undefined,
          via: 'usedTools' in reply ? reply.usedTools : undefined,
          elapsedMs: reply.elapsedMs,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: 'agent', agent: target, text: err instanceof Error ? err.message : String(err), error: true },
      ]);
    } finally {
      setPending(null);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  const current = AGENTS[agent];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fabric data agents and Foundry"
        title="Ask the data"
        description="The Foundry agent sends your question to the right Fabric data agent; the other cards ask one data agent directly. Answers usually take 20 to 90 seconds."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {(Object.keys(AGENTS) as AgentKey[]).map((key) => {
          const a = AGENTS[key];
          const active = key === agent;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setAgent(key)}
              className={cn(
                'rounded-2xl border bg-white p-4 text-left shadow-sm transition',
                active ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200/80 hover:border-slate-300'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className={`grid size-8 place-items-center rounded-lg bg-gradient-to-br text-white ${a.tone}`}>{a.icon}</span>
                <span className="font-semibold text-slate-900">{a.label}</span>
                {active && <Badge tone="indigo" className="ml-auto">Selected</Badge>}
              </div>
              <p className="mt-2 text-xs text-slate-600">{a.description}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{a.item}</p>
            </button>
          );
        })}
      </div>

      <section className="flex min-h-[480px] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          {messages.length === 0 && !pending && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg">
                <Boxes className="size-6" />
              </div>
              <p className="mt-4 font-semibold text-slate-900">Ask {who(agent)}</p>
              <p className="mt-1 text-sm text-slate-500">Pick a suggestion or type your own question.</p>
            </div>
          )}
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          {pending && (
            <div className="flex items-start gap-3">
              <Avatar agent={pending.agent} />
              <div className="rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-indigo-500" />
                  {pending.agent === 'foundry'
                    ? 'The Foundry agent is routing the question'
                    : `The ${AGENTS[pending.agent].label.toLowerCase()} agent is querying the data`}
                  … {Math.round((now - pending.started) / 1000)} s
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-100 p-3 md:p-4">
          <div className="mb-2 flex flex-wrap gap-2">
            {current.questions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={!!pending}
                onClick={() => void ask(q)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder={`Ask ${who(agent)}…`}
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="submit"
              disabled={!!pending || input.trim().length < 3}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="size-4" /> Ask
            </button>
          </form>
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} className="mt-2 text-[11px] text-slate-400 hover:text-slate-600">
              Clear conversation
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Avatar({ agent, user }: { agent: AgentKey; user?: boolean }) {
  if (user) {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-white">
        <User className="size-4" />
      </span>
    );
  }
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white ${AGENTS[agent].tone}`}>
      <Bot className="size-4" />
    </span>
  );
}

function ChatMessage({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex items-start justify-end gap-3">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-indigo-200">To {AGENTS[message.agent].label}</p>
          {message.text}
        </div>
        <Avatar agent={message.agent} user />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <Avatar agent={message.agent} />
      <div className={cn('min-w-0 max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-3', message.error ? 'border border-rose-200 bg-rose-50' : 'bg-slate-50')}>
        {message.error ? (
          <>
            <p className="text-sm font-medium text-rose-800">
              {message.agent === 'foundry' ? 'The Foundry agent call failed' : 'The data agent call failed'}
            </p>
            <p className="mt-1 break-words text-xs text-rose-700">{message.text}</p>
          </>
        ) : (
          <Markdown text={message.text} />
        )}
        {message.tables?.map((t, i) => (
          <ResultTable key={i} title={t.title} csv={t.csv} />
        ))}
        {message.elapsedMs != null && (
          <p className="mt-2 text-[10px] text-slate-400">
            {AGENTS[message.agent].item}
            {message.via?.length ? ` → ${message.via.map(toolLabel).join(', ')}` : ''} · {(message.elapsedMs / 1000).toFixed(0)} s
          </p>
        )}
      </div>
    </div>
  );
}

function ResultTable({ title, csv }: { title: string; csv: string }) {
  const rows = parseCsv(csv);
  if (rows.length < 2) return null;
  const [header, ...body] = rows;
  return (
    <details className="mt-3 rounded-xl border border-slate-200 bg-white" open={body.length <= 12}>
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">
        Result table · {body.length} row{body.length === 1 ? '' : 's'}
        <span className="ml-2 font-normal text-slate-400">{title}</span>
      </summary>
      <div className="max-h-72 overflow-auto border-t border-slate-100">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              {header.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {body.slice(0, 200).map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                    {displayCell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
