"""Combine a verified Electron runtime and the prepared reader on any build host."""

import posixpath
import stat
import sys
import tarfile
import zipfile
from copy import copy
from io import BytesIO
from pathlib import Path, PurePosixPath
from shutil import copyfileobj


LINUX_EXECUTABLE = "ai-embedded-paper-pdf-reader"
MAC_EXECUTABLE = "Electron.app/Contents/MacOS/Electron"
MAC_LAUNCHER = """#!/bin/sh
set -eu
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec "$directory/Electron.app/Contents/MacOS/Electron" "$directory/resources/app" "$@"
"""


def runtime_entries(archive):
    for entry in archive.infolist():
        path = PurePosixPath(entry.filename)
        if not path.parts or path.is_absolute() or ".." in path.parts or "\\" in entry.filename or ":" in entry.filename:
            raise ValueError(f"Invalid Electron archive path: {entry.filename}")
        mode = entry.external_attr >> 16
        kind = stat.S_IFMT(mode)
        if kind not in (0, stat.S_IFREG, stat.S_IFDIR, stat.S_IFLNK):
            raise ValueError(f"Invalid Electron archive entry: {entry.filename}")
        link = None
        if kind == stat.S_IFLNK:
            link = archive.read(entry).decode("utf-8")
            resolved = posixpath.normpath(posixpath.join(path.parent.as_posix(), link))
            if not link or link.startswith("/") or resolved == ".." or resolved.startswith("../"):
                raise ValueError(f"Invalid Electron archive link: {entry.filename}")
        yield entry, path.as_posix(), mode, link


def reader_files(stage):
    for path in sorted(stage.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Unexpected link in reader files: {path}")
        if path.is_file():
            yield path, path.relative_to(stage).as_posix()


def add_tar_file(archive, name, size, file, mode=0o644):
    entry = tarfile.TarInfo(name)
    entry.mode = mode
    entry.size = size
    archive.addfile(entry, file)


def package_linux(runtime, stage, output, stem):
    guide = f"""{stem}

在 Linux 上完整解压，运行目录内的 {LINUX_EXECUTABLE}。
在终端中可运行 ./{LINUX_EXECUTABLE}。精简 Linux 系统需要图形桌面及 GTK 3、NSS、NSPR 和 ALSA。
个人资料位于 ~/.config/MarginChat（设置 XDG_CONFIG_HOME 时使用该目录）。

Extract on Linux and run ./{LINUX_EXECUTABLE} inside the extracted folder.
A minimal Linux install needs a graphical desktop, GTK 3, NSS, NSPR and ALSA.
Profiles are saved in ~/.config/MarginChat
or under XDG_CONFIG_HOME when it is set.
""".encode("utf-8")
    with tarfile.open(output, "w:gz", compresslevel=5) as archive:
        for source, name, mode, link in runtime_entries(runtime):
            if name == "resources/default_app.asar":
                continue
            if name == "electron":
                name = LINUX_EXECUTABLE
            path = f"{stem}/{name}"
            if source.is_dir() or link is not None:
                entry = tarfile.TarInfo(path)
                entry.type = tarfile.SYMTYPE if link is not None else tarfile.DIRTYPE
                entry.linkname = link or ""
                entry.mode = (mode & 0o777) or 0o755
                archive.addfile(entry)
            else:
                with runtime.open(source) as file:
                    add_tar_file(archive, path, source.file_size, file, (mode & 0o777) or 0o644)
        for path, name in reader_files(stage):
            with path.open("rb") as file:
                add_tar_file(archive, f"{stem}/resources/app/{name}", path.stat().st_size, file)
        add_tar_file(archive, f"{stem}/START-HERE.txt", len(guide), BytesIO(guide))


def zip_file(name, mode=0o644):
    entry = zipfile.ZipInfo(name)
    entry.create_system = 3
    entry.external_attr = (stat.S_IFREG | mode) << 16
    entry.compress_type = zipfile.ZIP_DEFLATED
    return entry


def package_mac(runtime, stage, output, stem):
    guide = f"""{stem}

完整解压后，在访达双击 “Start Reader.command”。请保留同目录的 Electron.app 和 resources。
此为小范围便携试用版。
个人资料保存在 ~/Library/Application Support/MarginChat。

Fully extract the ZIP and open Start Reader.command. Keep Electron.app and resources
in the same folder. This is a portable preview for small-group testing.
Profiles live in ~/Library/Application Support/MarginChat.
"""
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for source, name, _, _ in runtime_entries(runtime):
            entry = copy(source)
            entry.filename = f"{stem}/{name}" + ("/" if source.is_dir() else "")
            entry.orig_filename = entry.filename
            # The new headers have different offsets. Preserve Unix modes and
            # link contents while allowing zipfile to write its own metadata.
            entry.extra = b""
            with runtime.open(source) as original, archive.open(entry, "w") as target:
                copyfileobj(original, target)
        for path, name in reader_files(stage):
            with path.open("rb") as source, archive.open(zip_file(f"{stem}/resources/app/{name}"), "w") as target:
                copyfileobj(source, target)
        archive.writestr(zip_file(f"{stem}/Start Reader.command", 0o755), MAC_LAUNCHER)
        archive.writestr(zip_file(f"{stem}/START-HERE.txt"), guide)


def main():
    platform, runtime_path, stage, output, stem = sys.argv[1:]
    if platform not in {"linux", "darwin"}:
        raise ValueError(f"Unsupported platform: {platform}")
    with zipfile.ZipFile(runtime_path) as runtime:
        executable = runtime.getinfo("electron" if platform == "linux" else MAC_EXECUTABLE)
        if not (executable.external_attr >> 16) & stat.S_IXUSR:
            raise ValueError("Electron runtime is missing Unix executable permissions")
        package = package_linux if platform == "linux" else package_mac
        package(runtime, Path(stage), Path(output), stem)


if __name__ == "__main__":
    main()
