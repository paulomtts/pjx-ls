from pyjinhx import ReactiveComponent

from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import RouteKeys


class SidebarShell(ReactiveComponent, react={RouteKeys.ROUTE}):
    route: str = "chat"
    conversation: str = "1"
    view: str = "thread"
    org_section: str = "overview"
    library_file: str = "101"

    @classmethod
    def load(cls, ctx: NavContext) -> "SidebarShell":
        return cls(
            route=ctx.route,
            conversation=ctx.conversation,
            view=ctx.view,
            org_section=ctx.org_section,
            library_file=ctx.library_file,
        )
