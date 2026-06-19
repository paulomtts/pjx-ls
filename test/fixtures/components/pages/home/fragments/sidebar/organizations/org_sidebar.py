from pyjinhx import ReactiveComponent

from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import OrgKeys


class OrgSidebar(ReactiveComponent, react={OrgKeys.SECTION}):
    section: str = "overview"

    @classmethod
    def load(cls, ctx: NavContext) -> "OrgSidebar":
        return cls(section=ctx.org_section)
