"""Fast unit checks for the artifact, without network or AWS credentials."""
import json
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
import handler


class HandlerTests(unittest.TestCase):
    def test_smoke_is_successful_json(self):
        response = handler.lambda_handler({"smoke": True}, None)
        self.assertEqual(response["statusCode"], 200)
        self.assertTrue(json.loads(response["body"])["smoke"])

    def test_http_response_contains_troy_and_visible_release(self):
        with patch.dict("os.environ", {"AWS_LAMBDA_FUNCTION_VERSION": "42",
                                     "DEMO_REVISION": "a" * 40}):
            response = handler.lambda_handler({"requestContext": {"http": {}}}, None)
        self.assertEqual(response["statusCode"], 200)
        self.assertIn("text/html", response["headers"]["content-type"])
        self.assertIn("THE FALL OF TROY", response["body"])
        self.assertIn("Release version 42", response["body"])
        self.assertEqual(response["headers"]["x-demo-version"], "42")
        self.assertEqual(response["headers"]["x-demo-revision"], "a" * 40)
        self.assertIn("revision " + "a" * 12, response["body"])

    def test_fault_drill_requires_direct_invocation(self):
        with patch.object(handler, "DEMO_FAULT_ENABLED", True):
            response = handler.lambda_handler(
                {"requestContext": {"http": {}}, "demo_fault_probe": True}, None
            )
        self.assertEqual(response["statusCode"], 200)

    def test_controlled_fault_generates_a_lambda_error(self):
        with patch.object(handler, "DEMO_FAULT_ENABLED", True):
            with self.assertRaisesRegex(RuntimeError, "Controlled"):
                handler.lambda_handler({"demo_fault_probe": True}, None)

    def test_healthy_probe(self):
        with patch.object(handler, "DEMO_FAULT_ENABLED", False):
            response = handler.lambda_handler({"demo_fault_probe": True}, None)
        self.assertEqual(json.loads(response["body"])["probe"], "healthy")


    def test_visitor_dedication_is_rendered_as_text(self):
        """Visitor markup-like input must remain encoded text in the response."""
        value = "<b>visitor</b>"
        response = handler.lambda_handler({
            "requestContext": {"http": {}},
            "queryStringParameters": {"dedication": value},
        }, None)
        self.assertIn("&lt;b&gt;visitor&lt;/b&gt;", response["body"])
        self.assertNotIn(value, response["body"])

    def test_visitor_dedication_length_is_bounded(self):
        """Bound user-visible dedication text to the feature's 120-character limit."""
        response = handler.lambda_handler({
            "requestContext": {"http": {}},
            "queryStringParameters": {"dedication": "V" * 200},
        }, None)
        self.assertIn("V" * 120, response["body"])
        self.assertNotIn("V" * 121, response["body"])


if __name__ == "__main__":
    unittest.main()
