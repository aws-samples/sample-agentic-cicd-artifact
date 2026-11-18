"""Static-file routes, request hardening and the invocation contracts.

Standard library only, no network or AWS credentials, like test_handler.py.
"""
import base64
import importlib.util
import json
import os
import pathlib
import posixpath
import random
import re
import sys
import tempfile
import unittest
import urllib.parse
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import arcade  # noqa: E402
import handler  # noqa: E402

SITE = ROOT / "src" / "site"
ENV = {"AWS_LAMBDA_FUNCTION_VERSION": "42", "DEMO_REVISION": "b" * 40}
SCORE = "/assets/score.mp3"
SCORE_SIZE = (SITE / "assets" / "score.mp3").stat().st_size
OK_STATUSES = {200, 206, 404, 405, 416}
LAMBDA_RESPONSE_LIMIT = 6 * 1024 * 1024   # bytes, synchronous invocation


def http(path=None, method="GET", headers=None, query=None):
    """An HTTP API (payload 2.0) event shaped the way API Gateway builds it.

    API Gateway always sends rawQueryString ("" when there is none) and adds
    queryStringParameters only when there is a query string.
    """
    event = {"version": "2.0", "requestContext": {"http": {"method": method}},
             "rawQueryString": ""}
    if path is not None:
        event["rawPath"] = path
    if headers is not None:
        event["headers"] = headers
    if query is not None:
        event["queryStringParameters"] = query
        event["rawQueryString"] = urllib.parse.urlencode(query)
    return event


def call(event):
    """Invoke the handler the way the live alias would, with a fixed release."""
    with patch.dict(os.environ, ENV):
        return handler.lambda_handler(event, None)


def payload(response):
    """The bytes API Gateway would put on the wire for this response."""
    if response.get("isBase64Encoded"):
        return base64.b64decode(response["body"], validate=True)
    return response["body"].encode("utf-8")


def max_age(cache_control):
    """The max-age of a Cache-Control value (0 when absent)."""
    match = re.search(r"max-age=(\d+)", cache_control)
    return int(match.group(1)) if match else 0


class AllowlistTests(unittest.TestCase):
    def test_allowlist_is_every_packaged_file_except_the_document(self):
        packaged = {"/" + p.relative_to(SITE).as_posix() for p in SITE.rglob("*")
                    if p.is_file() and not p.name.startswith(".")}
        self.assertEqual(set(handler.SITE), packaged - {"/index.html"})
        self.assertEqual(len(handler.SITE), 40)
        for url in handler.SITE:
            self.assertFalse(url.endswith((".html", ".py")), url)

    def test_development_files_are_not_published(self):
        for rel in ("lab.html", "js/lab.js", "js/tests"):
            self.assertFalse((SITE / rel).exists(), rel)
        self.assertFalse(any(p.is_symlink() for p in SITE.rglob("*")))

    def test_every_reference_the_page_makes_is_allowlisted(self):
        """The document, its style sheet and every module reach only listed files."""
        refs = {}
        index = (SITE / "index.html").read_text(encoding="utf-8")
        refs["/index.html"] = re.findall(r'(?:src|href)="(\./[^"]+)"', index)
        css = (SITE / "style.css").read_text(encoding="utf-8")
        refs["/style.css"] = re.findall(r"url\(([^)'\"]+)\)", css)
        for module in SITE.rglob("*.js"):
            text = module.read_text(encoding="utf-8")
            refs["/" + module.relative_to(SITE).as_posix()] = re.findall(
                r"""(?:from|import)\s*\(?\s*['"](\.{1,2}/[^'"]+)['"]|['"](\./shots/[^'"]+\.js)['"]""",
                text)
        seen = 0
        for referrer, found in refs.items():
            for ref in found:
                ref = next(r for r in ref if r) if isinstance(ref, tuple) else ref
                # A query string on a file URL gets a 404 (see QueryStringTests).
                self.assertNotIn("?", ref, f"{referrer} -> {ref}")
                url = posixpath.normpath(posixpath.join(posixpath.dirname(referrer), ref))
                self.assertIn(url, handler.SITE, f"{referrer} -> {ref}")
                seen += 1
        self.assertGreater(seen, 100)
        for entry in ("/js/main.js", "/style.css", SCORE,
                      "/assets/fonts/cormorant.woff2", "/assets/fonts/dm-sans.woff2"):
            self.assertIn(entry, handler.SITE)

    def test_licences_ship_beside_the_fonts(self):
        for font, licence in (("cormorant", "Cormorant"), ("dm-sans", "DM Sans")):
            text = payload(call(http(f"/assets/fonts/{font}-OFL.txt"))).decode()
            self.assertIn("SIL OPEN FONT LICENSE Version 1.1", text)
            self.assertIn(licence, text)
        notice = payload(call(http("/NOTICE"))).decode()
        self.assertIn("VSCO 2 Community Edition", notice)
        self.assertIn("CC0", notice)


