"""A small client for the Sniptide token API."""
import json
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

_MAX_RESPONSE = 64 * 1024 * 1024

class SniptideError(Exception):
    def __init__(self, message, status=None, code=None, retry_after=None):
        super().__init__(message)
        self.status, self.code, self.retry_after = status, code, retry_after

class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def _segment(value):
    if not value or value in (".", ".."):
        raise ValueError("Invalid identifier")
    return quote(value, safe="")

class SniptideClient:
    def __init__(self, token, base_url="https://app.sniptide.com", timeout=30, max_response_bytes=_MAX_RESPONSE):
        url = urlsplit(base_url)
        if (url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1"))) or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError("Base URL must use HTTPS (or HTTP on loopback) and have no credentials, query or fragment")
        if not token or "\r" in token or "\n" in token:
            raise ValueError("A valid token is required")
        if isinstance(max_response_bytes, bool) or not isinstance(max_response_bytes, int) or max_response_bytes <= 0:
            raise ValueError("max_response_bytes must be a positive integer")
        self._max_response_bytes = max_response_bytes
        self._base_url = urlunsplit((url.scheme, url.netloc, url.path.rstrip("/"), "", ""))
        self._token, self._timeout = token, timeout
        self._opener = build_opener(_NoRedirect())

    def _request(self, path, method="GET", body=None, idempotency_key=None):
        headers = {"Authorization": "Bearer " + self._token, "Accept": "application/json"}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        request = Request(self._base_url + "/api/v1/" + path, data=data, headers=headers, method=method)
        try:
            response = self._opener.open(request, timeout=self._timeout)
        except HTTPError as error:
            response = error
        except (URLError, OSError) as error:
            raise SniptideError("Cannot reach Sniptide", code="network_error") from error
        with response:
            status = response.status
            retry_after = response.headers.get("Retry-After")
            if 300 <= status < 400:
                raise SniptideError("Sniptide redirected the request", status, "redirect", retry_after)
            try:
                raw = response.read(self._max_response_bytes + 1)
                if len(raw) > self._max_response_bytes:
                    raise ValueError("Response too large")
                value = json.loads(raw)
                if not isinstance(value, dict):
                    raise ValueError("Expected an object")
            except (OSError, IncompleteRead) as error:
                raise SniptideError("Cannot reach Sniptide", code="network_error") from error
            except (ValueError, UnicodeError) as error:
                raise SniptideError("Sniptide returned an invalid or oversized response", status, "invalid_response", retry_after) from error
            if status >= 400:
                raise SniptideError(value.get("message", f"HTTP {status}"), status, value.get("code"), retry_after)
            return value

    def me(self): return self._request("me")
    def usage(self): return self._request("usage")
    def list_pastes(self, **options):
        query = urlencode({key: value for key, value in options.items() if value is not None}, doseq=True)
        return self._request("pastes" + ("?" + query if query else ""))
    def read_paste(self, identifier): return self._request("pastes/" + _segment(identifier))
    def create_paste(self, capture, idempotency_key=None): return self._request("pastes", "POST", capture, idempotency_key)
    def update_paste(self, identifier, capture): return self._request("pastes/" + _segment(identifier), "PUT", capture)
    def update_settings(self, identifier, settings): return self._request("pastes/" + _segment(identifier), "PATCH", settings)
    def trash_paste(self, identifier): return self._request("pastes/" + _segment(identifier), "DELETE")
    def list_env_groups(self): return self._request("env")
    def read_env_group(self, group): return self._request("env/" + _segment(group))
    def write_env_group(self, group, variables): return self._request("env/" + _segment(group), "PUT", {"variables": variables})
    def delete_env_group(self, group): return self._request("env/" + _segment(group), "DELETE")
    def list_collections(self): return self._request("collections")
    def create_collection(self, name, idempotency_key=None): return self._request("collections", "POST", {"name": name}, idempotency_key)
    def collection_pastes(self, slug, cursor=None):
        return self._request("collections/" + _segment(slug) + "/pastes" + ("?" + urlencode({"cursor": cursor}) if cursor is not None else ""))
