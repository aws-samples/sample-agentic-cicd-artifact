"""Demo service behind the agentic gates — the thing the pipeline actually ships.

Serves THE FALL OF TROY, the illustrated edition (src/site/), through
CloudFront -> API Gateway -> this function's live alias: '/' is its page,
rendered with the release marker, and every other file comes from an
allowlist that is built when the function starts. Direct smoke invokes from
the PreTraffic hook (and the alarm-gate demo) still get JSON.
"""
import base64
import json
import os
import pathlib
import re
from html import escape
from typing import NamedTuple

from db import get_user  # noqa: F401 — deployed alongside; the vuln demo edits db.py
# The 16-bit scene is no longer the page, but it stays packaged and imported
# as the rollback source for this switch: reverting it serves arcade.HTML again.
from arcade import HTML

DEDICATION_DEFAULT = ("TO ATHENA &middot; FOR RE:INVENT 2026 &middot; "
                      "THE GREEKS DEDICATE THIS OFFERING")

# Operator-invoked, non-production rollback drill. A rehearsal commit changes
# this constant to True. Only a direct Lambda invocation with demo_fault_probe
# reaches the drill; ordinary HTTP visitor traffic does not set this field.
DEMO_FAULT_ENABLED = False

# The rendered document answers these paths (and an event without rawPath).
# Every other path is looked up, exactly as received, in SITE below.
DOCUMENT_PATHS = frozenset({"/", "/index.html"})
ALLOWED_METHODS = ("GET", "HEAD")

# What the illustrated page needs and no more: its own modules, style sheet,
# fonts, score (the <audio> element and the Web Audio fetch); data: grain
# tiles; and WebKit's readback worker, created from a blob: URL (child-src
# covers Safari before 15.5, which ignores worker-src). No inline script or
# style, and no other origin. frame-ancestors is deliberately left unset so
# slides can embed the page.
CONTENT_SECURITY_POLICY = "; ".join((
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self'",
    "connect-src 'self'",
    "worker-src blob:",
    "child-src blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
))
# The site is only served over HTTPS (CloudFront redirects HTTP), so browsers
# are told to keep using HTTPS: an on-path attacker cannot strip the redirect.
STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains"
DOCUMENT_SECURITY_HEADERS = {
    "content-security-policy": CONTENT_SECURITY_POLICY,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": STRICT_TRANSPORT_SECURITY,
}


def lambda_handler(event, context):
    """Serve the illustrated edition and its files over HTTP; JSON for smoke invokes."""
    if event.get("demo_fault_probe") and "requestContext" not in event:
        if DEMO_FAULT_ENABLED:
            raise RuntimeError("Controlled re:Invent rollback drill")
        return {"statusCode": 200, "body": json.dumps({"probe": "healthy"})}
    if event.get("smoke") or "requestContext" not in event:
        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Troy delivery demo",
                                "smoke": bool(event.get("smoke"))}),
        }
    method, path = request_line(event)
    if method not in ALLOWED_METHODS or path not in DOCUMENT_PATHS:
        return static_response(event, method, path)
    version = escape(os.environ.get("AWS_LAMBDA_FUNCTION_VERSION", "local"))
    revision = os.environ.get("DEMO_REVISION", "local")
    page = PAGE.replace(
        "<!--RELEASE_VERSION-->",
        f"Release version {version} · revision {escape(revision[:12])}",
    )
    ded = (event.get("queryStringParameters") or {}).get("dedication")
    # Visitors can style a dedication with <b> or <i>, so keep their tags.
    page = page.replace(DEDICATION_DEFAULT, ded[:120]) if ded else page
    return {
        "statusCode": 200,
        "headers": {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=5",
            "x-demo-version": os.environ.get("AWS_LAMBDA_FUNCTION_VERSION", "local"),
            "x-demo-revision": revision,
            **DOCUMENT_SECURITY_HEADERS,
        },
        "body": page,
    }