class LoadSiteTests(unittest.TestCase):
    """The start-up allowlist and its guard, on trees the package never ships."""

    LISTED = {
        "js/a.js": b"export const a = 1;\n",
        "js/shots/b-c_d.1.js": b"export {};\n",
        "style.css": b"body {}\n",
        "assets/score.mp3": b"ID3",
        "assets/fonts/f.woff2": b"wOF2",
        "assets/fonts/f-OFL.txt": b"licence\n",
        "NOTICE": b"notice\n",
    }
    SKIPPED = {
        "index.html": b"<!doctype html>",         # the document's template
        "lab.html": b"<!doctype html>",
        "x.py": b"SECRET = 1\n",
        "README": b"SECRET\n",
        "notes.md": b"SECRET\n",
        "js/old.js.bak": b"SECRET\n",
        ".secret.js": b"SECRET\n",
        ".git/config": b"SECRET\n",
        "js/.hidden/inner.js": b"SECRET\n",
        "has space.js": b"SECRET\n",
        "js/50%.js": b"SECRET\n",
        "js/a~b.js": b"SECRET\n",
    }

    def build(self, tmp):
        root = pathlib.Path(tmp, "site")
        for rel, data in {**self.LISTED, **self.SKIPPED}.items():
            (root / rel).parent.mkdir(parents=True, exist_ok=True)
            (root / rel).write_bytes(data)
        outside = pathlib.Path(tmp, "handler.py")
        outside.write_bytes(b"SECRET = 2\n")
        try:
            os.symlink(outside, root / "js" / "link.js")          # a file outside the site
            os.symlink("../handler.py", root / "linked.css")      # the same, relative
            os.symlink(root / "missing.js", root / "dangling.js")
            os.symlink(root / "js", root / "alias")                # a directory
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"symlinks unavailable: {exc}")
        return root

    def test_only_plain_files_of_known_types_are_listed(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = handler.load_site(self.build(tmp))
        self.assertEqual(set(site), {"/" + rel for rel in self.LISTED})
        for rel, data in self.LISTED.items():
            self.assertEqual(site["/" + rel].data, data, rel)
        self.assertEqual(site["/js/a.js"], handler.Asset(
            "text/javascript; charset=utf-8", handler.TEXT_CACHE, self.LISTED["js/a.js"]))
        self.assertFalse(any(b"SECRET" in asset.data for asset in site.values()))

    def test_a_site_without_its_entry_module_fails_at_start_up(self):
        for site in ({}, {"/style.css": handler.SITE["/style.css"]}):
            with self.subTest(site=list(site)):
                with self.assertRaisesRegex(RuntimeError, "static site missing"):
                    handler.require_site(site, SITE)
        site = {handler.ENTRY_MODULE: handler.SITE[handler.ENTRY_MODULE]}
        self.assertIs(handler.require_site(site, SITE), site)
        self.assertIs(handler.require_site(handler.SITE, SITE), handler.SITE)

    def test_importing_the_handler_without_its_site_raises(self):
        """What the PreTraffic smoke invoke meets if src/site/ is not packaged."""
        with tempfile.TemporaryDirectory() as tmp:
            copy = pathlib.Path(tmp, "handler.py")
            copy.write_bytes((ROOT / "src" / "handler.py").read_bytes())
            spec = importlib.util.spec_from_file_location("handler_without_site", copy)
            module = importlib.util.module_from_spec(spec)
            with self.assertRaisesRegex(RuntimeError, "static site missing"):
                spec.loader.exec_module(module)


class StaticFileTests(unittest.TestCase):
    TYPES = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
             ".woff2": "font/woff2", ".mp3": "audio/mpeg",
             ".txt": "text/plain; charset=utf-8", "": "text/plain; charset=utf-8"}

    def test_every_file_is_served_whole_as_base64_with_its_type(self):
        for url in handler.SITE:
            with self.subTest(url=url):
                response = call(http(url))
                self.assertEqual(response["statusCode"], 200)
                self.assertIs(response["isBase64Encoded"], True)
                self.assertEqual(payload(response), (SITE / url[1:]).read_bytes())
                headers = response["headers"]
                self.assertEqual(headers["content-type"],
                                 self.TYPES[pathlib.PurePosixPath(url).suffix])
                self.assertEqual(headers["accept-ranges"], "bytes")
                self.assertTrue(headers["cache-control"].startswith("public"))
                self.assertGreater(max_age(headers["cache-control"]), 0)
                self.assertNotIn("content-range", headers)

    def test_entry_points_have_the_types_browsers_enforce(self):
        expected = {"/js/main.js": "text/javascript; charset=utf-8",
                    "/js/shots/s01-coast.js": "text/javascript; charset=utf-8",
                    "/style.css": "text/css; charset=utf-8",
                    "/assets/fonts/cormorant.woff2": "font/woff2",
                    SCORE: "audio/mpeg"}
        for url, content_type in expected.items():
            self.assertEqual(call(http(url))["headers"]["content-type"], content_type)

    def test_responses_say_which_build_answered_and_forbid_sniffing(self):
        for event in (http("/js/main.js"), http("/missing"), http("/js/main.js", "POST"),
                      http(SCORE, headers={"range": f"bytes={SCORE_SIZE}-"})):
            headers = call(event)["headers"]
            self.assertEqual(headers["x-content-type-options"], "nosniff")
            # Every file and error response, too (Continuum, 2026-11-07).
            self.assertEqual(headers["strict-transport-security"],
                             "max-age=31536000; includeSubDomains")
            self.assertEqual(headers["x-demo-version"], "42")
            self.assertEqual(headers["x-demo-revision"], "b" * 40)

    def test_head_mirrors_get_and_ignores_range(self):
        for url in ("/js/main.js", SCORE):
            get = call(http(url))
            self.assertEqual(call(http(url, "HEAD")), get)
            self.assertEqual(call(http(url, "HEAD", {"range": "bytes=0-1"})), get)

    def test_text_assets_cache_briefly(self):
        for url in ("/js/main.js", "/style.css", "/NOTICE"):
            self.assertLessEqual(max_age(call(http(url))["headers"]["cache-control"]), 60)

    def test_every_response_fits_the_lambda_response_limit(self):
        """Serialised as the runtime does, each response stays under 6 MB."""
        largest = 0
        for url in list(handler.SITE) + ["/", "/missing"]:
            for event in (http(url), http(url, headers={"range": "bytes=0-"})):
                response = call(event)
                for blob in (json.dumps(response).encode("ascii"),
                             json.dumps(response, ensure_ascii=False).encode("utf-8")):
                    largest = max(largest, len(blob))
                    self.assertLess(len(blob), LAMBDA_RESPONSE_LIMIT, url)
        self.assertGreater(largest, SCORE_SIZE)


