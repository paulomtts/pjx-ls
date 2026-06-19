from pyjinhx import ReactiveComponent

from app.adapters.web.components.new import mock
from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import ChatKeys


class ChatTrash(ReactiveComponent, react={ChatKeys.TRASH}):
    items: tuple = ()

    @classmethod
    def load(cls, ctx: NavContext) -> "ChatTrash":
        return cls(items=tuple(mock.archived_conversations()))
