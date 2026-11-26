from pyjinhx import BaseComponent, Children


class Modal(BaseComponent):
    title: str
    content: Children = ""

    template = r"""
    <dialog><h2>{{ title }}</h2>{{ content }}</dialog>
    """