class QueryStringTests(unittest.TestCase):
    """A file URL never carries a query string: each one would miss the edge cache."""

    def assert_not_found(self, response):
        self.assertEqual(response["statusCode"], 404)
        self.assertEqual(response["body"], "Not Found\n")
        self.assertEqual(response["headers"]["cache-control"], "no-store")
        self.assertEqual(response["headers"]["content-type"], "text/plain; charset=utf-8")
        self.assertNotIn("isBase64Encoded", response)

    def test_files_requested_with_a_query_string_are_plain_404s(self):
        for url in handler.SITE:
            for method in ("GET", "HEAD"):
                with self.subTest(url=url, method=method):
                    self.assert_not_found(call(http(url, method, query={"cb": "1"})))
        self.assert_not_found(call(http(SCORE, headers={"range": "bytes=0-1"},
                                        query={"cb": "1"})))
        self.assert_not_found(call(http(SCORE, headers={"range": f"bytes={SCORE_SIZE}-"},
                                        query={"cb": "1"})))

    def test_every_form_of_query_string_counts(self):
        for extra in ({"rawQueryString": "cb=1"}, {"queryStringParameters": {"cb": "1"}},
                      {"rawQueryString": "&"}, {"rawQueryString": "="},
                      {"rawQueryString": "x"}, {"rawQueryString": "cb=" + "9" * 5000},
                      {"queryStringParameters": {"": ""}}, {"rawQueryString": 7},
                      {"rawQueryString": ["cb"]}, {"queryStringParameters": "cb=1"},
                      {"queryStringParameters": ["cb"]}):
            with self.subTest(extra=str(extra)[:60]):
                self.assert_not_found(call({**http(SCORE), **extra}))

    def test_an_empty_query_string_is_no_query_string(self):
        for extra in ({}, {"rawQueryString": ""}, {"rawQueryString": None},
                      {"queryStringParameters": None}, {"queryStringParameters": {}},
                      {"rawQueryString": "", "queryStringParameters": {}}):
            with self.subTest(extra=extra):
                event = {**http("/js/main.js"), **extra}
                if "rawQueryString" not in extra:
                    del event["rawQueryString"]
                response = call(event)
                self.assertEqual(response["statusCode"], 200)
                self.assertEqual(payload(response), (SITE / "js" / "main.js").read_bytes())

    def test_unknown_paths_with_a_query_string_are_still_404s(self):
        for path in ("/missing", "/js/../handler.py", "/js/main.js%3Fcb=1"):
            with self.subTest(path=path):
                self.assert_not_found(call(http(path, query={"cb": "1"})))

    def test_other_methods_still_get_405_with_a_query_string(self):
        response = call(http("/js/main.js", "POST", query={"cb": "1"}))
        self.assertEqual(response["statusCode"], 405)

    def test_the_document_still_takes_query_strings(self):
        for query in ({"auto": "1"}, {"cb": "1"}, {"dedication": "hi"},
                      {"reduced": "1", "upload": "worker"}, {"audio": "element"}):
            for path in ("/", "/index.html"):
                with self.subTest(path=path, query=query):
                    response = call(http(path, query=query))
                    self.assertEqual(response["statusCode"], 200)
                    self.assertEqual(response["headers"]["content-type"],
                                     "text/html; charset=utf-8")
                    self.assertIn("THE FALL OF TROY", response["body"])


