"""pr-reviewer/verify_vendor.py fails closed (AWS Continuum findings, 2026-11-06).

Each test copies the vendored bundle to a temporary root, breaks the manifest
or the tree one way, and runs the real checker there. Standard library only.
"""
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class CodeOwnersTests(unittest.TestCase):
    def test_codeowners_names_an_owner_for_the_vendored_rules_and_frozen_files(self):
        # One file at the root: GitHub and GitLab both read it there. The public
        # bundle runs this test too, so it also proves the bundle ships the file.
        lines = [line.split() for line in (ROOT / "CODEOWNERS").read_text().splitlines()
                 if line.strip() and not line.startswith("#")]
        owners = {path: rest for path, *rest in lines}
        # No GitLab-only sections, required or optional.
        self.assertFalse([line for line in lines if line[0].startswith(("[", "^["))])
        for path in ("/.reviewer.yaml", "/pr-reviewer/", "/.github/",
                     "/threat-model/boundaries.yaml", ".gitattributes", "/CODEOWNERS"):
            self.assertEqual(owners.get(path), ["@aws-samples/sample-agentic-cicd"], path)
        self.assertFalse((ROOT / ".github/CODEOWNERS").exists())


class IsolatedPythonTests(unittest.TestCase):
    """Every Python call in the workflow runs `python -I`, so no checkout file is imported."""

    # The tests job runs the change's own tests by design, with read-only
    # permissions and no AWS access; nothing it writes feeds the trusted jobs.
    HEAD_TESTS = "run: python -m unittest discover -s tests -p 'test_*.py' -v"
    CALL = re.compile(r'(?:^|[\s;&|(`])["\']?((?:[\w.${}/-]*/)?(?:python3?|pip3?))["\']?(?=[\s;)]|$)')

    def test_every_workflow_python_call_is_isolated(self):
        workflows = sorted((ROOT / ".github/workflows").glob("*.yml"))
        self.assertTrue(workflows)
        seen = 0
        for workflow in workflows:
            for number, line in enumerate(workflow.read_text().splitlines(), 1):
                if line.strip() == self.HEAD_TESTS:
                    continue
                for match in self.CALL.finditer(line):
                    if line[:match.start(1)].rstrip(" \"'").endswith(" -m"):
                        continue          # `python -I -m pip`: the python call is checked
                    seen += 1
                    word = match.group(1).rsplit("/", 1)[-1]
                    rest = line[match.end():].lstrip()
                    if word.startswith("pip"):    # a pip run, not an argument named pip
                        ok = not re.match(r"(install|download|wheel|uninstall)\b", rest)
                    else:
                        ok = rest.startswith("-I ")
                    self.assertTrue(ok, f"{workflow.name}:{number}: {line.strip()}")
        self.assertGreater(seen, 10)


class VerifyVendorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / "pr-reviewer", self.tmp / "pr-reviewer",
                        ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copy(ROOT / ".reviewer.yaml", self.tmp / ".reviewer.yaml")
        self.manifest = self.tmp / "pr-reviewer" / "VENDOR_MANIFEST.yaml"

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_check(self):
        return subprocess.run(
            [sys.executable, "-I", str(self.tmp / "pr-reviewer" / "verify_vendor.py")],
            capture_output=True, text=True, timeout=60)

    def assert_fails(self, reason):
        result = self.run_check()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn(reason, result.stdout)

    def test_the_shipped_bundle_passes(self):
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("VENDOR CHECK: PASS", result.stdout)

    def test_an_empty_file_list_fails(self):
        text = self.manifest.read_text()
        self.manifest.write_text(text[:text.index("files:") + len("files:")] + "\n")
        self.assert_fails("not in manifest: pr-reviewer/review_pr.py")

    def test_a_file_the_manifest_does_not_name_fails(self):
        (self.tmp / "pr-reviewer" / "reviewer" / "extra.py").write_text("print('x')\n")
        self.assert_fails("not in manifest: pr-reviewer/reviewer/extra.py")

    def test_a_reformatted_manifest_fails(self):
        # Flow style is valid YAML, but no longer lists the files line by line.
        text = self.manifest.read_text()
        entries = re.findall(r"^  (\S+): ([0-9a-f]{64})$", text, re.M)
        head = text[:text.index("files:")]
        self.manifest.write_text(head + "files: {" + ", ".join(f"{k}: {v}" for k, v in entries)
                                 + "}\n")
        self.assert_fails("not in manifest")

    def test_a_short_or_missing_source_commit_fails(self):
        text = self.manifest.read_text()
        self.manifest.write_text(re.sub(r"(?m)^source_commit: .*$", "source_commit: 939d87e", text))
        self.assert_fails("source_commit is not a full 40-character commit SHA")

    def test_an_edited_file_still_fails(self):
        path = self.tmp / "pr-reviewer" / "deterministic" / "checks.py"
        path.write_text(path.read_text() + "\n# edited\n")
        self.assert_fails("modified: pr-reviewer/deterministic/checks.py")

    def test_bytecode_and_symlinks_in_the_bundle_fail(self):
        # Continuum, 2026-11-07: __pycache__ was skipped, so an unhashed .pyc
        # could run while the check printed PASS.
        cache = self.tmp / "pr-reviewer" / "reviewer" / "__pycache__"
        cache.mkdir()
        (cache / "chunked.cpython-312.pyc").write_bytes(b"\x00bytecode")
        self.assert_fails("bytecode cache in the bundle: pr-reviewer/reviewer/__pycache__")
        shutil.rmtree(cache)
        (self.tmp / "pr-reviewer" / "reviewer" / "rules.pyc").write_bytes(b"\x00")
        self.assert_fails("bytecode in the bundle: pr-reviewer/reviewer/rules.pyc")
        (self.tmp / "pr-reviewer" / "reviewer" / "rules.pyc").unlink()
        (self.tmp / "pr-reviewer" / "link.py").symlink_to(self.tmp / ".reviewer.yaml")
        self.assert_fails("symlink in the bundle: pr-reviewer/link.py")


if __name__ == "__main__":
    unittest.main()