# ---------------------------------------------------------------- static files
# The illustrated edition is a static site: an HTML page, ES modules, a style
# sheet, two fonts and the score. Its files are read once, at start-up, into an
# allowlist keyed by URL path. A request path is only ever a key into that
# dict; it is never decoded, normalised or joined onto the filesystem, so no
# spelling of '..', '%2e', '//' or '\' can reach a file outside the list.

SITE_DIR = pathlib.Path(__file__).resolve().parent / "site"
ENTRY_MODULE = "/js/main.js"

# File names carry no content hash, so code and text are cached briefly;
# fonts and the score change rarely. CloudFront's MaxTTL (60 s) caps the edge
# copy either way, and its DefaultTTL of 0 means a response without a
# Cache-Control header would never be cached at all.
TEXT_CACHE = "public, max-age=60"
MEDIA_CACHE = "public, max-age=86400"
TYPES_BY_SUFFIX = {
    ".css": ("text/css; charset=utf-8", TEXT_CACHE),
    ".js": ("text/javascript; charset=utf-8", TEXT_CACHE),
    ".mp3": ("audio/mpeg", MEDIA_CACHE),
    ".txt": ("text/plain; charset=utf-8", TEXT_CACHE),
    ".woff2": ("font/woff2", MEDIA_CACHE),
}
TYPES_BY_NAME = {"NOTICE": ("text/plain; charset=utf-8", TEXT_CACHE)}
# One or more path segments of plain characters, none starting with a dot.
SAFE_URL = re.compile(r"(?:/[A-Za-z0-9_-][A-Za-z0-9._-]*)+")


class Asset(NamedTuple):
    """One allowlisted file: its response headers and its bytes."""

    content_type: str
    cache_control: str
    data: bytes


def load_site(root):
    """Read every servable file under root into a dict keyed by URL path.

    Only regular files with a known type are listed. Dot-files, symlinks and
    files of any other type are skipped; so is index.html, which is not a
    static file but the template of the rendered document (PAGE).
    """
    site = {}
    for folder, subfolders, names in os.walk(root):
        subfolders[:] = sorted(d for d in subfolders if not d.startswith("."))
        for name in sorted(names):
            path = pathlib.Path(folder, name)
            url = "/" + path.relative_to(root).as_posix()
            kind = TYPES_BY_NAME.get(name) or TYPES_BY_SUFFIX.get(path.suffix)
            if (kind and SAFE_URL.fullmatch(url)
                    and path.is_file() and not path.is_symlink()):
                site[url] = Asset(*kind, path.read_bytes())
    return site


def require_site(site, root):
    """Return site if it holds the page's entry module, else raise.

    It runs at start-up, not on a visitor's request: a package without the
    site fails the PreTraffic smoke invoke before CodeDeploy shifts any
    traffic.
    """
    if ENTRY_MODULE not in site:
        raise RuntimeError(f"static site missing from the package: {root}")
    return site


SITE = require_site(load_site(SITE_DIR), SITE_DIR)
PAGE = (SITE_DIR / "index.html").read_text(encoding="utf-8")


def request_line(event):
    """Return (method, path) of an HTTP API 2.0 event.

    A missing method or rawPath means GET '/', the shape of a bare
    requestContext event. A value of the wrong type never matches a route.
    """
    context = event.get("requestContext")
    http = context.get("http") if isinstance(context, dict) else None
    method = (http.get("method") if isinstance(http, dict) else None) or "GET"
    path = event.get("rawPath") or "/"
    return (method if isinstance(method, str) else "",
            path if isinstance(path, str) else "")


def request_header(event, name):
    """Return the value of request header `name` (lower case), or None."""
    headers = event.get("headers")
    if isinstance(headers, dict):
        for key, value in headers.items():
            if isinstance(key, str) and key.lower() == name and isinstance(value, str):
                return value
    return None


def request_has_query(event):
    """True if the request carried a query string.

    HTTP API 2.0 sends it twice, raw and parsed; a non-empty value in either
    field counts, whatever its type.
    """
    return bool(event.get("rawQueryString")) or bool(event.get("queryStringParameters"))


