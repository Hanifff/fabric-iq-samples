import { ChevronUp, Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Badge, ErrorNote, PageHeader, Panel, Skeleton } from '@/components/kit/Panel';
import { useAuth } from '@/hooks/AuthContext';
import { CATEGORIES, STATUSES, useIdeas, type IdeaView } from '@/hooks/useIdeas';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, 'slate' | 'sky' | 'indigo' | 'emerald' | 'amber'> = {
  New: 'sky',
  'Under review': 'amber',
  Planned: 'indigo',
  Done: 'emerald',
  'Not now': 'slate',
};
const STATUS_BAR: Record<string, string> = {
  New: 'bg-sky-400',
  'Under review': 'bg-amber-400',
  Planned: 'bg-indigo-500',
  Done: 'bg-emerald-500',
  'Not now': 'bg-slate-300',
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function Ideas() {
  const { user } = useAuth();
  const { ideas, create, setStatus, toggleVote, remove, currentUserId } = useIdeas();
  const me = currentUserId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sort, setSort] = useState<'votes' | 'newest'>('votes');

  const list = useMemo(() => {
    const rows = (ideas.data ?? []).filter((i) => statusFilter === 'All' || i.status === statusFilter);
    return rows.sort((a, b) => (sort === 'votes' ? b.votes - a.votes || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt)));
  }, [ideas.data, statusFilter, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of ideas.data ?? []) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [ideas.data]);
  const total = ideas.data?.length ?? 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return;
    try {
      await create.mutateAsync({ title: title.trim(), description: description.trim(), category, authorName: user?.name || user?.email || 'Unknown' });
      setTitle('');
      setDescription('');
      toast.success('Idea saved');
    } catch (err) {
      toast.error(`Could not save the idea: ${errorText(err)}`);
    }
  };

  const run = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
    } catch (err) {
      toast.error(`${failure}: ${errorText(err)}`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shared with everyone who can open the app"
        title="Ideas"
        description="Capture improvement ideas, vote for the ones that matter and move them through review. Ideas live in this app's own Fabric SQL database."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="New idea" subtitle="Visible to every app user" className="xl:col-span-1">
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                minLength={3}
                placeholder="For example: alert when a critical spare is late"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Area</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300">
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Details (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="What problem does it solve, and for whom?"
                className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <button
              type="submit"
              disabled={create.isPending || title.trim().length < 3}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="size-4" /> {create.isPending ? 'Saving…' : 'Add idea'}
            </button>
          </form>

          <div className="mt-6">
            <p className="text-xs font-medium text-slate-600">Pipeline · {total} ideas</p>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
              {STATUSES.map((st) =>
                counts[st] ? <div key={st} className={STATUS_BAR[st]} style={{ width: `${(counts[st] / Math.max(1, total)) * 100}%` }} title={`${st}: ${counts[st]}`} /> : null
              )}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
              {STATUSES.map((st) => (
                <li key={st} className="flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', STATUS_BAR[st])} /> {st} <span className="ml-auto pr-3 font-medium text-slate-900">{counts[st] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel
          title="All ideas"
          className="xl:col-span-2"
          actions={
            <div className="flex items-center gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                <option>All</option>
                {STATUSES.map((st) => (
                  <option key={st}>{st}</option>
                ))}
              </select>
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                {(['votes', 'newest'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setSort(v)} className={`rounded-md px-2.5 py-1 font-medium capitalize ${sort === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                    {v === 'votes' ? 'Top' : 'Newest'}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          {ideas.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : ideas.error ? (
            <ErrorNote error={ideas.error} />
          ) : list.length === 0 ? (
            <div className="py-12 text-center">
              <Lightbulb className="mx-auto size-8 text-amber-400" />
              <p className="mt-2 text-sm font-medium text-slate-900">No ideas yet</p>
              <p className="text-xs text-slate-500">Be the first to add one.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {list.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  mine={idea.user_id === me}
                  busy={toggleVote.isPending || setStatus.isPending || remove.isPending}
                  onVote={() => run(() => toggleVote.mutateAsync(idea), 'Could not record the vote')}
                  onStatus={(status) => run(() => setStatus.mutateAsync({ id: idea.id, status }), 'Could not change the status')}
                  onDelete={() => {
                    if (window.confirm(`Delete "${idea.title}"?`)) void run(() => remove.mutateAsync(idea), 'Could not delete the idea');
                  }}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function IdeaCard({ idea, mine, busy, onVote, onStatus, onDelete }: { idea: IdeaView; mine: boolean; busy: boolean; onVote: () => void; onStatus: (s: string) => void; onDelete: () => void }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm">
      <button
        type="button"
        onClick={onVote}
        disabled={busy}
        aria-pressed={idea.votedByMe}
        title={idea.votedByMe ? 'Remove your vote' : 'Vote for this idea'}
        className={cn(
          'flex w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition disabled:opacity-60',
          idea.votedByMe ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'
        )}
      >
        <ChevronUp className="size-4" />
        {idea.votes}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{idea.title}</p>
          <Badge tone={STATUS_TONE[idea.status] ?? 'slate'}>{idea.status}</Badge>
          <Badge tone="violet">{idea.category}</Badge>
        </div>
        {idea.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{idea.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span>
            {idea.authorName}
            {mine && ' (you)'} · {relativeTime(idea.createdAt)}
          </span>
          <select
            value={idea.status}
            disabled={busy}
            onChange={(e) => onStatus(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
            aria-label="Change status"
          >
            {STATUSES.map((st) => (
              <option key={st}>{st}</option>
            ))}
          </select>
          {mine && (
            <button type="button" onClick={onDelete} disabled={busy} className="ml-auto inline-flex items-center gap-1 text-rose-600 hover:text-rose-800">
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
