"""In-memory mock data + session state for the new-tree Chat domain.

No persistence, no real services — endpoints mutate ``STATE`` and the
``CONVERSATIONS`` registry; ``make_context`` reads it; reactive ``load()``
resolves from it. Assistant message content is pre-rendered markup; user content
is escaped at append time. Archiving is a soft delete (``archived=True``) that
moves a conversation out of the sidebar list and into the trash.
"""

from html import escape

GROUP_ORDER = ("today", "yesterday")

# id -> {title, group, archived, archived_relative, messages: tuple[(role, content_html)]}
CONVERSATIONS: dict[str, dict] = {
    "1": {
        "title": "Project kickoff notes",
        "group": "today",
        "archived": False,
        "archived_relative": "",
        "messages": (
            ("user", "Como exporto um relatório de uso?"),
            (
                "assistant",
                "<p>Você pode exportar um relatório de uso em alguns passos:</p>"
                "<ul><li>Abra o painel <strong>Organização → Atividades</strong>.</li>"
                "<li>Selecione o intervalo de datas desejado.</li>"
                "<li>Clique em <strong>Exportar</strong> e escolha o formato "
                "(CSV ou PDF).</li></ul>"
                "<p>O arquivo gerado fica disponível em <code>Biblioteca → Sem pasta</code>.</p>",
            ),
            ("user", "Dá para agendar isso semanalmente?"),
            (
                "assistant",
                "<p>Ainda não há agendamento automático, mas posso te avisar "
                "assim que esse recurso chegar.</p>",
            ),
        ),
    },
    "2": {
        "title": "Q3 planning sync",
        "group": "today",
        "archived": False,
        "archived_relative": "",
        "messages": (
            ("user", "Quais são as metas do Q3?"),
            (
                "assistant",
                "<p>As metas principais do Q3 são <strong>reduzir o churn</strong> "
                "e lançar o novo onboarding.</p>",
            ),
        ),
    },
    "3": {
        "title": "Bug triage thread",
        "group": "yesterday",
        "archived": False,
        "archived_relative": "",
        "messages": (
            ("user", "Quantos bugs abertos temos?"),
            (
                "assistant",
                "<p>Há <strong>12 bugs</strong> abertos, sendo 3 de prioridade alta.</p>",
            ),
        ),
    },
    "4": {
        "title": "Design review — sidebar primitives",
        "group": "yesterday",
        "archived": False,
        "archived_relative": "",
        "messages": (
            ("user", "O que mudou nos primitives da sidebar?"),
            (
                "assistant",
                "<p>Unificamos o botão e a linha de navegação e adotamos os "
                "builtins do pyjinhx.</p>",
            ),
        ),
    },
    "5": {
        "title": "Onboarding checklist",
        "group": "yesterday",
        "archived": False,
        "archived_relative": "",
        "messages": (
            ("user", "Por onde começo o onboarding?"),
            (
                "assistant",
                "<p>Comece pelos passos abaixo:</p><ul><li>Crie sua organização.</li>"
                "<li>Convide o time.</li><li>Importe seus documentos.</li></ul>",
            ),
        ),
    },
    "6": {
        "title": "Rascunho de proposta",
        "group": "yesterday",
        "archived": True,
        "archived_relative": "há 2 dias",
        "messages": (
            ("user", "Pode rascunhar uma proposta para o cliente Acme?"),
            (
                "assistant",
                "<p>Claro! Aqui vai um rascunho inicial com escopo, prazo e valores.</p>",
            ),
            ("user", "Ótimo, depois eu refino."),
        ),
    },
    "7": {
        "title": "Notas de teste rápido",
        "group": "yesterday",
        "archived": True,
        "archived_relative": "há 5 dias",
        "messages": (
            ("user", "Anota aí: testar fluxo de convite."),
            (
                "assistant",
                "<p>Anotado. Quer que eu gere um checklist de testes?</p>",
            ),
        ),
    },
}

STATE: dict[str, str] = {
    "route": "chat",
    "view": "thread",
    "conversation": "1",
    "org_section": "overview",
    "library_file": "101",
}

_next_id = 8


# ── reads ──


def messages_for(conversation: str) -> tuple:
    return CONVERSATIONS.get(conversation, {}).get("messages", ())


def preview_for(conversation: str, limit: int = 4) -> tuple:
    """The last few exchanges, for the collapsed-trash preview."""
    return messages_for(conversation)[-limit:]


def active_groups() -> list[tuple[str, list[dict]]]:
    """Non-archived conversations grouped by day, in ``GROUP_ORDER``."""
    groups: dict[str, list[dict]] = {}
    for cid, conv in CONVERSATIONS.items():
        if conv["archived"]:
            continue
        groups.setdefault(conv["group"], []).append({"id": cid, "title": conv["title"]})
    ordered = [g for g in GROUP_ORDER if g in groups]
    ordered += [g for g in groups if g not in GROUP_ORDER]
    return [(group, groups[group]) for group in ordered]


def archived_conversations() -> list[tuple[str, dict]]:
    return [(cid, conv) for cid, conv in CONVERSATIONS.items() if conv["archived"]]


# ── mutations ──


def create_conversation() -> str:
    global _next_id
    cid = str(_next_id)
    _next_id += 1
    CONVERSATIONS[cid] = {
        "title": "Nova conversa",
        "group": "today",
        "archived": False,
        "archived_relative": "",
        "messages": (),
    }
    return cid


def archive(conversation: str) -> None:
    conv = CONVERSATIONS.get(conversation)
    if conv is not None:
        conv["archived"] = True
        conv["archived_relative"] = "agora mesmo"


def restore(conversation: str) -> None:
    conv = CONVERSATIONS.get(conversation)
    if conv is not None:
        conv["archived"] = False
        conv["archived_relative"] = ""


def purge(conversation: str) -> None:
    CONVERSATIONS.pop(conversation, None)


def append_message(conversation: str, content: str) -> None:
    conv = CONVERSATIONS.get(conversation)
    if conv is None:
        return
    conv["messages"] = (
        *conv["messages"],
        ("user", escape(content)),
        ("assistant", "<p>(resposta simulada)</p>"),
    )
