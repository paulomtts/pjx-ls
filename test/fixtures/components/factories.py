from dataclasses import dataclass

from fastapi import Request
from pyjinhx import PjxContext

from app.adapters.web.components.new import mock


@dataclass(frozen=True)
class NavContext(PjxContext):
    route: str = "chat"
    view: str = "thread"
    conversation: str = "1"
    org_section: str = "overview"
    library_file: str = "101"


def make_context(request: Request) -> NavContext:
    """Derive the load-context from the request (pyjinhx binds it at request
    start, before the endpoint runs), falling back to the persisted STATE."""
    path = request.url.path
    route = request.query_params.get("route") or mock.STATE["route"]
    view = mock.STATE["view"]
    conversation = mock.STATE["conversation"]
    org_section = mock.STATE["org_section"]
    library_file = mock.STATE["library_file"]

    if path.startswith("/chat/conversations/") and "/" not in path[len("/chat/conversations/") :]:
        conversation, view = path.rsplit("/", 1)[-1], "thread"
    elif path == "/chat/conversations":  # POST → new (empty) conversation
        conversation, view = "new", "thread"
    elif path == "/chat/trash":
        view = "trash"
    elif path == "/chat/message":
        view = "thread"
    elif path.startswith("/orgs/sections/"):
        org_section = path.rsplit("/", 1)[-1]
    elif path.startswith("/library/files/"):
        library_file = path.rsplit("/", 1)[-1]

    return NavContext(
        route=route,
        view=view,
        conversation=conversation,
        org_section=org_section,
        library_file=library_file,
    )
