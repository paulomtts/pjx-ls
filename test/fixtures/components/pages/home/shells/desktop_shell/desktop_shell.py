from pyjinhx import ReactiveComponent

from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import RouteKeys


class DesktopShell(ReactiveComponent, react={RouteKeys.ROUTE}):
    route: str = "chat"
    conversation: str = "1"

    @classmethod
    def load(cls, ctx: NavContext) -> "DesktopShell":
        return cls(route=ctx.route, conversation=ctx.conversation)
