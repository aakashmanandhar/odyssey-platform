#!/usr/bin/env python3
"""Pull the latest Odyssey JSON snapshot from a Databricks UC volume and publish it atomically.

Layout under DATA_ROOT:
  releases/<run_id>/...   verified snapshot files (last 3 kept)
  current -> releases/<run_id>   (symlink, swapped atomically)
  images/<id>-1600.<ext>, images/<id>-800.<ext>   photo cache shared by all releases
  status.json             last sync result (read by the web app's Trust page)
Environment: DATABRICKS_HOST, DATABRICKS_TOKEN, ODYSSEY_CATALOG (default odyssey), DATA_ROOT (default /srv/odyssey).
Standard library only. Exit code 0 = up to date or published; 1 = failed (site keeps serving the previous release).
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "OdysseySync/0.1 (https://aakashmanandhar.tech/odyssey)"
HOST = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
CATALOG = os.environ.get("ODYSSEY_CATALOG", "odyssey")
ROOT = os.environ.get("DATA_ROOT", "/srv/odyssey")
VOLUME = f"/Volumes/{CATALOG}/gold/exports"


def log(msg):
    print(f"{dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}", flush=True)


def http(url, headers=None, attempts=4, timeout=60):
    for i in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404):
                raise
            err = e
        except Exception as e:  # network errors, timeouts
            err = e
        if i < attempts:
            time.sleep(5 * i)
    raise err


def volume_file(rel):
    path = urllib.parse.quote(f"{VOLUME}/{rel}")
    return http(f"{HOST}/api/2.0/fs/files{path}", {"Authorization": f"Bearer {TOKEN}"})


def write_status(**fields):
    os.makedirs(ROOT, exist_ok=True)
    status = {"checked_at": dt.datetime.now(dt.timezone.utc).isoformat(), **fields}
    tmp = f"{ROOT}/status.json.tmp"
    with open(tmp, "w") as f:
        json.dump(status, f)
    os.replace(tmp, f"{ROOT}/status.json")


def collect_images(obj, found):
    if isinstance(obj, dict):
        if set(obj) >= {"id", "src"} and isinstance(obj.get("src"), str):
            found[obj["id"]] = obj["src"]
        for v in obj.values():
            collect_images(v, found)
    elif isinstance(obj, list):
        for v in obj:
            collect_images(v, found)


def cache_images(release_dir, max_images=None):
    found = {}
    for dirpath, _, files in os.walk(release_dir):
        for name in files:
            if name.endswith(".json"):
                with open(os.path.join(dirpath, name), encoding="utf-8") as f:
                    collect_images(json.load(f), found)
    img_dir = f"{ROOT}/images"
    os.makedirs(img_dir, exist_ok=True)
    new = failed = 0
    for n, (img_id, src) in enumerate(sorted(found.items())):
        if max_images is not None and n >= max_images:
            break
        ext = os.path.splitext(urllib.parse.urlparse(src).path)[1].lower() or ".jpg"
        for size, url in (("1600", src), ("800", src.replace("/1600px-", "/800px-"))):
            target = f"{img_dir}/{img_id}-{size}{ext}"
            if os.path.exists(target):
                continue
            try:
                data = http(url, attempts=3, timeout=60)
            except Exception:
                if size == "800":   # no 800px rendition: reuse the 1600px file
                    big = f"{img_dir}/{img_id}-1600{ext}"
                    if os.path.exists(big):
                        shutil.copyfile(big, target)
                        continue
                failed += 1
                continue
            with open(target + ".tmp", "wb") as f:
                f.write(data)
            os.replace(target + ".tmp", target)
            new += 1
            time.sleep(0.2)
    return len(found), new, failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-images", type=int, default=None, help="limit photo downloads (for testing)")
    ap.add_argument("--force", action="store_true", help="re-publish even if LATEST is unchanged")
    args = ap.parse_args()
    if not HOST or not TOKEN:
        log("ERROR: DATABRICKS_HOST and DATABRICKS_TOKEN must be set")
        return 1
    try:
        latest = volume_file("LATEST").decode().strip()
        current = os.path.basename(os.path.realpath(f"{ROOT}/current")) if os.path.islink(f"{ROOT}/current") else None
        if latest == current and not args.force:
            log(f"up to date ({latest})")
            write_status(ok=True, run_id=latest, changed=False)
            return 0
        manifest = json.loads(volume_file(f"snapshots/{latest}/manifest.json"))
        stage = f"{ROOT}/releases/.staging-{latest}"
        shutil.rmtree(stage, ignore_errors=True)
        for rel, meta in manifest["files"].items():
            data = volume_file(f"snapshots/{latest}/{rel}")
            if hashlib.sha256(data).hexdigest() != meta["sha256"]:
                raise ValueError(f"checksum mismatch for {rel}")
            os.makedirs(os.path.dirname(f"{stage}/{rel}"), exist_ok=True)
            with open(f"{stage}/{rel}", "wb") as f:
                f.write(data)
        with open(f"{stage}/manifest.json", "w") as f:
            json.dump(manifest, f)
        log(f"downloaded and verified {len(manifest['files'])} files of snapshot {latest}")
        images, new, failed = cache_images(stage, args.max_images)
        log(f"photos: {images} referenced, {new} newly cached, {failed} failed")
        release = f"{ROOT}/releases/{latest}"
        shutil.rmtree(release, ignore_errors=True)
        os.replace(stage, release)
        tmp_link = f"{ROOT}/current.tmp"
        if os.path.lexists(tmp_link):
            os.remove(tmp_link)
        os.symlink(f"releases/{latest}", tmp_link)
        os.replace(tmp_link, f"{ROOT}/current")
        for old in sorted(d for d in os.listdir(f"{ROOT}/releases") if not d.startswith("."))[:-3]:
            shutil.rmtree(f"{ROOT}/releases/{old}", ignore_errors=True)
        write_status(ok=True, run_id=latest, changed=True, files=len(manifest["files"]),
                     photos=images, photos_failed=failed)
        log(f"published {latest}")
        return 0
    except Exception as e:
        log(f"ERROR: {type(e).__name__}: {e}")
        write_status(ok=False, error=f"{type(e).__name__}: {str(e)[:300]}",
                     run_id=os.path.basename(os.path.realpath(f"{ROOT}/current")) if os.path.islink(f"{ROOT}/current") else None)
        return 1


if __name__ == "__main__":
    sys.exit(main())
