"""Python side of the REC-1 device protocol.

Mirrors firmware/rec_controller/protocol.h - keep both in sync.

device -> host
    HELLO <proto> <fw>
    CMD  <name> <arg> <seq>       (REC TOGGLE / SCENE NEXT)
    PING <seq>
    LOG  <text>

host -> device
    PONG <seq>
    ST   LINK|OBS|REC <0|1>
    ST   TIME <seconds>
    ST   SCENE <name>
    ACK  <name> <seq> <OK|ERR|DUP>
"""

PROTO_VERSION = 1

_COMMANDS = {("REC", "TOGGLE"), ("SCENE", "NEXT")}


def parse_line(line):
    """Parses one device line.

    Returns a dict (``kind`` plus kind specific keys) or None when the line is
    not understood.
    """
    if not line:
        return None
    parts = line.strip().split()
    if not parts:
        return None
    head = parts[0]

    if head == "HELLO" and len(parts) >= 2:
        try:
            version = int(parts[1])
        except ValueError:
            return None
        return {"kind": "hello", "proto": version, "fw": parts[2] if len(parts) > 2 else ""}

    if head == "CMD" and len(parts) >= 4:
        name, arg, raw_seq = parts[1], parts[2], parts[3]
        if (name, arg) not in _COMMANDS:
            return None
        try:
            seq = int(raw_seq)
        except ValueError:
            return None
        return {"kind": "cmd", "name": name, "arg": arg, "seq": seq}

    if head == "PING" and len(parts) >= 2:
        try:
            seq = int(parts[1])
        except ValueError:
            return None
        return {"kind": "ping", "seq": seq}

    if head == "LOG" and len(parts) >= 2:
        return {"kind": "log", "text": " ".join(parts[1:])}

    return None


def format_status(link=False, obs=False, recording=False, duration=0.0, scene=""):
    """Builds the status block that is pushed to the device."""
    lines = [
        "ST LINK %d" % (1 if link else 0),
        "ST OBS %d" % (1 if obs else 0),
        "ST REC %d" % (1 if recording else 0),
        "ST TIME %.1f" % max(0.0, float(duration)),
    ]
    if scene:
        lines.append("ST SCENE %s" % scene)
    return ("\n".join(lines) + "\n").encode("ascii")


def format_pong(seq):
    return ("PONG %d\n" % seq).encode("ascii")


def format_ack(name, seq, result):
    return ("ACK %s %d %s\n" % (name, seq, result)).encode("ascii")
