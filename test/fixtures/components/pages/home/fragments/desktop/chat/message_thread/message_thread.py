from pyjinhx import ReactiveComponent

from app.adapters.web.components.new import mock
from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import ChatKeys


class MessageThread(ReactiveComponent, react={ChatKeys.CONVERSATION}):
    conversation: str = "1"
    messages: tuple = ()
    limit: int = 0
    empty_text: str = ""

    @classmethod
    def load(cls, ctx: NavContext) -> "MessageThread":
        return cls(conversation=ctx.conversation, messages=mock.messages_for(ctx.conversation))
