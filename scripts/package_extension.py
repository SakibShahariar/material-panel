#!/usr/bin/env python3
"""Build a reproducible GNOME Shell extension ZIP from the runtime source tree."""

from __future__ import annotations

import argparse
import json
import re
import stat
import zipfile
from pathlib import Path

UUID = "material-panel@SakibShahariar"
VERSION_PATTERN = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")
ROOT_FILES = ("extension.js", "prefs.js", "stylesheet.css", "metadata.json")
RUNTIME_DIRECTORIES = ("lib", "modules", "assets")


def collect_runtime_files(root: Path) -> list[Path]:
    files = [root / name for name in ROOT_FILES]
    for directory in RUNTIME_DIRECTORIES:
        path = root / directory
        if path.is_dir():
            files.extend(
                item for item in path.rglob("*")
                if item.is_file() and not item.is_symlink()
                and "__pycache__" not in item.parts
                and item.suffix != ".pyc"
            )

    missing = [str(path.relative_to(root)) for path in files if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing runtime files: " + ", ".join(missing))

    return sorted(files, key=lambda path: path.relative_to(root).as_posix())


def build_package(root: Path, output: Path, version: str) -> Path:
    if not VERSION_PATTERN.fullmatch(version):
        raise ValueError("Version must use vMAJOR.MINOR.PATCH (for example, v1.0.0)")

    metadata_path = root / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("uuid") != UUID:
        raise ValueError(f"metadata.json UUID must be {UUID!r}")

    runtime_files = collect_runtime_files(root)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source in runtime_files:
            relative = source.relative_to(root).as_posix()
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="Release tag, e.g. v1.0.0")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--output-dir", type=Path, default=Path("dist"))
    args = parser.parse_args()

    output = args.output_dir / f"{UUID}-{args.version}.shell-extension.zip"
    build_package(args.root.resolve(), output, args.version)
    print(output)


if __name__ == "__main__":
    main()
