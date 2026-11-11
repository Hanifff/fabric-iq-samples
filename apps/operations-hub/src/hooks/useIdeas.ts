import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getRayfinClient } from '@/services/rayfin/RayfinClientService';

export const STATUSES = ['New', 'Under review', 'Planned', 'Done', 'Not now'] as const;
export const CATEGORIES = ['Planning', 'Maintenance', 'Procurement', 'Data and AI', 'Ways of working'] as const;
export type IdeaStatus = (typeof STATUSES)[number];

export interface IdeaView {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  authorName: string;
  user_id: string;
  createdAt: string;
  updatedAt: string;
  votes: number;
  votedByMe: boolean;
  myVoteId?: string;
}

const PAGE = 1000;

function currentUserId(): string {
  const id = getRayfinClient().auth.getSession().user?.id;
  if (!id) throw new Error('You are not signed in.');
  return id;
}

async function loadIdeas(): Promise<IdeaView[]> {
  const client = getRayfinClient();
  const me = client.auth.getSession().user?.id;
  const [ideas, votes] = await Promise.all([
    client.data.Idea.select(['id', 'title', 'description', 'category', 'status', 'authorName', 'user_id', 'createdAt', 'updatedAt'])
      .orderBy({ createdAt: 'desc' })
      .first(PAGE)
      .execute(),
    client.data.IdeaVote.select(['id', 'ideaId', 'user_id']).first(PAGE * 5).execute(),
  ]);
  return ideas.map((i) => {
    const mine = votes.find((v) => v.ideaId === i.id && v.user_id === me);
    return {
      id: i.id,
      title: i.title,
      description: i.description ?? undefined,
      category: i.category,
      status: i.status,
      authorName: i.authorName,
      user_id: i.user_id,
      createdAt: String(i.createdAt),
      updatedAt: String(i.updatedAt),
      votes: votes.filter((v) => v.ideaId === i.id).length,
      votedByMe: !!mine,
      myVoteId: mine?.id,
    };
  });
}

export function useIdeas() {
  const qc = useQueryClient();
  const ideas = useQuery({ queryKey: ['ideas'], queryFn: loadIdeas, staleTime: 15_000, refetchInterval: 60_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['ideas'] });

  const create = useMutation({
    mutationFn: async (input: { title: string; description?: string; category: string; authorName: string }) => {
      const now = new Date();
      return getRayfinClient().data.Idea.create({
        title: input.title,
        description: input.description || undefined,
        category: input.category,
        status: 'New',
        authorName: input.authorName,
        user_id: currentUserId(),
        createdAt: now,
        updatedAt: now,
      });
    },
    onSettled: refresh,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => getRayfinClient().data.Idea.update({ id }, { status, updatedAt: new Date() }),
    onSettled: refresh,
  });

  const toggleVote = useMutation({
    mutationFn: async (idea: IdeaView) => {
      const client = getRayfinClient();
      if (idea.myVoteId) {
        await client.data.IdeaVote.delete({ id: idea.myVoteId });
        return;
      }
      const me = currentUserId();
      await client.data.IdeaVote.create({ ideaId: idea.id, voteKey: `${idea.id}:${me}`, user_id: me, createdAt: new Date() });
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: async (idea: IdeaView) => {
      const client = getRayfinClient();
      if (idea.myVoteId) await client.data.IdeaVote.delete({ id: idea.myVoteId }).catch(() => undefined);
      await client.data.Idea.delete({ id: idea.id });
    },
    onSettled: refresh,
  });

  return { ideas, create, setStatus, toggleVote, remove, currentUserId: () => getRayfinClient().auth.getSession().user?.id };
}
