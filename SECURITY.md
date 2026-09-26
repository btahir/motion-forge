# Security

The format is data, not code. Motion Forge validates document structure/references, generates allowlisted SVG elements, escapes text and rejects unsupported SVG import features. It is not a sandbox for executing untrusted programs.

For a suspected vulnerability, use GitHub's private vulnerability reporting for the repository once the public repository is created and that feature is enabled. Until a private reporting channel is configured, do not post exploit details or sensitive documents in a public issue. Open a minimal issue asking the maintainer to establish a private channel, without including the exploit.

Useful reports describe the affected version, an artificial minimal fixture, expected boundary, actual result and environment. Never include production credentials or private customer data. Avoid scanning or probing third-party services; this project runs locally and requires none.

Supported security maintenance scope for the initial release is the current 0.1.x line. No response-time SLA is promised. Use `parseDocument` or `parseJSON` on unknown data, validate before rendering, and apply your application's own input/body limits. Browser localStorage is not encrypted storage; do not put secrets in animation documents.
