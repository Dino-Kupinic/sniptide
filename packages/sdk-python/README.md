# Sniptide Python SDK

Install the published package:

```sh
python -m pip install sniptide
```

```python
from sniptide import SniptideClient, SniptideError
client = SniptideClient("snpt_...")
page = client.list_pastes(limit=20)
if page["nextCursor"]:
    next_page = client.list_pastes(cursor=page["nextCursor"])
created = client.create_paste({"title": "Example", "files": [{"name": "hello.py", "content": "print('hello')"}]})
```

Methods `me`, `usage`, `read_paste`, `create_paste`, `update_paste`, `update_settings`, `trash_paste`, `list_collections`, `create_collection`, and `collection_pastes` return API JSON dictionaries. Create methods accept an optional `idempotency_key`; current main ignores these keys; support requires a server version with idempotency enabled. `SniptideError` exposes `status`, `code`, and `retry_after`. Requests are not automatically retried. Set `base_url` for a self-hosted instance; HTTPS is required except on loopback. Redirects are rejected.

Environment group reads and writes return variable values, which can contain secrets. Handle responses accordingly. Listing groups returns counts, not values.

The response limit defaults to 64 MiB. Set `max_response_bytes` to a positive integer for a different limit.

## License

This package is licensed under the [MIT License](LICENSE).