class RangeTests(unittest.TestCase):
    DATA = (SITE / "assets" / "score.mp3").read_bytes()

    def ranged(self, value, name="range"):
        return call(http(SCORE, headers={name: value}))

    def test_single_ranges_return_206(self):
        size = SCORE_SIZE
        cases = {
            "bytes=0-1": (0, 1),                    # WebKit's first probe
            "bytes=0-": (0, size - 1),              # Chromium's media request
            "bytes=1000-": (1000, size - 1),
            "bytes=-500": (size - 500, size - 1),
            "bytes=10-10": (10, 10),
            f"bytes=0-{size + 1000}": (0, size - 1),
            "bytes=-99999999": (0, size - 1),
            "bytes=0-" + "9" * 40: (0, size - 1),
            "BYTES=2-3": (2, 3),
            " bytes=4-7 ": (4, 7),
            "bytes=0012-0013": (12, 13),
        }
        for value, (first, last) in cases.items():
            with self.subTest(range=value):
                response = self.ranged(value)
                self.assertEqual(response["statusCode"], 206)
                self.assertIs(response["isBase64Encoded"], True)
                self.assertEqual(response["headers"]["content-range"],
                                 f"bytes {first}-{last}/{size}")
                self.assertEqual(response["headers"]["accept-ranges"], "bytes")
                self.assertEqual(response["headers"]["content-type"], "audio/mpeg")
                self.assertEqual(payload(response), self.DATA[first:last + 1])

    def test_unsatisfiable_ranges_return_416(self):
        size = SCORE_SIZE
        for value in (f"bytes={size}-", f"bytes={size + 5}-{size + 9}", "bytes=-0",
                      "bytes=" + "9" * 40 + "-", "bytes=" + "9" * 5000 + "-"):
            with self.subTest(range=value[:40]):
                response = self.ranged(value)
                self.assertEqual(response["statusCode"], 416)
                self.assertEqual(response["headers"]["content-range"], f"bytes */{size}")
                self.assertEqual(response["headers"]["content-type"],
                                 "text/plain; charset=utf-8")
                self.assertEqual(response["headers"]["cache-control"], "no-store")

    def test_malformed_or_multiple_ranges_get_the_whole_file(self):
        for value in ("", "bytes", "bytes=", "bytes=-", "bytes=abc", "bytes=5-1",
                      "bytes=0-1,4-5", "bytes=0-1, 4-5", "items=0-1", "bytes=1-2-3",
                      "bytes=0x10-", "bytes=\uff11-\uff12", "bytes=1_0-20", "bytes=+1-2",
                      "bytes 0-1", "=0-1", "bytes=0-1;", 5, None, ["bytes=0-1"]):
            with self.subTest(range=value):
                response = self.ranged(value)
                self.assertEqual(response["statusCode"], 200)
                self.assertEqual(payload(response), self.DATA)

    def test_if_range_sends_the_whole_file(self):
        response = call(http(SCORE, headers={"range": "bytes=0-1", "if-range": '"v1"'}))
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(payload(response), self.DATA)

    def test_header_names_match_case_insensitively(self):
        self.assertEqual(self.ranged("bytes=0-1", "Range")["statusCode"], 206)
        self.assertEqual(self.ranged("bytes=0-1", "RANGE")["statusCode"], 206)

    def test_ranges_apply_to_every_file(self):
        response = call(http("/js/main.js", headers={"range": "bytes=0-1"}))
        self.assertEqual(response["statusCode"], 206)
        self.assertEqual(payload(response), (SITE / "js" / "main.js").read_bytes()[:2])

    def test_byte_range_parser(self):
        self.assertEqual(handler.byte_range("bytes=0-0", 1), (0, 0))
        self.assertEqual(handler.byte_range("bytes=-1", 1), (0, 0))
        self.assertEqual(handler.byte_range("bytes=0-", 0), handler.UNSATISFIABLE)
        self.assertEqual(handler.byte_range("bytes=-1", 0), handler.UNSATISFIABLE)
        self.assertIsNone(handler.byte_range(None, 10))
        self.assertIsNone(handler.byte_range("bytes=-", 10))


