import { NextRequest, NextResponse } from "next/server";

const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_USER  = process.env.GITHUB_USER;       // ex: "rodrigoscharp"
const GH_REPO  = process.env.GITHUB_DEFAULT_REPO; // ex: "Jarvis"

const ghFetch = (path: string) =>
  fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

export async function POST(req: NextRequest) {
  if (!GH_TOKEN) return NextResponse.json({ error: "GITHUB_TOKEN não configurado" }, { status: 500 });

  try {
    const { action, repo } = await req.json();
    const target = repo ?? GH_REPO;
    const repoPath = `${GH_USER}/${target}`;

    /* ── PRs abertos ─────────────────────────────────────── */
    if (action === "prs") {
      const res  = await ghFetch(`/repos/${repoPath}/pulls?state=open&per_page=5`);
      const data = await res.json();
      if (!Array.isArray(data)) return NextResponse.json({ error: data.message ?? "Erro ao buscar PRs" });

      if (data.length === 0) return NextResponse.json({ summary: `Nenhum PR aberto em ${target}.` });
      const list = data.map((pr: { number: number; title: string; user: { login: string } }) =>
        `#${pr.number} "${pr.title}" por ${pr.user.login}`
      ).join("; ");
      return NextResponse.json({ summary: `${data.length} PR(s) aberto(s) em ${target}: ${list}.` });
    }

    /* ── Issues abertas ──────────────────────────────────── */
    if (action === "issues") {
      const res  = await ghFetch(`/repos/${repoPath}/issues?state=open&per_page=5`);
      const data = await res.json();
      if (!Array.isArray(data)) return NextResponse.json({ error: data.message ?? "Erro ao buscar issues" });

      const issues = data.filter((i: { pull_request?: unknown }) => !i.pull_request);
      if (issues.length === 0) return NextResponse.json({ summary: `Nenhuma issue aberta em ${target}.` });
      const list = issues.map((i: { number: number; title: string }) => `#${i.number} "${i.title}"`).join("; ");
      return NextResponse.json({ summary: `${issues.length} issue(s) em ${target}: ${list}.` });
    }

    /* ── Commits recentes ────────────────────────────────── */
    if (action === "commits") {
      const res  = await ghFetch(`/repos/${repoPath}/commits?per_page=5`);
      const data = await res.json();
      if (!Array.isArray(data)) return NextResponse.json({ error: data.message ?? "Erro ao buscar commits" });

      const list = data.map((c: { sha: string; commit: { message: string; author: { name: string } } }) =>
        `${c.sha.slice(0, 7)} — ${c.commit.message.split("\n")[0]} (${c.commit.author.name})`
      ).join("; ");
      return NextResponse.json({ summary: `Últimos commits em ${target}: ${list}.` });
    }

    /* ── Repos do usuário ────────────────────────────────── */
    if (action === "repos") {
      const res  = await ghFetch(`/users/${GH_USER}/repos?sort=updated&per_page=5`);
      const data = await res.json();
      if (!Array.isArray(data)) return NextResponse.json({ error: data.message ?? "Erro ao buscar repos" });
      const list = data.map((r: { name: string; stargazers_count: number }) => `${r.name} (★${r.stargazers_count})`).join(", ");
      return NextResponse.json({ summary: `Seus repositórios mais recentes: ${list}.` });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
