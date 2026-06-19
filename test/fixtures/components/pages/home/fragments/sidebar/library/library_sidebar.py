from pyjinhx import ReactiveComponent

from app.adapters.web.components.new.factories import NavContext
from app.adapters.web.components.new.keys import LibraryKeys


class LibrarySidebar(ReactiveComponent, react={LibraryKeys.FILE}):
    file: str = "101"

    @classmethod
    def load(cls, ctx: NavContext) -> "LibrarySidebar":
        return cls(file=ctx.library_file)
