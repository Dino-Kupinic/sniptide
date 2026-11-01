# Sniptide Python SDK

Use Sniptide from Python scripts, command-line tools, and server applications. The official SDK provides access to code snippets, collections, environment variable groups, and account usage through the Sniptide REST API.

The client is synchronous, uses the Python standard library, and has no runtime dependencies. Requires Python 3.9 or later.

## Install

```sh
python -m pip install sniptide
```

## Connect your account

Create a personal API token in [Sniptide Settings](https://app.sniptide.com/settings) with the scopes your application needs. Read operations require `read`; creating or changing data requires `write`. Keep tokens out of source control and logs.

```python
import os
from sniptide import SniptideClient

client = SniptideClient(os.environ["SNIPTIDE_TOKEN"])
page = client.list_pastes(limit=20)

created = client.create_paste({
    "title": "Hello from the Python SDK",
    "files": [{"name": "hello.py", "content": 'print("hello")'}],
})
paste = created["paste"]
```

## Available operations

| Area | Methods |
| --- | --- |
| Snippets | `list_pastes`, `read_paste`, `create_paste`, `update_paste`, `update_settings`, `trash_paste` |
| Collections | `list_collections`, `create_collection`, `collection_pastes` |
| Environment variables | `list_env_groups`, `read_env_group`, `write_env_group`, `delete_env_group` |
| Account | `me`, `usage` |

Methods return the API's JSON envelopes as Python dictionaries. For example, `read_paste` returns a dictionary containing `paste`. `list_pastes` and `collection_pastes` return pages with a `nextCursor` when more results are available.

```python
if page["nextCursor"]:
    next_page = client.list_pastes(cursor=page["nextCursor"], limit=20)
```

`write_env_group` replaces a group's variables. Environment group reads and writes return values that may contain secrets. Listing groups returns counts without exposing values.

## Self-hosted instances

Set `base_url` to your instance URL. A path prefix is supported.

```python
client = SniptideClient(
    os.environ["SNIPTIDE_TOKEN"],
    base_url="https://snippets.example.com",
    timeout=30,
    max_response_bytes=64 * 1024 * 1024,
)
```

HTTPS is required except on loopback addresses. Redirects are rejected. The default request timeout is 30 seconds. The response-size limit defaults to 64 MiB; `max_response_bytes` must be a positive integer.

## Errors and retries

```python
from sniptide import SniptideError

try:
    client.me()
except SniptideError as error:
    print(error.status, error.code, error.retry_after)
    raise
```

The SDK does not retry requests automatically. `create_paste` and `create_collection` accept an optional `idempotency_key` argument. Servers with idempotency support use that key to prevent duplicate creates; older instances may ignore it. Other mutations do not gain an automatic retry guarantee.

See the [API documentation](https://docs.sniptide.com) and [source repository](https://github.com/Dino-Kupinic/sniptide/tree/main/packages/sdk-python) for more details.

## License

This package is licensed under the [MIT License](https://github.com/Dino-Kupinic/sniptide/blob/main/packages/sdk-python/LICENSE).
