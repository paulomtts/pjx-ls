from pyjinhx import ReactiveComponent

from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import ChatKeys


class ChatDesktop(ReactiveComponent, react={ChatKeys.VIEW}):
    view: str = "thread"
    conversation: str = "1"

    @classmethod
    def load(cls, ctx: NavContext) -> "ChatDesktop":
        return cls(view=ctx.view, conversation=ctx.conversation)