class RouteTests(unittest.TestCase):
    def test_document_routes_serve_the_illustrated_edition(self):
        expected = (SITE / "index.html").read_text(encoding="utf-8").replace(
            "<!--RELEASE_VERSION-->", f"Release version 42 · revision {'b' * 12}")
        for event in (http(), http("/"), http("/index.html"), http(""),
                      {"requestContext": {"http": {}}}):
            with self.subTest(event=event):
                response = call(event)
                self.assertEqual(response["statusCode"], 200)
                self.assertEqual(response["body"], expected)
                self.assertNotIn("isBase64Encoded", response)
                self.assertEqual(response["headers"], {
                    "content-type": "text/html; charset=utf-8",
                    "cache-control": "public, max-age=5",
                    "x-demo-version": "42",
                    "x-demo-revision": "b" * 40,
                    "content-security-policy": handler.CONTENT_SECURITY_POLICY,
                    "x-content-type-options": "nosniff",
                    "referrer-policy": "strict-origin-when-cross-origin",
                    "strict-transport-security": "max-age=31536000; includeSubDomains",
                })

    def test_document_head_mirrors_get(self):
        self.assertEqual(call(http("/", "HEAD")), call(http("/")))

    def test_unknown_paths_are_plain_404s(self):
        for path in ("/missing", "/js", "/js/", "/assets/", "/index.htm", "/INDEX.HTML",
                     "/index.html/", "/js/main.js/", "/JS/MAIN.JS", "/favicon.ico",
                     "/lab.html", "/js/lab.js", "/js/tests/A-gate.js", "/site/js/main.js",
                     "/handler.py", "/arcade.py", "/db.py", "/src/handler.py",
                     "/.git/config", "/js/main.js%3Fv=1", "/" + "a" * 100_000):
            with self.subTest(path=path[:60]):
                response = call(http(path))
                self.assertEqual(response["statusCode"], 404)
                self.assertEqual(response["body"], "Not Found\n")
                self.assertEqual(response["headers"]["content-type"],
                                 "text/plain; charset=utf-8")
                self.assertEqual(response["headers"]["cache-control"], "no-store")
                self.assertNotIn("isBase64Encoded", response)

    def test_traversal_spellings_never_reach_a_file(self):
        absolute = [str(ROOT / "src" / "handler.py"), str(SITE / "js" / "main.js"),
                    str(SITE / "NOTICE"), "/etc/passwd", "/proc/self/environ",
                    "/var/task/handler.py"]
        spellings = [
            "/../handler.py", "/js/../handler.py", "/js/../style.css", "/js/../../db.py",
            "/./js/main.js", "/js/./main.js", "/js/shots/../main.js",
            "/%2e%2e/handler.py", "/js/%2e%2e/%2e%2e/handler.py", "/js/%2E%2E/style.css",
            "/%2e%2e%2fhandler.py", "/..%2fhandler.py", "/js/%6dain.js", "/%2Fjs/main.js",
            "/js%2fmain.js", "/%252e%252e/handler.py",
            "//", "//js/main.js", "/js//main.js", "///etc/passwd",
            "/js\\main.js", "\\js\\main.js", "/js/..\\..\\handler.py", "\\..\\handler.py",
            "/js/main.js\x00", "/js/main.js%00", "/js/main.js\x00.css", "\x00",
            "js/main.js", "./js/main.js", "../handler.py", "/js/main.js ",
            "/js/\uff4dain.js", "/js/main\u2024js", "/\ud800", "/js/main.js#x",
        ]
        for path in absolute + spellings:
            with self.subTest(path=path):
                response = call(http(path))
                self.assertEqual(response["statusCode"], 404)
                self.assertEqual(response["body"], "Not Found\n")

    def test_only_get_and_head_are_allowed(self):
        for method in ("POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE", "CONNECT",
                       "get", "Head", "GET ", "PROPFIND", 5, ["GET"]):
            for path in ("/js/main.js", "/", "/missing"):
                with self.subTest(method=method, path=path):
                    response = call(http(path, method))
                    self.assertEqual(response["statusCode"], 405)
                    self.assertEqual(response["headers"]["allow"], "GET, HEAD")
                    self.assertEqual(response["body"], "Method Not Allowed\n")

    def test_missing_or_odd_request_fields_default_to_the_document(self):
        events = [
            {"requestContext": {}}, {"requestContext": None}, {"requestContext": "x"},
            {"requestContext": []}, {"requestContext": {"http": None}},
            {"requestContext": {"http": "GET"}}, {"requestContext": {"http": {"method": None}}},
            {"requestContext": {"http": {}}, "rawPath": None},
            {"requestContext": {"http": {}}, "headers": None},
            {"requestContext": {"http": {}}, "headers": ["range"]},
            {"requestContext": {"http": {}}, "headers": {"range": None, 7: "x"}},
            {"requestContext": {"http": {}}, "queryStringParameters": None},
        ]
        for event in events:
            with self.subTest(event=event):
                response = call(event)
                self.assertEqual(response["statusCode"], 200)
                self.assertIn("THE FALL OF TROY", response["body"])

    def test_odd_field_types_on_file_requests_do_not_raise(self):
        for event in ({"requestContext": {"http": {}}, "rawPath": 7},
                      {"requestContext": {"http": {}}, "rawPath": ["/js/main.js"]},
                      http("/js/main.js", headers={"range": {"x": 1}}),
                      http("/js/main.js", headers={"if-range": 3, "range": "bytes=0-1"})):
            with self.subTest(event=event):
                self.assertIn(call(event)["statusCode"], OK_STATUSES)


