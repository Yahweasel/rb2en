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
const tableTableEnd = 0x23989c;

const rb2Exe = await fs.readFile("RB2.exe.bak");
const tableTable = rb2Exe.slice(tableTableStart, tableTableEnd);

const messageRb2 = await fs.readFile("Message.rb2.bak");

const strings = [];

/* The length of \u0001-based control sequences.
 * 1-control sequences go \u0001(type)(payload). This is the length of the
 * payload, based on the type. */
const controlLens = {
    0x43: 1,
    0x49: 0,
    0x4a: 0,
    0x53: 0,
};

for (let tti = 0; tti < tableTable.length; tti += 4) {
    // Bounds of this block
    const tableStart = tableTable.readUint32LE(tti);
    let blockEnd = messageRb2.length;
    if (tti < tableTable.length - 4)
        blockEnd = tableTable.readUint32LE(tti + 4);

    // Read each string set in this table
    const stringSetCount = messageRb2.readUint16LE(tableStart);
    for (let ssi = 0; ssi < stringSetCount; ssi++) {
        const stringSetStart = tableStart + messageRb2.readUint16LE(
            tableStart + 2 + 2*ssi
        );
        let stringSetEnd = blockEnd;
        if (ssi < stringSetCount - 1) {
            stringSetEnd = tableStart + messageRb2.readUint16LE(
                tableStart + 2 + 2*(ssi+1)
            );
        }
        const stringSet = messageRb2.slice(stringSetStart, stringSetEnd);

        // Read each string from within the string set
        let si = 0;
        for (let stringStart = 0; stringStart < stringSet.length;) {
            // Look for the end of this string
            let stringEnd = stringStart;
            let fiveTerm = false;
            for (; stringEnd < stringSet.length; stringEnd++) {
                if (
                    stringSet[stringEnd] === 0x05 &&
                    stringSet[stringEnd+1] === 0x05 &&
                    stringSet[stringEnd+2] === 0x05
                ) {
                    fiveTerm = true;
                    break;
                }
            }

            // Get the control sequence out of the beginning
            let controlEnd = stringStart;
            for (; controlEnd < stringEnd; controlEnd++) {
                if (stringSet[controlEnd] >= 0x80 || stringSet[controlEnd] === 0x1b) {
                    // Probably the start of Japanese text
                    break;

                } else if (stringSet[controlEnd] === 1) {
                    // Multi-byte control sequence
                    controlEnd++;
                    const next = stringSet[controlEnd];
                    const controlLen = controlLens[next];
                    if (typeof controlLen === "number")
                        controlEnd += controlLen;
                    controlEnd = Math.min(controlEnd, stringEnd - 1);

                } else if (stringSet[controlEnd] === 2) {
                    controlEnd++;

                }
            }

            // Look for infix control sequences
            let raw = stringSet.slice(controlEnd, stringEnd);
            let rawUncontrol = "";
            function hex(c) {
                return `%@${c.toString(16).padStart(2, "0")}`;
            }
            for (let ri = 0; ri < raw.length; ri++) {
                if (raw[ri] === 1) {
                    const next = raw[ri+1];
                    const controlLen = controlLens[next];
                    if (typeof controlLen === "number") {
                        rawUncontrol += "%@01" + hex(next);
                        ri += 2;
                        for (let ci = 0; ci < controlLen && ri < raw.length; ci++) {
                            rawUncontrol += hex(raw[ri]);
                            ri++;
                        }
                        ri--;

                    } else {
                        rawUncontrol += "%@01@@";

                    }

                } else if (raw[ri] === 2) {
                    rawUncontrol +=
                        "%@02" +
                        hex(raw[ri+1]);
                    ri++;

                } else {
                    rawUncontrol += String.fromCharCode(raw[ri]);

                }

            }
            rawUncontrol = Buffer.from(rawUncontrol, "binary");

            // Extract this string
            const prefix = stringSet.slice(stringStart, controlEnd);
            const ja = legacy.decode(rawUncontrol, "932");
            const sj = legacy.encode(ja, "932");
            const strDat = {
                file: "Message.rb2",
                tableNo: tti/4,
                stringSetNo: ssi,
                stringNo: si++,
                fiveTerm,
                start: stringSetStart + controlEnd,
                end: stringSetStart + stringEnd,
                prefix: prefix.toString("binary"),
                raw: raw.toString("binary"),
                rawUncontrol: rawUncontrol.toString("binary"),
                string: ja
            };

            if (rawUncontrol.toString("binary") !== sj.toString("binary")) {
                /* This is some kind of formatting data that's not a printable
                 * string. */
                strDat.en = "ERROR";
            }
            if (!/\p{Lo}/u.test(ja)) {
                // No need to involve AI in translating a string with no text
                strDat.en = ja;
            }
            strings.push(strDat);

            stringStart = stringEnd + (fiveTerm?3:0);
        }
    }
}

process.stdout.write(JSON.stringify(strings, null, 2));
process.stdout.write("\n");
