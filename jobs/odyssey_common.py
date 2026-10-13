"""Shared helpers for Odyssey ingestion jobs (a plain module, imported by job notebooks)."""
import time
import urllib.request

USER_AGENT = "OdysseyPlatform/0.1 (https://aakashmanandhar.tech/odyssey)"


def http_get(url, accept="application/json", attempts=4, timeout=30, backoff_seconds=20):
    """GET with retries and linear backoff. Returns (status, body) or (None, None) after the last attempt."""
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read().decode("utf-8")
        except Exception as e:
            print(f"    attempt {attempt}/{attempts} failed: {type(e).__name__}: {str(e)[:120]}")
            if attempt == attempts:
                return None, None
            time.sleep(backoff_seconds * attempt)