class ContractTests(unittest.TestCase):
    """The rehearsal and deployment contracts the gates depend on."""

    def test_smoke_invoke_is_healthy_json_even_with_the_drill_on(self):
        with patch.object(handler, "DEMO_FAULT_ENABLED", True):
            for event in ({"smoke": True}, {"smoke": True, "requestContext": {"http": {}},
                                            "rawPath": "/js/main.js"}):
                response = call(event)
                self.assertEqual(response["statusCode"], 200)
                self.assertEqual(json.loads(response["body"]),
                                 {"message": "Troy delivery demo", "smoke": True})

    def test_direct_invocations_without_request_context_get_json(self):
        response = call({"rawPath": "/js/main.js"})
        self.assertEqual(json.loads(response["body"]), {"message": "Troy delivery demo",
                                                        "smoke": False})

    def test_probe_is_dispatched_first_and_only_without_request_context(self):
        with patch.object(handler, "DEMO_FAULT_ENABLED", True):
            with self.assertRaisesRegex(RuntimeError, "Controlled"):
                call({"demo_fault_probe": True, "smoke": True})
            response = call({"demo_fault_probe": True, "requestContext": {"http": {}},
                             "rawPath": "/js/main.js"})
            self.assertEqual(response["statusCode"], 200)
            self.assertIs(response["isBase64Encoded"], True)
        with patch.object(handler, "DEMO_FAULT_ENABLED", False):
            response = call({"demo_fault_probe": True, "smoke": True})
            self.assertEqual(json.loads(response["body"]), {"probe": "healthy"})

    def test_rehearsal_anchors_are_in_place(self):
        """patch.py edits these exact lines; the document return must come first."""
        source = (ROOT / "src" / "handler.py").read_text(encoding="utf-8")
        anchor = '    return {\n        "statusCode": 200,\n        "headers": {'
        first = source.index(anchor)
        self.assertGreater(first, source.index("def lambda_handler("))
        self.assertLess(first, source.index("\ndef ", source.index("def lambda_handler(")))
        self.assertIn('        "body": page,\n', source[first:first + 600])
        self.assertIn("\nfrom arcade import HTML\n", source)
        self.assertIn("\nfrom db import get_user", source)
        self.assertRegex(source, r"\nDEMO_FAULT_ENABLED = (False|True)\n")
        self.assertIn('    page = page.replace(DEDICATION_DEFAULT, ded[:120]) if ded else page\n',
                      source)


