from typing import Annotated

from pyjinhx import BaseComponent
from pyjinhx.base import PjxSlot


class SidebarItem(BaseComponent):
    start: Annotated[str | BaseComponent | None, PjxSlot()] = None
    center: str | BaseComponent | None = None
    end: Annotated[str | BaseComponent | None, PjxSlot()] = None
    active: bool = False
    danger: bool = False
