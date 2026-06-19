import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))

import uvicorn
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse
from pyjinhx import Renderer, component, setup
from pyjinhx.reactive import ReactiveResponse

from app.adapters.web.components.new import mock
from app.adapters.web.components.new.factories import make_context
from app.adapters.web.components.new.i18n import DEFAULT_LOCALE, TRANSLATIONS
from app.adapters.web.components.new.keys import ChatKeys, LibraryKeys, OrgKeys, RouteKeys
from app.adapters.web.components.new.pages.home.fragments.desktop.chat.message_thread.message_thread import (  # noqa: E501
    MessageThread,
)

COMPONENTS_ROOT = str(Path(__file__).parent)
STATIC_ROOT = f"{COMPONENTS_ROOT}/static"

app = FastAPI(title="nori · new components")
setup(
    app,
    context_factory=make_context,
    components_root=COMPONENTS_ROOT,
    static_root=STATIC_ROOT,
)


def _messages_for(conversation: str, limit: int = 0) -> tuple:
    messages = mock.messages_for(conversation)
    return messages[-limit:] if limit else messages


_env = Renderer.get_default_environment()
_env.globals["t"] = TRANSLATIONS[DEFAULT_LOCALE]
_env.globals["messages_for"] = _messages_for
_env.globals["active_groups"] = mock.active_groups
_env.globals["archived_conversations"] = mock.archived_conversations

Index = component("Index")


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> str:
    for param, key in (
        ("route", "route"),
        ("conversation", "conversation"),
        ("section", "org_section"),
        ("file", "library_file"),
    ):
        if request.query_params.get(param):
            mock.STATE[key] = request.query_params[param]
    return Index(
        title="Nori",
        route=mock.STATE["route"],
        conversation=mock.STATE["conversation"],
        org_section=mock.STATE["org_section"],
        library_file=mock.STATE["library_file"],
    ).render()


@app.post("/nav", response_class=HTMLResponse)
def nav(route: str = "chat") -> str:
    mock.STATE["route"] = route
    return ReactiveResponse(RouteKeys.ROUTE)


@app.get("/chat/conversations/{conv_id}", response_class=HTMLResponse)
def select_conversation(conv_id: str) -> str:
    mock.STATE["conversation"] = conv_id
    # From trash: re-render the whole chat desktop back to the thread view.
    if mock.STATE["view"] != "thread":
        mock.STATE["view"] = "thread"
        return ReactiveResponse(ChatKeys.VIEW)
    # Already in thread: swap only the message thread.
    return ReactiveResponse(ChatKeys.CONVERSATION)


@app.get("/chat/trash", response_class=HTMLResponse)
def chat_trash() -> str:
    mock.STATE["view"] = "trash"
    return ReactiveResponse(ChatKeys.VIEW)


@app.post("/chat/conversations", response_class=HTMLResponse)
def new_conversation() -> str:
    mock.STATE["conversation"] = mock.create_conversation()
    mock.STATE["view"] = "thread"
    return ReactiveResponse(ChatKeys.VIEW)


@app.post("/chat/message", response_class=HTMLResponse)
def send_message(content: str = Form("")) -> str:
    if content.strip():
        mock.append_message(mock.STATE["conversation"], content)
    return ReactiveResponse(ChatKeys.CONVERSATION)


@app.post("/chat/conversations/{conv_id}/archive", response_class=HTMLResponse)
def archive_conversation(conv_id: str) -> str:
    mock.archive(conv_id)
    return ReactiveResponse(ChatKeys.CONVERSATIONS, ChatKeys.TRASH)


@app.post("/chat/trash/{conv_id}/restore", response_class=HTMLResponse)
def restore_conversation(conv_id: str) -> str:
    mock.restore(conv_id)
    return ReactiveResponse(ChatKeys.CONVERSATIONS, ChatKeys.TRASH)


@app.delete("/chat/trash/{conv_id}", response_class=HTMLResponse)
def purge_conversation(conv_id: str) -> str:
    mock.purge(conv_id)
    return ReactiveResponse(ChatKeys.TRASH)


@app.get("/chat/trash/{conv_id}/preview", response_class=HTMLResponse)
def trash_preview(conv_id: str) -> str:
    return MessageThread(id=f"trash-preview-{conv_id}", conversation=conv_id, limit=4).render()


@app.get("/orgs/sections/{section}", response_class=HTMLResponse)
def select_org_section(section: str) -> str:
    mock.STATE["org_section"] = section
    return ReactiveResponse(OrgKeys.SECTION)


@app.get("/library/files/{file_id}", response_class=HTMLResponse)
def select_library_file(file_id: str) -> str:
    mock.STATE["library_file"] = file_id
    return ReactiveResponse(LibraryKeys.FILE)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8100)
