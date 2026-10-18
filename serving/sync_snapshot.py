#!/usr/bin/env python3
"""Pull the latest Odyssey JSON snapshot from a Databricks UC volume and publish it atomically.

Layout under DATA_ROOT:
  releases/<run_id>/...   verified snapshot files (last 3 kept)
  current -> releases/<run_id>   (symlink, swapped atomically)
  images/<id>-1600.webp, images/<id>-800.webp     photo cache, re-encoded to WebP, shared by all releases
  status.json             last sync result (read by the web app's Trust page)
Environment: DATABRICKS_HOST, DATABRICKS_TOKEN, ODYSSEY_CATALOG (default odyssey), DATA_ROOT (default /srv/odyssey).
Needs Pillow (Ubuntu: apt install python3-pil). Exit code 0 = up to date or published; 1 = failed (site keeps serving the previous release).
"""
import argparse
import glob
import io
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

try:
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 250_000_000  # large Commons originals are legitimate
except ImportError:
    Image = ImageOps = None

USER_AGENT = "OdysseySync/0.1 (https://aakashmanandhar.tech/odyssey)"
HOST = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
CATALOG = os.environ.get("ODYSSEY_CATALOG", "odyssey")
ROOT = os.environ.get("DATA_ROOT", "/srv/odyssey")
VOLUME = f"/Volumes/{CATALOG}/gold/exports"
MAX_BYTES = {1600: 700_000, 800: 250_000}  # WebP size caps per width


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


def thumb_url(src, width):
    """Wikimedia's resized rendition of an original upload, or None if src is already a thumbnail."""
    u = urllib.parse.urlparse(src)
    if u.netloc != "upload.wikimedia.org" or "/thumb/" in u.path:
        return None
    parts = u.path.split("/")  # ['', 'wikipedia', 'commons', 'c', 'c8', 'File.jpg']
    if len(parts) < 6 or parts[-1].lower().endswith((".tif", ".tiff")):
        return None
    name = parts[-1]
    suffix = ".png" if name.lower().endswith(".svg") else ""
    return f"{u.scheme}://{u.netloc}{'/'.join(parts[:3])}/thumb/{'/'.join(parts[3:])}/{width}px-{name}{suffix}"


def render(img_dir, img_id, src):
    """Write <id>-1600.webp and <id>-800.webp. Source: an already cached file, else the 1600px thumbnail, else the original."""
    out = {w: f"{img_dir}/{img_id}-{w}.webp" for w in (1600, 800)}
    if all(os.path.exists(p) for p in out.values()):
        return "cached"
    legacy = sorted(p for p in glob.glob(f"{img_dir}/{img_id}-*") if not p.endswith((".webp", ".tmp")))
    big = [p for p in legacy if os.path.basename(p).startswith(f"{img_id}-1600.")]
    if big:
        with open(big[0], "rb") as f:
            data = f.read()
    else:
        data = None
        t = thumb_url(src, 1600)
        if t:
            try:
                data = http(t, attempts=2, timeout=60)
            except Exception:
                data = None
        if data is None:
            data = http(src, attempts=3, timeout=90)
        time.sleep(0.2)
    im = Image.open(io.BytesIO(data))
    if im.format == "JPEG":
        im.draft("RGB", (3200, 3200))  # decode large JPEGs at reduced size: much faster, same result
    im = ImageOps.exif_transpose(im)
    alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if alpha else "RGB")
    for w, path in out.items():
        scale = min(1.0, w / im.width, w / im.height)  # limit the longest side, so portrait photos stay small too
        r = im if scale >= 1 else im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        cap = MAX_BYTES[w]
        for q in (80, 68, 55):  # step quality down only for unusually detailed photos
            r.save(path + ".tmp", "WEBP", quality=q, method=4)
            if os.path.getsize(path + ".tmp") <= cap:
                break
        os.replace(path + ".tmp", path)
    for p in legacy:
        os.remove(p)
    return "new"


def prune_images():
    """Delete photo files no kept release references, and any non-WebP leftovers. Never runs on an empty reference set."""
    used = {}
    for rel in os.listdir(f"{ROOT}/releases"):
        if not rel.startswith("."):
            for dirpath, _, files in os.walk(f"{ROOT}/releases/{rel}"):
                for name in files:
                    if name.endswith(".json"):
                        with open(os.path.join(dirpath, name), encoding="utf-8") as f:
                            collect_images(json.load(f), used)
    if not used:
        return 0
    img_dir, removed = f"{ROOT}/images", 0
    for name in os.listdir(img_dir):
        if name.endswith(".tmp"):
            continue
        if not name.endswith(".webp") or name.split("-", 1)[0] not in used:
            os.remove(os.path.join(img_dir, name))
            removed += 1
    return removed


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
        try:
            new += render(img_dir, img_id, src) == "new"
        except Exception as e:
            failed += 1
            if failed <= 5:
                log(f"photo {img_id} failed: {type(e).__name__}: {str(e)[:120]}")
    return len(found), new, failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-images", type=int, default=None, help="limit photo downloads (for testing)")
    ap.add_argument("--force", action="store_true", help="re-publish even if LATEST is unchanged")
    args = ap.parse_args()
    if not HOST or not TOKEN:
        log("ERROR: DATABRICKS_HOST and DATABRICKS_TOKEN must be set")
        return 1
    if Image is None:
        log("ERROR: Pillow is not installed (Ubuntu: apt install python3-pil)")
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
        pruned = prune_images()
        write_status(ok=True, run_id=latest, changed=True, files=len(manifest["files"]),
                     photos=images, photos_failed=failed)
        log(f"published {latest} ({pruned} unused photo files removed)")
        return 0
    except Exception as e:
        log(f"ERROR: {type(e).__name__}: {e}")
        write_status(ok=False, error=f"{type(e).__name__}: {str(e)[:300]}",
                     run_id=os.path.basename(os.path.realpath(f"{ROOT}/current")) if os.path.islink(f"{ROOT}/current") else None)
        return 1


if __name__ == "__main__":
    sys.exit(main())
