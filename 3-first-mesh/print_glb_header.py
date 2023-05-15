#!/usr/bin/env python3

import sys
import json
import struct

if len(sys.argv) == 1:
    print("Usage: ./print_glb_header.py <file.glb>")
    sys.exit(1)

glbFile = sys.argv[1]
with open(glbFile, "rb") as f:
    content = f.read()
    # Read the glB and JSON headers. glB is little endian
    # glB header:
    # - magic: u32 (expect: 0x46546C67)
    # - version: u32 (expect: 2)
    # - length: u32 (size of the entire file, in bytes)
    # JSON chunk header
    # - chunkLength: u32 (size of the chunk, in bytes)
    # - chunkType: u32 (expect: 0x4E4F534A for the JSON chunk)
    header = struct.unpack("<IIIII", content[0:20])

    if header[0] != 0x46546C67:
        print("The provided file does not appear to be a glB file")
        sys.exit(1)
    if header[1] != 2:
        print("The provided file is not glTF version 2")
        sys.exit(1)
    if header[4] != 0x4E4F534A:
        print("Invalid glB: The first chunk of the glB file is not a JSON chunk!")
        sys.exit(1)

    # Now read the JSON chunk out of the file and print it to show the glB JSON header
    jsonChunk = json.loads(content[20:20+header[3]]);
    print(json.dumps(jsonChunk, indent=2))

