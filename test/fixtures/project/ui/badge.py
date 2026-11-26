from typing import Literal

from pyjinhx import BaseComponent


class Badge(BaseComponent):
    label: str
    tone: Literal["calm", "late"] = "calm"
    count: int = 0

    def shout(self) -> str:
        return self.label.upper()
