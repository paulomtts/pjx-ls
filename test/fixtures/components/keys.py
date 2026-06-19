from pyjinhx import MutationKey


class RouteKeys(MutationKey):
    ROUTE = "route"


class ChatKeys(MutationKey):
    VIEW = "chat.view"
    CONVERSATION = "chat.conversation"
    CONVERSATIONS = "chat.conversations"
    TRASH = "chat.trash"


class OrgKeys(MutationKey):
    SECTION = "org.section"


class LibraryKeys(MutationKey):
    FILE = "library.file"
