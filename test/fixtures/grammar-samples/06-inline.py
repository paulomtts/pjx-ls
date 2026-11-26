from pyjinhx import BaseComponent


class Badge(BaseComponent):
    label: str
    count: int = 0

    template = """
    {#css
    .badge { border-radius: 999px; }
    #}
    <span class="badge">{{ label }} <Icon name="x"/></span>
    """
