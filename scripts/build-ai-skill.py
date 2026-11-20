"""Package the planner's shared offline helpers for Gemini and ChatGPT."""
import argparse
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
SKILL = "route-planner"
FILES = {
    "SKILL.md": "ai/SKILL.md",
    "scripts/route.js": "scripts/ai-route-cli.js",
    "data/netanya-addresses.json": "data/netanya-addresses.json",
    "data/README.md": "data/README.md",
}
for module in ("ai-route", "optimizer", "address-reference", "road-table", "routing"):
    FILES[f"src/{module}.js"] = f"src/{module}.js"


def contents(chatgpt):
    prefix = f"skills/{SKILL}/" if chatgpt else ""
    paths = {prefix + path: source for path, source in FILES.items()}
    if chatgpt:
        paths["plugin.json"] = "ai/plugin.json"
    # Normalize checked-out Windows and Unix line endings for a portable artifact.
    return {path: (ROOT / source).read_text(encoding="utf-8").encode("utf-8")
            for path, source in sorted(paths.items())}


def package(path, members, check):
    if check:
        with ZipFile(path) as archive:
            if (archive.namelist() != list(members)
                    or any(archive.read(name) != data for name, data in members.items())):
                raise SystemExit(f"Stale skill package: {path.name}. Run python scripts/build-ai-skill.py")
        return
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, body in members.items():
            entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, body, compress_type=ZIP_DEFLATED, compresslevel=9)
    path.write_bytes(output.getvalue())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the public instructions and both packages match the source")
    args = parser.parse_args()
    guide = ROOT / "ai" / f"{SKILL}.txt"
    source = (ROOT / FILES["SKILL.md"]).read_text(encoding="utf-8")
    metadata, separator, body = source.partition("\n---\n")
    if not separator or not metadata.startswith("---\n"):
        raise SystemExit("Expected YAML front matter in SKILL.md")
    # Publish the body as a static asset so GitHub Pages serves its text verbatim.
    instructions = body.lstrip("\n")
    if args.check:
        if not guide.exists() or guide.read_text(encoding="utf-8") != instructions:
            raise SystemExit(f"Stale instructions: {guide.name}. Run python scripts/build-ai-skill.py")
    else:
        guide.write_bytes(instructions.encode("utf-8"))
    print(f"{'Verified' if args.check else 'Built'} {guide.name}")
    for target in ("gemini", "chatgpt"):
        path = ROOT / "ai" / f"{SKILL}-{target}.zip"
        package(path, contents(target == "chatgpt"), args.check)
        print(f"{'Verified' if args.check else 'Built'} {path.name}")
