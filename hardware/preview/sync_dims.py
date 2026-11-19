#!/usr/bin/env python3
"""Generates preview/dims.js from enclosure/dims.scad.

The dimension table is the single source of truth for the CAD *and* for the
preview, so the drawing can never drift away from the model.

    python3 preview/sync_dims.py
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "enclosure", "dims.scad")
DST = os.path.join(HERE, "dims.js")

ASSIGN = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);", re.M)


def main():
    env = {}
    with open(SRC, "r", encoding="utf-8") as handle:
        for match in ASSIGN.finditer(handle.read()):
            name, expr = match.group(1), match.group(2)
            expr = expr.split("//")[0].split("/*")[0].strip()
            try:
                env[name] = eval(expr, {"__builtins__": {}}, dict(env))
            except Exception:
                continue  # not a numeric parameter (e.g. a string)

    with open(DST, "w", encoding="utf-8") as handle:
        handle.write("// generated from enclosure/dims.scad - do not edit\n")
        handle.write("// run: python3 preview/sync_dims.py\n")
        handle.write("const DIMS = ")
        handle.write(json.dumps(env, indent=2, sort_keys=True))
        handle.write(";\n")
    print("wrote %s (%d parameters)" % (DST, len(env)))


if __name__ == "__main__":
    main()
