from pyjinhx import ReactiveComponent

from app.adapters.web.components.new import mock
from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import ChatKeys


class ChatSidebar(
    ReactiveComponent,
    react={ChatKeys.VIEW, ChatKeys.CONVERSATION, ChatKeys.CONVERSATIONS},
):
    conversation: str = "1"
    view: str = "thread"
    groups: tuple = ()

    @classmethod
    def load(cls, ctx: NavContext) -> "ChatSidebar":
        return cls(
            conversation=ctx.conversation,
            view=ctx.view,
            groups=tuple(mock.active_groups()),
        )