class PackagedDocumentTests(unittest.TestCase):
    """The illustrated page shipped here carries every hook the handler fills."""

    PAGE = (SITE / "index.html").read_text(encoding="utf-8")

    def test_document_hooks_appear_once(self):
        self.assertEqual(self.PAGE.count("<!--RELEASE_VERSION-->"), 1)
        self.assertEqual(self.PAGE.count(handler.DEDICATION_DEFAULT), 1)
        self.assertIn("THE FALL OF TROY", self.PAGE)
        self.assertIn('id="narration"', self.PAGE)

    def test_document_needs_no_inline_code_or_other_origins(self):
        self.assertNotRegex(self.PAGE, r"<script(?![^>]*\ssrc=)[^>]*>")
        self.assertNotRegex(self.PAGE, r"<style|\sstyle=|\son[a-z]+=")
        self.assertNotRegex(self.PAGE, r"https?://")


class DocumentTests(unittest.TestCase):
    """The page at '/': its security headers and the hooks the handler fills."""

    def test_policy_allows_only_what_the_page_needs(self):
        policy = call(http("/"))["headers"]["content-security-policy"]
        directives = dict((d.split()[0], d.split()[1:]) for d in policy.split("; "))
        self.assertEqual(directives, {
            "default-src": ["'none'"], "script-src": ["'self'"], "style-src": ["'self'"],
            "img-src": ["'self'", "data:"], "font-src": ["'self'"], "media-src": ["'self'"],
            "connect-src": ["'self'"], "worker-src": ["blob:"], "child-src": ["blob:"],
            "frame-src": ["'none'"], "object-src": ["'none'"], "base-uri": ["'self'"],
            "form-action": ["'none'"],
        })
        for loose in ("unsafe-", "*", "http:", "https:", "require-trusted-types-for",
                      "sandbox", "frame-ancestors", "\n", "\r"):
            self.assertNotIn(loose, policy)

    def test_page_stays_embeddable(self):
        headers = call(http("/"))["headers"]
        self.assertNotIn("x-frame-options", headers)
        self.assertNotIn("frame-ancestors", headers["content-security-policy"])

    def test_files_do_not_carry_the_document_policy(self):
        self.assertNotIn("content-security-policy", call(http("/js/main.js"))["headers"])

    def test_release_marker_is_filled_once_in_the_footer(self):
        body = call(http("/"))["body"]
        self.assertNotIn("<!--RELEASE_VERSION-->", body)
        marker = f"Release version 42 · revision {'b' * 12}"
        self.assertEqual(body.count(marker), 1)
        self.assertRegex(body, r'<div id="hud2">[^<]*' + re.escape(marker) + "</div>")

    def test_dedication_formatting_stays_in_its_paragraph(self):
        value = "<i>for Athena</i>"
        body = call(http("/", query={"dedication": value}))["body"]
        self.assertIn('<p id="dedication"><i>for Athena</i></p>', body)
        self.assertNotIn(handler.DEDICATION_DEFAULT, body)

    def test_document_loads_its_entry_module_from_the_allowlist(self):
        body = call(http("/"))["body"]
        self.assertIn('<script type="module" src="./js/main.js"></script>', body)
        self.assertIn("THE FALL OF TROY", body)
        self.assertIn('id="narration"', body)
        self.assertEqual(call(http("/js/main.js"))["headers"]["content-type"],
                         "text/javascript; charset=utf-8")

    def test_arcade_stays_the_rollback_source(self):
        """Reverting the switch must find the 16-bit page with its hooks intact."""
        self.assertIs(handler.HTML, arcade.HTML)
        self.assertEqual(arcade.HTML.count("<!--RELEASE_VERSION-->"), 1)
        self.assertEqual(arcade.HTML.count(handler.DEDICATION_DEFAULT), 1)
        self.assertIn("THE FALL OF TROY", arcade.HTML)


