import json
import unittest
from sniptide import SniptideClient, SniptideError

class ContractTest(unittest.TestCase):
    def test_all_methods(self):
        from unittest.mock import MagicMock
        client = SniptideClient("token")
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers = {}
        client._opener = MagicMock()
        client._opener.open.return_value = response
        capture = {"title": "a", "files": [{"name": "a", "content": "b"}]}
        variables = [{"name": "SECRET", "value": "value"}]
        cases = [
            (lambda: client.me(), "GET", "me", None, {"user": {"id": "1"}, "scopes": []}, None),
            (lambda: client.usage(), "GET", "usage", None, {"storageBytes": 0, "apiRequests": []}, None),
            (lambda: client.list_pastes(limit=1), "GET", "pastes?limit=1", None, {"pastes": [], "nextCursor": None}, None),
            (lambda: client.read_paste("a/b"), "GET", "pastes/a%2Fb", None, {"paste": {"id": "1"}}, None),
            (lambda: client.create_paste(capture, "key"), "POST", "pastes", capture, {"paste": {"id": "1"}}, "key"),
            (lambda: client.update_paste("a", capture), "PUT", "pastes/a", capture, {"paste": {"id": "1"}}, None),
            (lambda: client.update_settings("a", {"visibility": "private"}), "PATCH", "pastes/a", {"visibility": "private"}, {"paste": {}, "settings": {}}, None),
            (lambda: client.trash_paste("a"), "DELETE", "pastes/a", None, {"trashed": {"id": "1", "slug": "a"}}, None),
            (lambda: client.list_collections(), "GET", "collections", None, {"collections": []}, None),
            (lambda: client.create_collection("a", "key"), "POST", "collections", {"name": "a"}, {"collection": {"slug": "a", "name": "a", "pasteCount": 0}}, "key"),
            (lambda: client.collection_pastes("a", "next +"), "GET", "collections/a/pastes?cursor=next+%2B", None, {"pastes": [], "nextCursor": None}, None),
            (lambda: client.list_env_groups(), "GET", "env", None, {"groups": [{"slug": "a", "variables": 1, "createdAt": "now", "updatedAt": "now"}]}, None),
            (lambda: client.read_env_group("a"), "GET", "env/a", None, {"group": {"slug": "a", "updatedAt": "now", "variables": variables}}, None),
            (lambda: client.write_env_group("a", variables), "PUT", "env/a", {"variables": variables}, {"group": {"slug": "a", "updatedAt": "now", "variables": variables}}, None),
            (lambda: client.delete_env_group("a"), "DELETE", "env/a", None, {"ok": True}, None),
        ]
        for call, method, path, body, envelope, key in cases:
            with self.subTest(path=path, method=method):
                response.read.return_value = json.dumps(envelope).encode()
                self.assertEqual(call(), envelope)
                req = client._opener.open.call_args.args[0]
                self.assertEqual(req.get_header("Authorization"), "Bearer token")
                self.assertEqual((req.full_url, req.method, json.loads(req.data) if req.data else None, req.get_header("Idempotency-key")), ("https://app.sniptide.com/api/v1/" + path, method, body, key))

    def test_read_errors_and_limits(self):
        from http.client import IncompleteRead
        from unittest.mock import MagicMock
        client = SniptideClient("token", max_response_bytes=5)
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers = {}
        client._opener = MagicMock()
        client._opener.open.return_value = response
        for error in (TimeoutError(), OSError(), IncompleteRead(b"a")):
            response.read.side_effect = error
            with self.assertRaises(SniptideError) as caught: client.me()
            self.assertEqual(caught.exception.code, "network_error")
        response.read.side_effect = None
        response.read.return_value = b'{"a":1}'
        with self.assertRaises(SniptideError) as caught: client.me()
        self.assertEqual(caught.exception.code, "invalid_response")
        for value in (0, -1, True, 1.5):
            with self.assertRaises(ValueError): SniptideClient("token", max_response_bytes=value)
