import zmq


class ParseError(Exception):
    def __str__(self):
        return "ParseError: " + super().__str__()


class Message():
    @classmethod
    def from_string(cls, string):
        raise NotImplementedError()

    @classmethod
    def from_json(cls, json):
        raise NotImplementedError()

    def to_string(self) -> str:
        raise NotImplementedError()

    def to_json(self):
        raise NotImplementedError()
