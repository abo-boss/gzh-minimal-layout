#!/usr/bin/env python3
"""Deterministic DOCX -> Markdown draft extractor for the normalize command."""

import argparse
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def heading_styles(archive):
    levels = {}
    try:
        root = ET.fromstring(archive.read("word/styles.xml"))
    except KeyError:
        return levels
    for style in root.iter(f"{W}style"):
        sid = style.get(f"{W}styleId") or ""
        name = style.find(f"{W}name")
        label = name.get(f"{W}val") if name is not None else ""
        match = re.search(r"(?:heading|标题)\s*([1-6])", label or "", re.I) or re.fullmatch(r"([1-6])", sid)
        if match:
            levels[sid] = int(match.group(1))
    return levels


def media_relationships(archive):
    rels = {}
    try:
        root = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
    except KeyError:
        return rels
    for relation in root:
        target = relation.get("Target") or ""
        if "media/" in target:
            rels[relation.get("Id")] = "word/" + target.lstrip("/").replace("../", "")
    return rels


def paragraph_text(paragraph):
    parts = []
    for run in paragraph.iter(f"{W}r"):
        props = run.find(f"{W}rPr")
        bold = props is not None and props.find(f"{W}b") is not None
        underline = props is not None and props.find(f"{W}u") is not None
        text = "".join(item.text or "" for item in run.iter(f"{W}t"))
        if not text:
            continue
        if bold:
            text = f"**{text}**"
        if underline:
            text = f"<u>{text}</u>"
        parts.append(text)
    return re.sub(r"\*\*\*\*", "", "".join(parts)).strip()


def markdown_table(table):
    rows = []
    for row in table.findall(f"{W}tr"):
        cells = ["".join(item.text or "" for item in cell.iter(f"{W}t")).strip().replace("|", "\\|") or " " for cell in row.findall(f"{W}tc")]
        if cells:
            rows.append(cells)
    if not rows:
        return []
    width = len(rows[0])
    return ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width] + ["| " + " | ".join(row) + " |" for row in rows[1:]]


def extract(input_path, output_path):
    try:
        archive = zipfile.ZipFile(input_path)
        document = ET.fromstring(archive.read("word/document.xml"))
    except (zipfile.BadZipFile, KeyError, ET.ParseError) as error:
        raise RuntimeError(f"invalid DOCX: {error}") from error
    heading_of = heading_styles(archive)
    media_of = media_relationships(archive)
    out_dir = os.path.dirname(os.path.abspath(output_path))
    image_dir = os.path.join(out_dir, "images")
    lines, image_number = [], 0
    body = document.find(f"{W}body")
    for element in body:
        if element.tag == f"{W}tbl":
            lines.extend(markdown_table(element)); lines.append(""); continue
        if element.tag != f"{W}p":
            continue
        for image in element.iter(f"{A}blip"):
            source = media_of.get(image.get(f"{R}embed"))
            if not source:
                continue
            os.makedirs(image_dir, exist_ok=True); image_number += 1
            name = f"{image_number:02d}-" + os.path.basename(source)
            with open(os.path.join(image_dir, name), "wb") as handle:
                handle.write(archive.read(source))
            lines.extend([f"![](images/{name})", ""])
        text = paragraph_text(element)
        if not text:
            continue
        props = element.find(f"{W}pPr")
        style = props.find(f"{W}pStyle") if props is not None else None
        style_id = style.get(f"{W}val") if style is not None else ""
        level = heading_of.get(style_id)
        is_list = props is not None and props.find(f"{W}numPr") is not None or bool(re.search(r"list|列表", style_id or "", re.I))
        if level:
            lines.append("#" * level + " " + re.sub(r"^\*\*(.*)\*\*$", r"\1", text))
        elif is_list:
            lines.append("- " + text)
        else:
            lines.append(text)
        lines.append("")
    with open(output_path, "w", encoding="utf-8") as output:
        output.write("\n".join(lines).rstrip() + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        extract(args.input, args.output)
    except Exception as error:
        print(f"DOCX normalization failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