UNSATISFIABLE = "unsatisfiable"
BYTE_RANGE = re.compile(r"bytes=([0-9]*)-([0-9]*)", re.IGNORECASE)
# Larger than any packaged file. Longer digit strings saturate here instead of
# reaching int(), which refuses very long inputs.
HUGE = 10 ** 15


def _position(digits):
    """Parse one byte position of a Range header; '' means absent."""
    if not digits:
        return None
    digits = digits.lstrip("0") or "0"
    return HUGE if len(digits) > 15 else int(digits)


def byte_range(value, size):
    """Interpret a Range header for a file of `size` bytes (RFC 9110 14.1.2).

    Returns (first, last), inclusive, for one satisfiable range;
    UNSATISFIABLE for a well-formed range that starts at or past the end; or
    None, meaning send the whole file: no header, a malformed header, several
    ranges, or another unit. A server may always ignore Range.
    """
    match = BYTE_RANGE.fullmatch(value.strip()) if isinstance(value, str) else None
    if match is None:
        return None
    first, last = (_position(group) for group in match.groups())
    if first is None:
        if last is None:
            return None
        if last == 0 or size == 0:
            return UNSATISFIABLE
        return max(size - last, 0), size - 1
    if last is not None and last < first:
        return None
    if first >= size:
        return UNSATISFIABLE
    return first, (size - 1 if last is None else min(last, size - 1))


def _service_headers():
    """Headers on every file and error response: no sniffing, and which build answered."""
    return {
        "x-content-type-options": "nosniff",
        "strict-transport-security": STRICT_TRANSPORT_SECURITY,
        "x-demo-version": os.environ.get("AWS_LAMBDA_FUNCTION_VERSION", "local"),
        "x-demo-revision": os.environ.get("DEMO_REVISION", "local"),
    }


def _text(status, text, extra=None):
    """A short plain-text response. It never echoes anything from the request."""
    headers = {**_service_headers(), "content-type": "text/plain; charset=utf-8",
               "cache-control": "no-store", **(extra or {})}
    return {"statusCode": status, "headers": headers, "body": text}


def static_response(event, method, path):
    """Answer anything but the document: an allowlisted file, or 404 / 405 / 416.

    Every file goes back base64-encoded with isBase64Encoded, which API Gateway
    decodes. A single byte range gets 206; HEAD gets the same response as GET
    (API Gateway sends no body for HEAD), so GET and HEAD cache identically.
    """
    if method not in ALLOWED_METHODS:
        return _text(405, "Method Not Allowed\n", {"allow": "GET, HEAD"})
    # The page never puts a query string on a file URL. CloudFront keys its
    # cache on the query string, so each new one would fetch the whole file
    # from this function again (the score is about 2 MB as base64). Such a
    # request gets the same cheap 404 as an unknown path.
    asset = None if request_has_query(event) else SITE.get(path)
    if asset is None:
        return _text(404, "Not Found\n")
    size = len(asset.data)
    span = None
    # Range applies to GET only. If-Range names a validator these responses
    # never send, so it can never match: the whole file goes back instead.
    if method == "GET" and request_header(event, "if-range") is None:
        span = byte_range(request_header(event, "range"), size)
    if span == UNSATISFIABLE:
        return _text(416, "Range Not Satisfiable\n",
                     {"accept-ranges": "bytes", "content-range": f"bytes */{size}"})
    headers = {**_service_headers(), "content-type": asset.content_type,
               "cache-control": asset.cache_control, "accept-ranges": "bytes"}
    status, data = 200, asset.data
    if span is not None:
        first, last = span
        status, data = 206, asset.data[first:last + 1]
        headers["content-range"] = f"bytes {first}-{last}/{size}"
    return {"statusCode": status, "headers": headers, "isBase64Encoded": True,
            "body": base64.b64encode(data).decode("ascii")}
