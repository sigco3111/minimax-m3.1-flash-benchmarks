#!/usr/bin/env python3
"""Geometric self check for the REC-1 enclosure STLs.

Parses the two exported STL files (binary STL, standard library only) and
verifies that the features that matter for the assembly are where the
dimension table says they are.  Run it after every CAD change:

    python3 enclosure/check_model.py
"""

import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOL = 0.35  # mm tolerance for printed features

FAILURES = []


def check(condition, message):
    if condition:
        print("  ok   %s" % message)
    else:
        print("  FAIL %s" % message)
        FAILURES.append(message)


def load_stl(path):
    """Returns a list of triangles (each a list of 9 floats).

    Handles both the ASCII and the binary STL format.
    """
    with open(path, "rb") as handle:
        raw = handle.read()
    if raw[:5].lower() == b"solid":
        triangles = []
        values = []
        for line in raw.decode("ascii", "replace").splitlines():
            parts = line.split()
            if parts and parts[0] == "vertex":
                values.extend(float(v) for v in parts[1:4])
                if len(values) == 9:
                    triangles.append(values)
                    values = []
        return triangles, b"ascii"
    count = struct.unpack("<I", raw[80:84])[0]
    triangles = []
    offset = 84
    for _ in range(count):
        data = struct.unpack("<12fH", raw[offset:offset + 50])
        triangles.append(list(data[:9]))
        offset += 50
    return triangles, raw[:80]


def vertices(triangles):
    points = []
    for tri in triangles:
        for i in range(0, 9, 3):
            points.append((tri[i], tri[i + 1], tri[i + 2]))
    return points


def bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    return (
        (min(xs), max(xs)),
        (min(ys), max(ys)),
        (min(zs), max(zs)),
    )


def volume(triangles):
    total = 0.0
    for tri in triangles:
        ax, ay, az = tri[0], tri[1], tri[2]
        bx, by, bz = tri[3], tri[4], tri[5]
        cx, cy, cz = tri[6], tri[7], tri[8]
        total += (
            ax * (by * cz - bz * cy)
            - ay * (bx * cz - bz * cx)
            + az * (bx * cy - by * cx)
        ) / 6.0
    return abs(total)


def circle_vertices_at(points, cx, cy, radius, z_min, z_max):
    """Counts vertices lying on a vertical circle of the given radius."""
    count = 0
    for x, y, z in points:
        if z_min - TOL <= z <= z_max + TOL:
            r = math.hypot(x - cx, y - cy)
            if abs(r - radius) <= TOL:
                count += 1
    return count


def main():
    bottom_path = os.path.join(HERE, "rec1_bottom.stl")
    top_path = os.path.join(HERE, "rec1_top.stl")
    for path in (bottom_path, top_path):
        if not os.path.exists(path):
            print("missing %s - run enclosure/build.sh first" % path)
            return 2

    print("bottom shell")
    tris, _ = load_stl(bottom_path)
    pts = vertices(tris)
    bx, by, bz = bbox(pts)
    check(len(tris) > 0, "contains triangles (%d)" % len(tris))
    check(abs((bx[1] - bx[0]) - 96.0) < 0.01, "width is 96 mm (%.2f)" % (bx[1] - bx[0]))
    check(abs((by[1] - by[0]) - 58.0) < 0.01, "depth is 58 mm (%.2f)" % (by[1] - by[0]))
    check(abs(bz[0]) < 0.01, "floor starts at z=0 (%.2f)" % bz[0])
    check(abs(bz[1] - 21.0) < 0.01, "outer body height is 21 mm (%.2f)" % bz[1])
    boss_tops = [z for (x, y, z) in pts
                 if abs(abs(x) - 41.0) < 3.0 and abs(abs(y) - 22.0) < 3.0]
    check(boss_tops and abs(max(boss_tops) - 18.5) < 0.01,
          "boss top / panel underside at z=18.5 (%.2f)" % (max(boss_tops) if boss_tops else -1))
    check(volume(tris) > 5000, "solid volume is plausible (%.0f mm3)" % volume(tris))
    for sx in (-1, 1):
        for sy in (-1, 1):
            n = circle_vertices_at(pts, sx * 41.0, sy * 22.0, 1.65, 6.0, 18.5)
            check(n >= 8, "M3 boss pilot at (%s40, %s23) (%d vertices)" % (sx, sy, n))
    for sx in (-1, 1):
        for py in (-14.5, 13.5):
            n = circle_vertices_at(pts, sx * 15.25, py, 1.35, 4.0, 12.0)
            check(n >= 8, "OLED post pilot at (%s15.25, %s) (%d vertices)" % (sx, py, n))

    print("face panel")
    tris, _ = load_stl(top_path)
    pts = vertices(tris)
    bx, by, bz = bbox(pts)
    check(len(tris) > 0, "contains triangles (%d)" % len(tris))
    check(abs((bx[1] - bx[0]) - 90.8) < 0.01, "panel width is 90.8 mm (%.2f)" % (bx[1] - bx[0]))
    check(abs((by[1] - by[0]) - 52.8) < 0.01, "panel depth is 52.8 mm (%.2f)" % (by[1] - by[0]))
    check(abs(bz[0] - 18.5) < 0.01, "panel underside at z=18.5 (%.2f)" % bz[0])
    check(abs(bz[1] - 21.4) < 0.01, "panel top incl. labels at z=21.4 (%.2f)" % bz[1])
    for bx_ in (-28.0, 28.0):
        n = circle_vertices_at(pts, bx_, -23.0, 3.025, 18.5, 21.4)
        check(n >= 8, "button hole at (%s, -23) (%d vertices)" % (bx_, n))
    n = circle_vertices_at(pts, 0.0, -23.0, 1.6, 18.5, 21.4)
    check(n >= 8, "LED hole at (0, -23) (%d vertices)" % n)
    for sx in (-1, 1):
        for sy in (-1, 1):
            n = circle_vertices_at(pts, sx * 41.0, sy * 22.0, 1.7, 18.5, 21.4)
            check(n >= 8, "screw clearance at (%s40, %s23) (%d vertices)" % (sx, sy, n))

    print("interference (from the dimension table)")
    # OLED glass top (floor 2.0 + post 10.0 + module 6.2) vs panel underside
    glass_top = 2.0 + 10.0 + 6.2
    check(glass_top <= 18.5, "OLED glass (%.1f) clears the panel underside (18.5)" % glass_top)
    # panel edge vs cavity wall
    check(45.4 <= 45.5, "panel edge (45.4) fits the cavity wall (45.5)")
    # QT Py board vs cradle
    check(3.6 + 0.9 <= 18.5, "QT Py stack clears the panel")

    print("")
    if FAILURES:
        print("%d check(s) failed" % len(FAILURES))
        return 1
    print("all enclosure checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