class HostileInputTests(unittest.TestCase):
    """Requests API Gateway can deliver must never raise: an error rolls back a canary."""

    def test_random_requests_never_raise(self):
        rng = random.Random(20261006)
        urls = list(handler.SITE) + ["/", "/index.html", "/missing", "//", "/js/../main.js"]
        methods = ["GET", "GET", "GET", "HEAD", "POST", "OPTIONS", "DELETE", "FOO"]
        alphabet = "/.%\\\x00-_aZ09~:@!$&'()*+,;= \u00e9\u202e\ud83d"
        pieces = ["bytes=", "-", ",", "0", "1", "9" * 20, " ", "=", "x", str(SCORE_SIZE)]
        for _ in range(3000):
            if rng.random() < 0.6:
                path = rng.choice(urls)
            else:
                path = "".join(rng.choice(alphabet) for _ in range(rng.randint(0, 40)))
            headers = {}
            if rng.random() < 0.7:
                headers["range"] = "".join(rng.choice(pieces) for _ in range(rng.randint(0, 6)))
            if rng.random() < 0.1:
                headers["if-range"] = "x"
            query = {"dedication": "<b>" * rng.randint(0, 50)} if rng.random() < 0.2 else None
            response = call(http(path, rng.choice(methods), headers, query))
            self.assertIn(response["statusCode"], OK_STATUSES)
            self.assertTrue(all(isinstance(k, str) and isinstance(v, str)
                                for k, v in response["headers"].items()))
            self.assertIsInstance(payload(response), bytes)


class ViewerTlsTests(unittest.TestCase):
    """The viewer certificate is never left unset (Continuum, 2026-11-07).

    A custom domain gets TLS 1.2 or later; without one the default
    *.cloudfront.net certificate is explicit, and the README says CloudFront
    then allows TLS 1.0/1.1. Standard library only, so the YAML is read as text.
    """

    def test_viewer_certificate_has_both_branches(self):
        template = (ROOT / "template.yaml").read_text()
        block = re.search(r"ViewerCertificate: !If\n((?: {10,}\S.*\n)+)", template)
        self.assertIsNotNone(block)
        self.assertIn("MinimumProtocolVersion: TLSv1.2_2021", block.group(1))
        self.assertIn("- CloudFrontDefaultCertificate: true", block.group(1))
        self.assertNotIn("AWS::NoValue", block.group(1))
        self.assertIn("TLS 1.0 and 1.1 stay possible", (ROOT / "README.md").read_text())


class ArcadeContrastTests(unittest.TestCase):
    """The rollback page's dedication lines are readable (A11Y-003, 2026-11-07).

    The page is black and these lines had no color, so they rendered black on
    black. WCAG 2.2 AA 1.4.3 asks for 4.5:1 for normal text.
    """

    @staticmethod
    def luminance(hex_color):
        def channel(c):
            c /= 255
            return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

    def test_dedication_lines_have_a_color_with_aa_contrast(self):
        css = re.search(r"<style>(.*?)</style>", arcade.HTML, re.S).group(1)
        background = re.search(r"html,body\{[^}]*background:(#[0-9a-f]{3,6})", css).group(1)
        self.assertEqual(background, "#000")
        for element in ("dedication", "visitor-dedication"):
            self.assertIn(f'id="{element}"', arcade.HTML)
            rule = re.search(rf"[^}}]*#{element}\b[^{{]*\{{([^}}]*)\}}", css)
            self.assertIsNotNone(rule, element)
            color = re.search(r"color:(#[0-9a-f]{6})", rule.group(1)).group(1)
            ratio = (self.luminance(color) + 0.05) / (self.luminance("#000000") + 0.05)
            self.assertGreaterEqual(ratio, 4.5, element)


class LabOverrideTests(unittest.TestCase):
    """The ?cl= cloud lab must stay off the deployed page (Continuum, 2026-11-06).

    On the deployed page ?cl=lobe:0 made the lobe walk in cumulusLobes() step
    by zero, so a crafted link hung the visitor's tab. A static check, because
    these tests stay standard-library only; the same probe run in Node is in the
    release evidence.
    """
    SOURCE = (SITE / "js" / "kit" / "nature.js").read_text()

    def test_cl_is_read_only_on_a_local_lab_host(self):
        lab = re.search(r"const CL_LAB = \(\(\) => \{(.*?)\n\}\)\(\);", self.SOURCE, re.S)
        self.assertIsNotNone(lab)
        hosts = re.search(r"const LAB_HOSTS = \[(.*)\];", self.SOURCE)
        self.assertEqual(re.findall(r"'([^']+)'", hosts.group(1)),
                         ["localhost", "127.0.0.1", "[::1]"])
        body = lab.group(1)
        self.assertIn("LAB_HOSTS.includes(location.hostname)", body)
        self.assertIn("lab && new URLSearchParams(location.search).get('cl')", body)
        self.assertEqual(self.SOURCE.count("get('cl')"), 1)

    def test_a_non_positive_lobe_size_returns_before_the_walk(self):
        start = self.SOURCE.index("export function cumulusLobes(")
        guard = self.SOURCE.index("if (!(R0 > 0)) return [];", start)
        self.assertLess(guard, self.SOURCE.index("while (d < total)", start))


if __name__ == "__main__":
    unittest.main()
