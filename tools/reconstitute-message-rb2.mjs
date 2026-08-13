#!/usr/bin/env node
/*
 * Copyright (c) 2026 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

import * as fs from "fs/promises";

import * as legacy from "legacy-encoding";

const tableTableStart = 0x239868;

const rb2Exe = await fs.readFile("RB2.exe");

const strings = JSON.parse(await fs.readFile("strings.json", "utf8"));

// Encode a string and fix its %@ escapes
function encode(string) {
    let en = string.en2 || string.en || string.string;
    if (en === "ERROR")
        en = string.string;
    const encRaw = legacy.encode(en, "932");
    const enc = [];
    for (let ei = 0; ei < encRaw.length; ei++) {
        const ec = encRaw[ei];
        if (ec === 0x25 /* % */ && encRaw[ei+1] === 0x40 /* @ */) {
            enc.push(parseInt(encRaw.slice(ei+2, ei+4).toString("utf8"), 16));
            ei += 3;
            continue;
        }
        enc.push(ec);
    }
    return Buffer.concat([
        Buffer.from(string.prefix || "", "binary"),
        Buffer.from(enc)
    ]);
}

// Figure out how many strings there are per table
const stringsPerTable = Object.create(null);
for (const string of strings) {
    if (typeof string.tableNo === "undefined")
        continue;

    const tableNo = string.tableNo;
    const stringSetNo = string.stringSetNo;

    if (typeof stringsPerTable[tableNo] === "undefined")
        stringsPerTable[tableNo] = 0;

    stringsPerTable[tableNo] = Math.max(stringsPerTable[tableNo], stringSetNo + 1);
}

// And the string lengths
const stringLensPerTable = Object.create(null);
const stringLensPerString = Object.create(null);
for (const string of strings) {
    if (typeof string.tableNo === "undefined")
        continue;

    const tableNo = string.tableNo;
    const stringSetNo = string.stringSetNo;
    const en = encode(string);

    let len = en.length;
    if (string.fiveTerm)
        len += 3;

    if (typeof stringLensPerTable[tableNo] === "undefined")
        stringLensPerTable[tableNo] = 0;
    if (typeof stringLensPerString[tableNo] === "undefined")
        stringLensPerString[tableNo] = Object.create(null);
    if (typeof stringLensPerString[tableNo][stringSetNo] === "undefined")
        stringLensPerString[tableNo][stringSetNo] = 0;

    stringLensPerTable[tableNo] += len;
    stringLensPerString[tableNo][stringSetNo] += len;
}

// Open the new Message.rb2
let messageRb2;
{
    const fh = await fs.open("Message.rb2", "w");
    messageRb2 = fh.createWriteStream();
}

// And write it
let offset = 0;
let lastTable = -1;
for (const string of strings) {
    if (typeof string.tableNo === "undefined")
        continue;

    const tableNo = string.tableNo;
    if (tableNo !== lastTable) {
        // Start a fresh table
        console.log(`table ${tableNo}`);
        rb2Exe.writeUint32LE(offset, tableTableStart + 4*tableNo);

        {
            const ct = Buffer.alloc(2);
            ct.writeUint16LE(stringsPerTable[tableNo]);
            messageRb2.write(ct);
            offset += 2;
        }
        let sOff = 2 + 2*stringsPerTable[tableNo];
        for (let si = 0; si < stringsPerTable[tableNo]; si++) {
            const part = Buffer.alloc(2);
            part.writeUint16LE(sOff);
            messageRb2.write(part);
            offset += 2;
            sOff += stringLensPerString[tableNo][si];
        }
        lastTable = tableNo;
    }

    // Everything else should be in order, so just write this string
    const en = encode(string);
    messageRb2.write(en);
    offset += en.length;

    if (string.fiveTerm) {
        messageRb2.write("\x05\x05\x05");
        offset += 3;
    }
}

await fs.writeFile("RB2.exe", rb2Exe);
