#!/usr/bin/env python3
"""Normalize an existing character image into a transparent 512x512 avatar.

This script never generates or redraws image content. With --remove-background it
uses rembg locally, downsizing the working input first to keep memory bounded.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--crop-height", type=float, default=0.92)
    parser.add_argument("--remove-background", action="store_true")
    parser.add_argument("--working-size", type=int, default=1024)
    parser.add_argument("--model", default="u2netp")
    parser.add_argument(
        "--fit-mode",
        choices=("contain", "width"),
        default="contain",
        help="Use width to let tall busts continue naturally past the canvas bottom.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    image = Image.open(args.source).convert("RGBA")

    if args.remove_background:
        from rembg import new_session, remove

        image.thumbnail(
            (args.working_size, args.working_size), Image.Resampling.LANCZOS
        )
        image = remove(image.convert("RGB"), session=new_session(args.model)).convert(
            "RGBA"
        )

    alpha = image.getchannel("A")
    bounds = alpha.point(lambda value: 255 if value > 18 else 0).getbbox()
    if not bounds:
        raise RuntimeError(f"No foreground detected in {args.source}")

    image = image.crop(bounds)
    crop_height = max(1, round(image.height * args.crop_height))
    image = image.crop((0, 0, image.width, crop_height))

    bounds = image.getchannel("A").point(
        lambda value: 255 if value > 18 else 0
    ).getbbox()
    if bounds:
        image = image.crop(bounds)

    scale = (
        448 / image.width
        if args.fit_mode == "width"
        else min(448 / image.width, 448 / image.height)
    )
    target_size = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    image = image.resize(target_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    position = ((512 - image.width) // 2, max(22, (512 - image.height) // 2))
    visible_height = min(image.height, 512 - position[1])
    canvas.alpha_composite(image.crop((0, 0, image.width, visible_height)), position)

    args.destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.destination, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
