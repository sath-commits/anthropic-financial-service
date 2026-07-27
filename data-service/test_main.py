import json
import unittest

import main


async def request(method, path, body=None, authorization=None):
    payload = json.dumps(body).encode() if body is not None else b""
    headers = []
    if authorization:
        headers.append((b"authorization", authorization.encode()))
    scope = {"type": "http", "method": method, "path": path, "headers": headers}
    sent = False
    messages = []

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": payload, "more_body": False}

    async def send(message):
        messages.append(message)

    await main.app(scope, receive, send)
    status = next(message["status"] for message in messages if message["type"] == "http.response.start")
    response_body = next(message["body"] for message in messages if message["type"] == "http.response.body")
    return status, json.loads(response_body)


class DataServiceSecurityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.previous_token = main.DATA_SERVICE_TOKEN
        main.DATA_SERVICE_TOKEN = "test-service-token"

    def tearDown(self):
        main.DATA_SERVICE_TOKEN = self.previous_token

    async def test_health_is_generic(self):
        status, body = await request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(body, {"status": "ok"})

    async def test_call_requires_bearer_token(self):
        status, body = await request("POST", "/call", {"method": "get_quote", "params": {"symbol": "AAPL"}})
        self.assertEqual(status, 401)
        self.assertEqual(body, {"error": "unauthorized"})

    async def test_invalid_symbol_is_rejected_before_network_access(self):
        status, body = await request(
            "POST",
            "/call",
            {"method": "get_quote", "params": {"symbol": "https://example.com"}},
            "Bearer test-service-token",
        )
        self.assertEqual(status, 400)
        self.assertEqual(body, {"error": "invalid_symbol"})

    async def test_known_method_returns_sanitized_result(self):
        previous = main.get_quote
        main.get_quote = lambda symbol: {"symbol": symbol, "price": 123.45}
        try:
            status, body = await request(
                "POST",
                "/call",
                {"method": "get_quote", "params": {"symbol": "AAPL"}},
                "Bearer test-service-token",
            )
        finally:
            main.get_quote = previous
        self.assertEqual(status, 200)
        self.assertEqual(body, {"symbol": "AAPL", "price": 123.45})


if __name__ == "__main__":
    unittest.main()
