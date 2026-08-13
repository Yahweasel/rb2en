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

const config = JSON.parse(await fs.readFile("config.json", "utf8"));

const TEMPERATURE = +process.argv[2] || 0;

const strings = JSON.parse(await fs.readFile("strings.json", "utf8"));


let messages = [
    {
        role: "user",
        content: `I am going to give you a sequence of ${config.language} strings from a video game. Please translate them into English. Include only the translation in your messages, no other context.${config.suffix||""} If a given string seems to be gibberish, it may have been extracted incorrectly; in that case, respond with \`{"string": "ERROR"}\`. Because the strings are going to be replaced in the binary, your translations need to be short enough to be encoded in the same space; if a translation is too long, I'll request that you make it shorter. Do you understand?`
    }
];
const req = {
    messages,
    seed: 1,
    temperature: TEMPERATURE
};
Object.assign(req, config.openaiCompletion || {});
{
    const f = await fetch(`${config.openai.host}/v1/chat/completions`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(req)
    });
    const completion = await f.json();
    messages.push(completion.choices[0].message);
}

req.response_format = {
    type: "json_schema",
    json_schema: {
        schema: {
            type: "object",
            properties: {
                string: {type: "string"}
            },
            required: ["string"]
        },
        strict: true
    }
};

for (const string of strings) {
    if (
        string.file !== "Message.rb2" ||
        string.tableNo !== 4
    ) {
        continue;
    }

    let en = string.en2 || string.en;
    if (en === "ERROR")
        continue;

    messages = req.messages = messages.slice(0, 2);
    messages.push({
        role: "user",
        content: JSON.stringify({string: string.string})
    }, {
        role: "assistant",
        content: JSON.stringify({string: en})
    }, {
        role: "user",
        content: "Too long. Shorten and/or abbreviate."
    });

    console.log(`\n${string.string}\n =>\n${en}`);

    let completion;
    {
        const f = await fetch(`${config.openai.host}/v1/chat/completions`, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify(req)
        });
        completion = await f.json();
    }

    let ret = completion.choices[0].message;
    ret = JSON.parse(ret.content);
    string.en2 = ret.string
        .replace(/  */g, " ")
        .replace(/  *\n/g, "\n")
        .replace(/  *\r\n/g, "\r\n");
    console.log(` =>\n${string.en2}`);

    await fs.writeFile("strings.json.tmp", JSON.stringify(strings, null, 2));
    await fs.rename("strings.json.tmp", "strings.json");
}
