#!/usr/bin/env python3
"""Apply a bounded, explicit rehearsal change to this artifact.

    python patch.py aeneas       # proposed visual change; review before release
    python patch.py dedication   # deliberately unsafe PR; never deploy this
    python patch.py sanitize     # encode and bound visitor text
    python patch.py rollback-on  # operator-only controlled alarm drill
    python patch.py rollback-off # restore healthy probe behavior

Every patch asserts its anchor. Use reviewed Git commits for restoration;
never discard an existing working tree to reset a rehearsal.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
ART = ROOT / "src" / "arcade.py"
HANDLER = ROOT / "src" / "handler.py"

VULN = (
    '    ded = (event.get("queryStringParameters") or {}).get("dedication")\n'
    '    page = page.replace(DEDICATION_DEFAULT, ded) if ded else page\n'
)

FIXED = (
    '    ded = (event.get("queryStringParameters") or {}).get("dedication")\n'
    "    # A stranger's inscription. Troy read the dedication carved on the horse\n"
    "    # and believed it; interpolating it into the page as markup would repeat\n"
    "    # the mistake, so it is escaped and clamped before it goes anywhere near\n"
    "    # the document (rule SEC-003).\n"
    '    page = (page.replace(DEDICATION_DEFAULT, escape(ded[:120]))\n'
    '            if ded else page)\n'
)

DEFAULT_CONST = (
    'DEDICATION_DEFAULT = ("TO ATHENA &middot; FOR THEIR RETURN HOME &middot; "\n'
    '                      "THE GREEKS DEDICATE THIS OFFERING")\n'
)


def _sub(s: str, old: str, new: str, label: str) -> str:
    if old not in s:
        raise SystemExit(f"anchor missing for {label!r} — the artifact changed shape")
    return s.replace(old, new, 1)


def aeneas() -> None:
    """Aeneas carries Anchises out of the burning city (Aeneid II).

    Uses the same px() primitives as every other
    figure, the new caption goes through the existing caption -> aria-live
    narration path, the canvas description is updated to match what is shown,
    and the walk honours prefers-reduced-motion by standing still.
    """
    s = ART.read_text()
    s = _sub(s, "  }else if(s.kind==='aga'){", """  }else if(s.kind==='aeneas'){
    // Aeneas, with Anchises carried on his shoulders. Two figures in one
    // sprite: the father sits above the son's shoulder line, which is why his
    // pixels are drawn at a negative offset from the walking body.
    px(1,-38,6,3,'#cfc3a4');px(2,-35,4,3,'#d9a76e');px(3,-34,1,1,'#221108');
    px(0,-32,8,6,'#8b6f47');px(-2,-31,2,5,'#8b6f47');px(8,-31,2,5,'#8b6f47');
    px(1,-24,6,3,'#b5651d');px(1,-21,6,1,'#8a4a12');
    px(1,-20,6,4,'#d9a76e');px(2,-19,1,1,'#221108');
    px(0,-16,8,9,'#a0522d');px(0,-13,8,1,'#7b3f21');
    px(f?0:2,-7,3,7,'#d9a76e');px(f?5:3,-7,3,7,'#c8965f');
  }else if(s.kind==='aga'){""", "aeneas sprite")
    s = _sub(s, "let statueA=0, statueVA=0, zeusA=0;",
             "let statueA=0, statueVA=0, zeusA=0, aeneas=null;", "aeneas state")
    s = _sub(s, "    else if(phase===5){army.forEach(a=>{a.x+=a.vx});",
             """    else if(phase===5){army.forEach(a=>{a.x+=a.vx});
      // One family leaving while the city falls. Spawned once, walks off the
      // left edge, then stops moving - no per-frame allocation.
      if(!aeneas&&flames.length>8)aeneas={x:430,y:GY,sc:1.15,kind:'aeneas'};
      if(aeneas&&!REDUCED)aeneas.x-=.32;   // reduced motion: he stands, still carried""",
             "aeneas spawn")
    s = _sub(s, "    if(zeusA>0)zeus(zeusA);",
             "    if(aeneas)warrior(aeneas);\n    if(zeusA>0)zeus(zeusA);", "aeneas draw")
    s = _sub(
        s,
        "phase===5?([('TROY BURNS'),'',(zeusA>.3?'ZEUS SEES THE BROKEN GUEST-LAW':'TROY BURNS'),''][(t>>5)%4]):'';",
        "phase===5?([('TROY BURNS'),'',(zeusA>.3?'ZEUS SEES THE BROKEN GUEST-LAW':'TROY BURNS'),'',"
        "(aeneas?'AENEAS CARRIES HIS FATHER OUT':''),''][(t>>5)%6]):'';",
        "aeneas caption")
    s = _sub(s, "gate, is hauled inside, and Troy burns as Zeus looks on.",
             "gate, is hauled inside, and Troy burns as Zeus looks on while Aeneas\n"
             "                carries his father out of the city.", "aeneas aria-label")
    s = _sub(s, "  statueA=0;statueVA=0;zeusA=0;squad=[];army=[];",
             "  statueA=0;statueVA=0;zeusA=0;aeneas=null;squad=[];army=[];", "aeneas reset")
    ART.write_text(s)


def dedication() -> None:
    """Propose a deliberately unsafe visitor dedication; PR review must flag it.

    Plants SEC-003: a query-string value is interpolated straight into the
    served HTML. Deliberately in the SERVER file rather than arcade.py — Accessibility Review Agent
    does not own server code; it has no applicable presentation-file changes.
    A scoped skip is not evidence of an accessibility review.
    """
    h = HANDLER.read_text()
    if "DEDICATION_DEFAULT" not in h:
        h = _sub(h, "from arcade import HTML\n",
                 "from arcade import HTML\n\n" + DEFAULT_CONST, "dedication default")
    h = _sub(h, '    return {\n        "statusCode": 200,\n        "headers": {',
             VULN + '    return {\n        "statusCode": 200,\n        "headers": {',
             "dedication read")
    HANDLER.write_text(h)


def sanitize() -> None:
    """Escape and clamp the inscription."""
    h = HANDLER.read_text()
    h = _sub(h, VULN, FIXED, "dedication fix")
    HANDLER.write_text(h)


def rollback_on() -> None:
    """Enable only the authenticated direct-invocation fault probe."""
    HANDLER.write_text(_sub(
        HANDLER.read_text(), "DEMO_FAULT_ENABLED = False",
        "DEMO_FAULT_ENABLED = True", "enable controlled fault"))


def rollback_off() -> None:
    """Restore healthy direct-invocation probe behavior."""
    HANDLER.write_text(_sub(
        HANDLER.read_text(), "DEMO_FAULT_ENABLED = True",
        "DEMO_FAULT_ENABLED = False", "disable controlled fault"))


PATCHES = {"aeneas": aeneas, "dedication": dedication, "sanitize": sanitize,
           "rollback-on": rollback_on, "rollback-off": rollback_off}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in PATCHES:
        raise SystemExit(f"usage: {sys.argv[0]} {{{'|'.join(PATCHES)}}}")
    PATCHES[sys.argv[1]]()
    print(f"applied {sys.argv[1]}")
