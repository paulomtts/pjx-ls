from pyjinhx import ReactiveComponent

from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import RouteKeys


class DomainTabs(ReactiveComponent, react={RouteKeys.ROUTE}):
    route: str = "chat"

    @classmethod
    def load(cls, ctx: NavContext) -> "DomainTabs":
        return cls(route=ctx.route)
